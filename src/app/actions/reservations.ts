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
}

/**
 * ID トークンを検証し、UID を取得します。
 */
async function verifyUser(idToken: string) {
  if (!idToken) {
    throw new Error('認証トークンが必要です。');
  }
  const decodedToken = await adminAuth.verifyIdToken(idToken);
  return decodedToken.uid;
}

/**
 * 予約を作成します。Firestore トランザクションを用いて厳格に重複を防止します。
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

    const result = await adminDb.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
      // ユーザープロフィールの取得
      const profileRef = adminDb.collection('profiles').doc(uid);
      const profileSnap = await transaction.get(profileRef);

      if (!profileSnap.exists) {
        throw new Error('ユーザープロフィールが見つかりません。');
      }

      const profileData = profileSnap.data()!;
      const groupId = profileData.group_id;
      const userName = profileData.name || '不明なユーザー';

      if (!groupId) {
        throw new Error('グループに所属していません。設定画面からグループを作成または参加してください。');
      }

      // 車両情報の取得
      const vehicleRef = adminDb.collection('vehicles').doc(input.vehicle_id);
      const vehicleSnap = await transaction.get(vehicleRef);

      if (!vehicleSnap.exists) {
        throw new Error('指定された車両が見つかりません。');
      }

      const vehicleData = vehicleSnap.data()!;
      const vehicleName = vehicleData.name || '車両';

      // 重複チェック: 前後2日間に絞り込み
      const twoDaysAgo = new Date(startDateTime);
      twoDaysAgo.setDate(startDateTime.getDate() - 2);
      const twoDaysLater = new Date(startDateTime);
      twoDaysLater.setDate(startDateTime.getDate() + 2);

      const resQuery = adminDb.collection('reservations')
        .where('vehicle_id', '==', input.vehicle_id)
        .where('start_time', '>=', Timestamp.fromDate(twoDaysAgo))
        .where('start_time', '<=', Timestamp.fromDate(twoDaysLater));

      const resQuerySnap = await transaction.get(resQuery);

      const hasConflict = resQuerySnap.docs.some((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const data = doc.data();
        const existingStart = (data.start_time as Timestamp).toDate().getTime();
        const existingEnd = (data.end_time as Timestamp).toDate().getTime();
        return !(startDateTime.getTime() >= existingEnd || endDateTime.getTime() <= existingStart);
      });

      if (hasConflict) {
        throw new Error('指定された時間帯にはすでに他の予約が入っています。');
      }

      // グループテンプレート設定の取得
      const groupRef = adminDb.collection('groups').doc(groupId);
      const groupSnap = await transaction.get(groupRef);
      const groupData = groupSnap.data();

      const titleTemplate = groupData?.calendar_title_template || '[車共有] {vehicle_name}の予約 - {user_name}';
      const descTemplate = groupData?.calendar_description_template || '予約者: {user_name}\n同乗者: {invited_emails}';

      // 予約ドキュメントの新規作成
      const newReservationRef = adminDb.collection('reservations').doc();
      transaction.set(newReservationRef, {
        vehicle_id: input.vehicle_id,
        user_id: uid,
        start_time: startTimestamp,
        end_time: endTimestamp,
        invited_emails: input.invited_emails,
        created_at: FieldValue.serverTimestamp(),
      });

      return {
        reservationId: newReservationRef.id,
        groupId,
        userName,
        vehicleName,
        titleTemplate,
        descTemplate,
      };
    });

    // カレンダー連携 URL の生成
    const invitedListStr = input.invited_emails.join(', ');
    const calTitle = formatCalendarTemplate(result.titleTemplate, {
      vehicle_name: result.vehicleName,
      user_name: result.userName,
      invited_emails: invitedListStr,
    });
    const calDesc = formatCalendarTemplate(result.descTemplate, {
      vehicle_name: result.vehicleName,
      user_name: result.userName,
      invited_emails: invitedListStr,
    });
    const googleCalendarUrl = generateGoogleCalendarUrl({
      title: calTitle,
      description: calDesc,
      startTime: input.start_time,
      endTime: input.end_time,
    });

    // 招待メール送信
    if (input.invited_emails.length > 0) {
      sendInviteEmail({
        invitedEmails: input.invited_emails,
        vehicleName: result.vehicleName,
        userName: result.userName,
        startTime: input.start_time,
        endTime: input.end_time,
        title: calTitle,
        description: calDesc,
      }).catch(err => console.error('バックグラウンドメール送信エラー:', err));
    }

    revalidatePath('/');
    return { success: true, data: { id: result.reservationId, googleCalendarUrl } };
  } catch (error: any) {
    console.error('予約作成 Server Action エラー:', error);
    return { success: false, error: error.message || '予約の作成に失敗しました。' };
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

    await adminDb.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
      const reservationRef = adminDb.collection('reservations').doc(id);
      const resSnap = await transaction.get(reservationRef);

      if (!resSnap.exists) throw new Error('変更対象の予約が見つかりません。');
      if (resSnap.data()!.user_id !== uid) throw new Error('他のユーザーの予約を変更する権限がありません。');

      const twoDaysAgo = new Date(startDateTime);
      twoDaysAgo.setDate(startDateTime.getDate() - 2);
      const twoDaysLater = new Date(startDateTime);
      twoDaysLater.setDate(startDateTime.getDate() + 2);

      const resQuery = adminDb.collection('reservations')
        .where('vehicle_id', '==', input.vehicle_id)
        .where('start_time', '>=', Timestamp.fromDate(twoDaysAgo))
        .where('start_time', '<=', Timestamp.fromDate(twoDaysLater));

      const resQuerySnap = await transaction.get(resQuery);

      const hasConflict = resQuerySnap.docs.some((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        if (doc.id === id) return false;
        const data = doc.data();
        const existingStart = (data.start_time as Timestamp).toDate().getTime();
        const existingEnd = (data.end_time as Timestamp).toDate().getTime();
        return !(startDateTime.getTime() >= existingEnd || endDateTime.getTime() <= existingStart);
      });

      if (hasConflict) throw new Error('指定された時間帯にはすでに他の予約が入っています。');

      transaction.update(reservationRef, {
        vehicle_id: input.vehicle_id,
        start_time: Timestamp.fromDate(startDateTime),
        end_time: Timestamp.fromDate(endDateTime),
        invited_emails: input.invited_emails,
      });
    });

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('予約更新 Server Action エラー:', error);
    return { success: false, error: error.message || '予約の更新に失敗しました。' };
  }
}

/**
 * 予約を削除します。
 */
export async function deleteReservation(id: string, idToken: string) {
  try {
    const uid = await verifyUser(idToken);

    await adminDb.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
      const reservationRef = adminDb.collection('reservations').doc(id);
      const resSnap = await transaction.get(reservationRef);

      if (!resSnap.exists) throw new Error('削除対象の予約が見つかりません。');
      if (resSnap.data()!.user_id !== uid) throw new Error('他のユーザーの予約を削除する権限がありません。');

      transaction.delete(reservationRef);
    });

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('予約削除 Server Action エラー:', error);
    return { success: false, error: error.message || '予約の削除に失敗しました。' };
  }
}
