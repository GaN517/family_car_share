import { NextRequest, NextResponse } from 'next/server';

// 動的インポートで firebase-admin の初期化エラーを安全にキャッチする
async function getFirebaseAdmin() {
  const { adminDb, adminAuth, Timestamp, FieldValue } = await import('@/lib/firebase-admin');
  return { adminDb, adminAuth, Timestamp, FieldValue };
}

async function verifyUser(idToken: string) {
  const { adminAuth } = await getFirebaseAdmin();
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return decoded.uid;
  } catch (e: any) {
    // Admin SDK の認証情報がない場合、JWT payload から uid を取得
    try {
      const parts = idToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        const uid = payload.user_id || payload.sub;
        if (uid) return uid;
      }
    } catch {}
    throw new Error(`認証に失敗しました: ${e?.message || 'トークンが無効です'}`);
  }
}

/**
 * 予約作成 API (POST)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 認証ヘッダー
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];

    // 2. リクエストボディ
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'リクエストの形式が不正です。' }, { status: 400 });
    }

    // 3. ユーザー認証
    let uid: string;
    try {
      uid = await verifyUser(idToken);
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 401 });
    }

    // 4. Firebase Admin 取得
    let adminDb: any, Timestamp: any, FieldValue: any;
    try {
      const fb = await getFirebaseAdmin();
      adminDb = fb.adminDb;
      Timestamp = fb.Timestamp;
      FieldValue = fb.FieldValue;
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `Firebase初期化エラー: ${e.message}` }, { status: 500 });
    }

    // 5. 入力検証
    const startDateTime = new Date(body.start_time);
    const endDateTime = new Date(body.end_time);
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      return NextResponse.json({ success: false, error: '日時の形式が不正です。' }, { status: 400 });
    }
    if (startDateTime >= endDateTime) {
      return NextResponse.json({ success: false, error: '開始時間は終了時間より前に設定してください。' });
    }

    // 6. プロフィール取得
    let groupId = '';
    let userName = 'ユーザー';
    try {
      const profileSnap = await adminDb.collection('profiles').doc(uid).get();
      if (profileSnap.exists) {
        const pd = profileSnap.data();
        groupId = pd?.group_id || '';
        userName = pd?.name || userName;
      }
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `プロフィール取得エラー: ${e.message}` }, { status: 500 });
    }

    // 7. グループ検索フォールバック
    if (!groupId) {
      try {
        const gs = await adminDb.collection('groups').where('members', 'array-contains', uid).limit(1).get();
        if (!gs.empty) {
          groupId = gs.docs[0].id;
        } else {
          const os = await adminDb.collection('groups').where('owner_id', '==', uid).limit(1).get();
          if (!os.empty) groupId = os.docs[0].id;
        }
      } catch (e: any) {
        return NextResponse.json({ success: false, error: `グループ検索エラー: ${e.message}` }, { status: 500 });
      }
    }
    if (!groupId) {
      return NextResponse.json({ success: false, error: 'グループに所属していません。設定画面からグループを作成または参加してください。' });
    }

    // 8. 車両情報取得
    let vehicleName = '車両';
    try {
      const vs = await adminDb.collection('vehicles').doc(body.vehicle_id).get();
      if (!vs.exists) {
        return NextResponse.json({ success: false, error: '指定された車両が見つかりません。' });
      }
      vehicleName = vs.data()?.name || vehicleName;
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `車両取得エラー: ${e.message}` }, { status: 500 });
    }

    // 9. 重複チェック
    try {
      const resSnap = await adminDb.collection('reservations').where('vehicle_id', '==', body.vehicle_id).get();
      const hasConflict = resSnap.docs.some((doc: any) => {
        const d = doc.data();
        if (!d.start_time || !d.end_time) return false;
        const es = d.start_time.toDate().getTime();
        const ee = d.end_time.toDate().getTime();
        return !(startDateTime.getTime() >= ee || endDateTime.getTime() <= es);
      });
      if (hasConflict) {
        return NextResponse.json({ success: false, error: '指定された時間帯にはすでに他の予約が入っています。' });
      }
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `重複チェックエラー: ${e.message}` }, { status: 500 });
    }

    // 10. 予約作成
    let reservationId = '';
    try {
      const ref = adminDb.collection('reservations').doc();
      await ref.set({
        vehicle_id: body.vehicle_id,
        user_id: uid,
        start_time: Timestamp.fromDate(startDateTime),
        end_time: Timestamp.fromDate(endDateTime),
        invited_emails: body.invited_emails || [],
        destination: body.destination || '',
        purpose: body.purpose || '',
        created_at: FieldValue.serverTimestamp(),
      });
      reservationId = ref.id;
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `予約書き込みエラー: ${e.message}` }, { status: 500 });
    }

    // 11. Google カレンダー URL 生成
    let googleCalendarUrl = '';
    try {
      const { formatCalendarTemplate, generateGoogleCalendarUrl } = await import('@/lib/utils');
      const groupSnap = await adminDb.collection('groups').doc(groupId).get();
      const gd = groupSnap.data();
      const titleTpl = gd?.calendar_title_template || '[車共有] {vehicle_name}の予約 - {user_name}';
      const descTpl = gd?.calendar_description_template || '予約者: {user_name}\\n行き先: {destination}\\n目的: {purpose}\\n同乗者: {invited_emails}';
      const inv = (body.invited_emails || []).join(', ');
      const vars = { vehicle_name: vehicleName, user_name: userName, invited_emails: inv, destination: body.destination, purpose: body.purpose };
      const calTitle = formatCalendarTemplate(titleTpl, vars);
      const calDesc = formatCalendarTemplate(descTpl, vars);
      googleCalendarUrl = generateGoogleCalendarUrl({ title: calTitle, description: calDesc, location: body.destination, startTime: body.start_time, endTime: body.end_time });
    } catch (e: any) {
      console.warn('カレンダーURL生成スキップ:', e.message);
    }

    // 12. メール送信（バックグラウンド）
    if (body.invited_emails?.length > 0) {
      import('@/lib/email').then(({ sendInviteEmail }) => {
        sendInviteEmail({
          invitedEmails: body.invited_emails,
          vehicleName,
          userName,
          startTime: body.start_time,
          endTime: body.end_time,
          title: `${vehicleName}の予約`,
          description: '',
        }).catch((err: any) => console.error('メール送信エラー:', err));
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, data: { id: reservationId, googleCalendarUrl } });

  } catch (error: any) {
    console.error('予約作成 API 未捕捉エラー:', error);
    return NextResponse.json({ success: false, error: `未捕捉エラー: ${error?.message || String(error)}` }, { status: 500 });
  }
}

/**
 * 予約更新 API (PUT)
 */
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];
    const body = await request.json();
    const { id, ...inputData } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: '予約IDが必要です。' }, { status: 400 });
    }

    const uid = await verifyUser(idToken);
    const { adminDb, Timestamp } = await getFirebaseAdmin();

    const startDateTime = new Date(inputData.start_time);
    const endDateTime = new Date(inputData.end_time);
    if (startDateTime >= endDateTime) {
      return NextResponse.json({ success: false, error: '開始時間は終了時間より前に設定してください。' });
    }

    const ref = adminDb.collection('reservations').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ success: false, error: '変更対象の予約が見つかりません。' });
    if (snap.data()!.user_id !== uid) return NextResponse.json({ success: false, error: '他のユーザーの予約を変更する権限がありません。' });

    // 重複チェック
    const cs = await adminDb.collection('reservations').where('vehicle_id', '==', inputData.vehicle_id).get();
    const conflict = cs.docs.some((d: any) => {
      if (d.id === id) return false;
      const data = d.data();
      if (!data.start_time || !data.end_time) return false;
      return !(startDateTime.getTime() >= data.end_time.toDate().getTime() || endDateTime.getTime() <= data.start_time.toDate().getTime());
    });
    if (conflict) return NextResponse.json({ success: false, error: '指定された時間帯にはすでに他の予約が入っています。' });

    await ref.update({
      vehicle_id: inputData.vehicle_id,
      start_time: Timestamp.fromDate(startDateTime),
      end_time: Timestamp.fromDate(endDateTime),
      invited_emails: inputData.invited_emails || [],
      destination: inputData.destination || '',
      purpose: inputData.purpose || '',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('予約更新 API エラー:', error);
    return NextResponse.json({ success: false, error: `更新エラー: ${error?.message || String(error)}` }, { status: 500 });
  }
}

/**
 * 予約削除 API (DELETE)
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: '予約IDが必要です。' }, { status: 400 });
    }

    const uid = await verifyUser(idToken);
    const { adminDb } = await getFirebaseAdmin();

    const ref = adminDb.collection('reservations').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ success: false, error: '削除対象の予約が見つかりません。' });
    if (snap.data()!.user_id !== uid) return NextResponse.json({ success: false, error: '他のユーザーの予約を削除する権限がありません。' });

    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('予約削除 API エラー:', error);
    return NextResponse.json({ success: false, error: `削除エラー: ${error?.message || String(error)}` }, { status: 500 });
  }
}
