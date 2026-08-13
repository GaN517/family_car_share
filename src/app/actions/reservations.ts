'use server';

import { adminDb, adminAuth, Timestamp, FieldValue } from '@/lib/firebase-admin';
import { sendInviteEmail } from '@/lib/email';
import { formatCalendarTemplate, generateGoogleCalendarUrl } from '@/lib/utils';
import { revalidatePath } from 'next/cache';

interface ReservationInput {
  vehicle_id: string;
  start_time: string;
  end_time: string;
  invited_emails: string[];
  destination?: string;
  purpose?: string;
}

/**
 * ID トークンを検証し、UID を取得します。
 */
async function verifyUser(idToken: string) {
  if (!idToken) {
    throw new Error('認証トークンが必要です。ログインし直してください。');
  }
  const decodedToken = await adminAuth.verifyIdToken(idToken);
  return decodedToken.uid;
}

/**
 * 予約を作成します。重複を防止しつつ安全に書き込みます。
 */
export async function createReservation(input: ReservationInput, idToken: string) {
  try {
    const uid = await verifyUser(idToken);

    const startDateTime = new Date(input.start_time);
    const endDateTime = new Date(input.end_time);

    if (startDateTime.getTime() >= endDateTime.getTime()) {
      return { success: false, error: '開始時間は終了時間より前に設定してください。' };
    }

    const startTimestamp = Timestamp.fromDate(startDateTime);
    const endTimestamp = Timestamp.fromDate(endDateTime);

    // ユーザープロフィールの取得
    const profileSnap = await adminDb.collection('profiles').doc(uid).get();
    if (!profileSnap.exists) {
      return { success: false, error: 'ユーザープロフィールが見つかりません。設定画面から再度ログインしてください。' };
    }

    const profileData = profileSnap.data()!;
    const groupId = profileData.group_id;
    const userName = profileData.name || '不明なユーザー';

    if (!groupId) {
      return { success: false, error: 'グループに所属していません。設定画面からグループを作成または参加してください。' };
    }

    // 車両情報の取得
    const vehicleSnap = await adminDb.collection('vehicles').doc(input.vehicle_id).get();
    if (!vehicleSnap.exists) {
      return { success: false, error: '指定された車両が見つかりません。' };
    }

    const vehicleData = vehicleSnap.data()!;
    const vehicleName = vehicleData.name || '車両';

    // 重複チェック: 前後2日間に絞り込んでチェック
    const twoDaysAgo = new Date(startDateTime);
    twoDaysAgo.setDate(startDateTime.getDate() - 2);
    const twoDaysLater = new Date(startDateTime);
    twoDaysLater.setDate(startDateTime.getDate() + 2);

    const resSnap = await adminDb.collection('reservations')
      .where('vehicle_id', '==', input.vehicle_id)
      .where('start_time', '>=', Timestamp.fromDate(twoDaysAgo))
      .where('start_time', '<=', Timestamp.fromDate(twoDaysLater))
      .get();

    const hasConflict = resSnap.docs.some((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = doc.data();
      const existingStart = (data.start_time as Timestamp).toDate().getTime();
      const existingEnd = (data.end_time as Timestamp).toDate().getTime();
      return !(startDateTime.getTime() >= existingEnd || endDateTime.getTime() <= existingStart);
    });

    if (hasConflict) {
      return { success: false, error: '指定された時間帯にはすでに他の予約が入っています。' };
    }

    // グループテンプレート設定の取得
    const groupSnap = await adminDb.collection('groups').doc(groupId).get();
    const groupData = groupSnap.data();

    const titleTemplate = groupData?.calendar_title_template || '[車共有] {vehicle_name}の予約 - {user_name}';
    const descTemplate = groupData?.calendar_description_template || '予約者: {user_name}\n行き先: {destination}\n目的: {purpose}\n同乗者: {invited_emails}';

    // 予約ドキュメントの新規作成
    const newReservationRef = adminDb.collection('reservations').doc();
    await newReservationRef.set({
      vehicle_id: input.vehicle_id,
      user_id: uid,
      start_time: startTimestamp,
      end_time: endTimestamp,
      invited_emails: input.invited_emails || [],
      destination: input.destination || '',
      purpose: input.purpose || '',
      created_at: FieldValue.serverTimestamp(),
    });

    // カレンダー連携 URL の生成
    const invitedListStr = (input.invited_emails || []).join(', ');
    const calTitle = formatCalendarTemplate(titleTemplate, {
      vehicle_name: vehicleName,
      user_name: userName,
      invited_emails: invitedListStr,
      destination: input.destination,
      purpose: input.purpose,
    });
    const calDesc = formatCalendarTemplate(descTemplate, {
      vehicle_name: vehicleName,
      user_name: userName,
      invited_emails: invitedListStr,
      destination: input.destination,
      purpose: input.purpose,
    });
    const googleCalendarUrl = generateGoogleCalendarUrl({
      title: calTitle,
      description: calDesc,
      location: input.destination,
      startTime: input.start_time,
      endTime: input.end_time,
    });

    // 招待メール送信
    if (input.invited_emails && input.invited_emails.length > 0) {
      sendInviteEmail({
        invitedEmails: input.invited_emails,
        vehicleName: vehicleName,
        userName: userName,
        startTime: input.start_time,
        endTime: input.end_time,
        title: calTitle,
        description: calDesc,
      }).catch(err => console.error('バックグラウンドメール送信エラー:', err));
    }

    revalidatePath('/');
    return { success: true, data: { id: newReservationRef.id, googleCalendarUrl } };
  } catch (error: any) {
    console.error('予約作成 Server Action エラー:', error);
    return { success: false, error: error.message || '予約の作成中にエラーが発生しました。' };
  }
}

