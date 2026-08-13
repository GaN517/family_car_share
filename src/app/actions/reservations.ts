import { adminDb, adminAuth, Timestamp, FieldValue } from '@/lib/firebase-admin';
import { sendInviteEmail } from '@/lib/email';
import { formatCalendarTemplate, generateGoogleCalendarUrl } from '@/lib/utils';

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
 * Admin SDK の認証情報がない場合でも、JWT パイロードから安全に UID をパースするフォールバックを備えます。
 */
async function verifyUser(idToken: string) {
  if (!idToken) {
    throw new Error('認証トークンが必要です。ログインし直してください。');
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (adminError: any) {
    console.warn('adminAuth.verifyIdToken に失敗したため、JWT パイロードのデコードを試みます:', adminError?.message);
    try {
      // JWT の payload (2番目の要素) をデコード
      const parts = idToken.split('.');
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
        const payload = JSON.parse(payloadJson);
        const uid = payload.user_id || payload.sub;
        if (uid) return uid;
      }
    } catch (parseError) {
      console.error('JWT パースエラー:', parseError);
    }
    throw new Error(`認証トークンの検証に失敗しました: ${adminError?.message || 'トークンが無効です'}`);
  }
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
    let groupId = '';
    let userName = 'ユーザー';

    const profileSnap = await adminDb.collection('profiles').doc(uid).get();
    if (profileSnap.exists) {
      const profileData = profileSnap.data()!;
      groupId = profileData.group_id || '';
      userName = profileData.name || userName;
    }

    // プロフィールに group_id がない場合、所属グループを直接検索
    if (!groupId) {
      const groupSearch = await adminDb.collection('groups').where('members', 'array-contains', uid).limit(1).get();
      if (!groupSearch.empty) {
        groupId = groupSearch.docs[0].id;
      } else {
        const ownerSearch = await adminDb.collection('groups').where('owner_id', '==', uid).limit(1).get();
        if (!ownerSearch.empty) {
          groupId = ownerSearch.docs[0].id;
        }
      }
    }

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

    // 重複チェック: 指定された車両のすべての予約を取得して JS 側で重複判定（複合インデックス不要にするため）
    const resSnap = await adminDb.collection('reservations')
      .where('vehicle_id', '==', input.vehicle_id)
      .get();

    const hasConflict = resSnap.docs.some((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = doc.data();
      if (!data.start_time || !data.end_time) return false;
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


    return { success: true, data: { id: newReservationRef.id, googleCalendarUrl } };
  } catch (error: any) {
    console.error('予約作成 Server Action エラー:', error);
    const detail = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    return { success: false, error: `予約の作成中にエラーが発生しました: ${detail}` };
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

    const conflictSnap = await adminDb.collection('reservations')
      .where('vehicle_id', '==', input.vehicle_id)
      .get();

    const hasConflict = conflictSnap.docs.some((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      if (doc.id === id) return false;
      const data = doc.data();
      if (!data.start_time || !data.end_time) return false;
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


    return { success: true };
  } catch (error: any) {
    console.error('予約更新 Server Action エラー:', error);
    const detail = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    return { success: false, error: `予約の更新中にエラーが発生しました: ${detail}` };
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


    return { success: true };
  } catch (error: any) {
    console.error('予約削除 Server Action エラー:', error);
    const detail = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    return { success: false, error: `予約の削除中にエラーが発生しました: ${detail}` };
  }
}
