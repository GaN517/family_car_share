import { NextRequest, NextResponse } from 'next/server';
import { adminDb, Timestamp } from '@/lib/firebase-admin';
import ical from 'ical-generator';
import { formatCalendarTemplate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * iCal (.ics) カレンダーフィード配信 API (Firebase 版)
 * GET /api/calendar/ics?token=[calendar_token]
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse('カレンダートークンが必要です。', { status: 400 });
  }

  try {
    // 1. トークンに合致するユーザープロフィールを取得
    const profileQuerySnap = await adminDb.collection('profiles')
      .where('calendar_token', '==', token)
      .limit(1)
      .get();

    if (profileQuerySnap.empty) {
      return new NextResponse('無効なトークンです。', { status: 401 });
    }

    const profileDoc = profileQuerySnap.docs[0];
    const profile = profileDoc.data();
    const groupId = profile.group_id;

    if (!groupId) {
      return new NextResponse('グループに所属していません。', { status: 400 });
    }

    // 2. グループ情報とカレンダーテンプレートを取得
    const groupRef = adminDb.collection('groups').doc(groupId);
    const groupSnap = await groupRef.get();
    
    if (!groupSnap.exists) {
      return new NextResponse('グループ情報が見つかりません。', { status: 404 });
    }

    const group = groupSnap.data()!;
    const titleTemplate = group.calendar_title_template || '[車共有] {vehicle_name}の予約 - {user_name}';
    const descTemplate = group.calendar_description_template || '予約者: {user_name}\n同乗者: {invited_emails}';

    // 3. グループに所属するメンバー全員のプロフィール情報を取得（予約者の名前解決用）
    const profilesSnap = await adminDb.collection('profiles')
      .where('group_id', '==', groupId)
      .get();
    
    const userMap: Record<string, string> = {};
    profilesSnap.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      userMap[doc.id] = doc.data().name || '不明なユーザー';
    });

    // 4. グループに所属する車両のリストを取得
    const vehiclesSnap = await adminDb.collection('vehicles')
      .where('group_id', '==', groupId)
      .get();

    if (vehiclesSnap.empty) {
      // 車両がない場合は空のカレンダーを即返却
      const cal = ical({ name: `${group.name || 'ファミリー'}の車共有カレンダー` });
      return new NextResponse(cal.toString(), {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="family-car-share-${groupId}.ics"`,
        },
      });
    }

    const vehicleMap: Record<string, string> = {};
    const vehicleIds: string[] = [];
    vehiclesSnap.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      vehicleMap[doc.id] = doc.data().name;
      vehicleIds.push(doc.id);
    });

    // 5. 車両 ID リストに合致する予約履歴を取得
    const resSnap = await adminDb.collection('reservations')
      .where('vehicle_id', 'in', vehicleIds)
      .get();

    // 6. iCal 生成
    const cal = ical({ name: `${group.name || 'ファミリー'}の車共有カレンダー` });

    resSnap.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const res = doc.data();
      const vehicleName = vehicleMap[res.vehicle_id] || '不明な車両';
      const userName = userMap[res.user_id] || '不明なユーザー';
      
      const startTime = (res.start_time as Timestamp).toDate();
      const endTime = (res.end_time as Timestamp).toDate();
      
      const invitedEmails = Array.isArray(res.invited_emails) ? res.invited_emails : [];
      const invitedListStr = invitedEmails.join(', ');

      const destination = res.destination || '';
      const purpose = res.purpose || '';

      const summary = formatCalendarTemplate(titleTemplate, {
        vehicle_name: vehicleName,
        user_name: userName,
        invited_emails: invitedListStr,
        destination,
        purpose,
      });

      const description = formatCalendarTemplate(descTemplate, {
        vehicle_name: vehicleName,
        user_name: userName,
        invited_emails: invitedListStr,
        destination,
        purpose,
      });

      cal.createEvent({
        id: doc.id,
        start: startTime,
        end: endTime,
        summary: summary,
        description: description,
        location: destination ? `${vehicleName} (${destination})` : vehicleName,
        timezone: 'Asia/Tokyo',
      });
    });

    return new NextResponse(cal.toString(), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="family-car-share-${groupId}.ics"`,
      },
    });
  } catch (error) {
    console.error('iCal フィード生成エラー:', error);
    return new NextResponse('カレンダーの生成に失敗しました。', { status: 500 });
  }
}