/**
 * 予約を更新します。
 */
export async function updateReservation(id: string, input: ReservationInput, idToken: string) {
  try {
    const uid = await verifyUser(idToken);
    const startDateTime = new Date(input.start_time);
    const endDateTime = new Date(input.end_time);

    if (startDateTime.getTime() >= endDateTime.getTime()) {
      return { success: false, error: '開始時間は終了時間より前に設定してください。' };
    }

    const reservationRef = adminDb.collection('reservations').doc(id);
    const resSnap = await reservationRef.get();

    if (!resSnap.exists) return { success: false, error: '変更対象の予約が見つかりません。' };
    if (resSnap.data()!.user_id !== uid) return { success: false, error: '他のユーザーの予約を変更する権限がありません。' };

    const twoDaysAgo = new Date(startDateTime);
    twoDaysAgo.setDate(startDateTime.getDate() - 2);
    const twoDaysLater = new Date(startDateTime);
    twoDaysLater.setDate(startDateTime.getDate() + 2);

    const conflictSnap = await adminDb.collection('reservations')
      .where('vehicle_id', '==', input.vehicle_id)
      .where('start_time', '>=', Timestamp.fromDate(twoDaysAgo))
      .where('start_time', '<=', Timestamp.fromDate(twoDaysLater))
      .get();

    const hasConflict = conflictSnap.docs.some((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      if (doc.id === id) return false;
      const data = doc.data();
      const existingStart = (data.start_time as Timestamp).toDate().getTime();
      const existingEnd = (data.end_time as Timestamp).toDate().getTime();
      return !(startDateTime.getTime() >= existingEnd || endDateTime.getTime() <= existingStart);
    });

    if (hasConflict) return { success: false, error: '指定された時間帯にはすでに他の予約が入っています。' };

    await reservationRef.update({
      vehicle_id: input.vehicle_id,
      start_time: Timestamp.fromDate(startDateTime),
      end_time: Timestamp.fromDate(endDateTime),
      invited_emails: input.invited_emails || [],
      destination: input.destination || '',
      purpose: input.purpose || '',
    });

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('予約更新 Server Action エラー:', error);
    return { success: false, error: error.message || '予約の更新中にエラーが発生しました。' };
  }
}

/**
 * 予約を削除します。
 */
export async function deleteReservation(id: string, idToken: string) {
  try {
    const uid = await verifyUser(idToken);

    const reservationRef = adminDb.collection('reservations').doc(id);
    const resSnap = await reservationRef.get();

    if (!resSnap.exists) return { success: false, error: '削除対象の予約が見つかりません。' };
    if (resSnap.data()!.user_id !== uid) return { success: false, error: '他のユーザーの予約を削除する権限がありません。' };

    await reservationRef.delete();

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('予約削除 Server Action エラー:', error);
    return { success: false, error: error.message || '予約の削除中にエラーが発生しました。' };
  }
}
