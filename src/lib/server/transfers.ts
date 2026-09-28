import { adminDb, FieldValue, Timestamp } from '@/lib/firebase-admin';
import { HttpError, type UserContext } from './auth';
import { describeRange } from './reservations';
import { buttonsMessage, notifyUsers, openAppAction, runAfterResponse, textMessage } from './line';

/**
 * 予約枠の譲渡（交渉）
 *
 * - request: 他の人の予約を「譲ってほしい」と依頼する（受信者 = 予約者）
 * - offer:   自分の予約を特定のメンバーに「譲りたい」と申し出る（受信者 = 指定メンバー）
 *
 * 受信者が承諾すると予約の所有者が切り替わります。辞退時は返信メッセージで条件を伝えられます。
 */

export type TransferType = 'request' | 'offer';
export type TransferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface TransferDoc {
  reservation_id: string;
  vehicle_id: string;
  vehicle_name: string;
  group_id: string;
  type: TransferType;
  from_user_id: string;
  to_user_id: string;
  owner_id: string;
  message: string;
  response_message: string;
  status: TransferStatus;
  start_time: FirebaseFirestore.Timestamp;
  end_time: FirebaseFirestore.Timestamp;
  created_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  responded_at?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
}

const transfersCol = () => adminDb.collection('transfer_requests');

async function getUserName(uid: string): Promise<string> {
  const snap = await adminDb.collection('profiles').doc(uid).get();
  return (snap.data()?.name as string) || 'メンバー';
}

const rangeOf = (t: Pick<TransferDoc, 'start_time' | 'end_time'>) =>
  describeRange({ start: t.start_time.toDate(), end: t.end_time.toDate() });

/** 譲渡依頼・申し出を作成します */
export async function createTransfer(
  ctx: UserContext,
  input: { reservation_id: string; type: TransferType; to_user_id?: string; message?: string }
) {
  const message = (input.message || '').trim().slice(0, 500);
  if (input.type !== 'request' && input.type !== 'offer') {
    throw new HttpError(400, '譲渡の種類が不正です。');
  }

  const resSnap = await adminDb.collection('reservations').doc(input.reservation_id || '-').get();
  if (!resSnap.exists) throw new HttpError(404, '対象の予約が見つかりません。');
  const reservation = resSnap.data()!;

  const vehicleSnap = await adminDb.collection('vehicles').doc(reservation.vehicle_id).get();
  const vehicle = vehicleSnap.data();
  if (!vehicle || vehicle.group_id !== ctx.groupId) {
    throw new HttpError(403, '同じグループの予約のみ譲渡できます。');
  }
  if (reservation.end_time.toDate().getTime() <= Date.now()) {
    throw new HttpError(400, '終了済みの予約は譲渡できません。');
  }

  const ownerId: string = reservation.user_id;
  let toUserId: string;
  if (input.type === 'request') {
    if (ownerId === ctx.uid) throw new HttpError(400, '自分の予約に譲渡依頼は出せません。');
    toUserId = ownerId;
  } else {
    if (ownerId !== ctx.uid) throw new HttpError(403, '自分の予約のみ譲渡を申し出られます。');
    if (!input.to_user_id || input.to_user_id === ctx.uid) throw new HttpError(400, '譲渡先のメンバーを選択してください。');
    const targetSnap = await adminDb.collection('profiles').doc(input.to_user_id).get();
    if (!targetSnap.exists || targetSnap.data()!.group_id !== ctx.groupId) {
      throw new HttpError(400, '譲渡先は同じグループのメンバーを選択してください。');
    }
    toUserId = input.to_user_id;
  }

  // 同じ予約に対する未回答の依頼が既にあれば重複作成しない
  const existing = await transfersCol().where('reservation_id', '==', resSnap.id).get();
  const duplicate = existing.docs.find((d) => {
    const t = d.data();
    return t.status === 'pending' && t.from_user_id === ctx.uid && t.to_user_id === toUserId;
  });
  if (duplicate) throw new HttpError(409, 'この予約には既に回答待ちの依頼があります。');

  const ref = transfersCol().doc();
  const doc: TransferDoc = {
    reservation_id: resSnap.id,
    vehicle_id: reservation.vehicle_id,
    vehicle_name: vehicle.name || '車両',
    group_id: ctx.groupId,
    type: input.type,
    from_user_id: ctx.uid,
    to_user_id: toUserId,
    owner_id: ownerId,
    message,
    response_message: '',
    status: 'pending',
    start_time: reservation.start_time,
    end_time: reservation.end_time,
    created_at: FieldValue.serverTimestamp(),
    responded_at: null,
  };
  await ref.set(doc);

  // 受信者へ LINE 通知（承諾・辞退ボタン付き）
  const heading =
    input.type === 'request'
      ? `${ctx.name}さんから予約の譲渡依頼が届きました。`
      : `${ctx.name}さんから予約枠を譲りたいという申し出が届きました。`;
  const body = `【${doc.vehicle_name}】${rangeOf(doc)}${message ? `\n「${message}」` : ''}`;
  runAfterResponse('譲渡依頼の通知エラー', () => notifyUsers([toUserId], 'transfer', [
    textMessage(`🔄 ${heading}\n\n${body}`),
    buttonsMessage({
      altText: heading,
      text: `この${input.type === 'request' ? '依頼' : '申し出'}に回答してください。\n${doc.vehicle_name} ${rangeOf(doc)}`,
      actions: [
        { type: 'postback', label: '承諾する', data: `action=transfer_accept&id=${ref.id}`, displayText: '承諾します' },
        { type: 'postback', label: 'お断りする', data: `action=transfer_decline&id=${ref.id}`, displayText: 'お断りします' },
        ...openAppAction(),
      ],
    }),
  ]));

  return { id: ref.id };
}

/** 譲渡依頼に回答します（承諾 / 辞退） */
export async function respondTransfer(uid: string, transferId: string, accept: boolean, responseMessage = '') {
  const reply = responseMessage.trim().slice(0, 500);
  const ref = transfersCol().doc(transferId || '-');

  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, '譲渡依頼が見つかりません。');
    const t = snap.data() as TransferDoc;
    if (t.to_user_id !== uid) throw new HttpError(403, 'この依頼に回答する権限がありません。');
    if (t.status !== 'pending') throw new HttpError(409, 'この依頼は既に処理されています。');

    if (!accept) {
      tx.update(ref, { status: 'declined', response_message: reply, responded_at: FieldValue.serverTimestamp() });
      return { transfer: t, accepted: false };
    }

    const resRef = adminDb.collection('reservations').doc(t.reservation_id);
    const resSnap = await tx.get(resRef);
    const related = await tx.get(transfersCol().where('reservation_id', '==', t.reservation_id));

    if (!resSnap.exists) {
      throw new HttpError(410, '対象の予約は既に削除されています。');
    }
    const reservation = resSnap.data()!;
    if (reservation.user_id !== t.owner_id) {
      throw new HttpError(409, '予約の所有者が既に変更されているため、譲渡できません。');
    }
    if (reservation.end_time.toDate().getTime() <= Date.now()) {
      throw new HttpError(400, '終了済みの予約は譲渡できません。');
    }

    const newOwner = t.type === 'request' ? t.from_user_id : t.to_user_id;
    tx.update(resRef, {
      user_id: newOwner,
      invited_emails: [],
      destination: '',
      purpose: '',
      series_id: null,
      transferred_from: t.owner_id,
      transferred_at: FieldValue.serverTimestamp(),
      reminder_sent: false,
      day_before_reminder_sent: false,
    });
    tx.update(ref, { status: 'accepted', response_message: reply, responded_at: FieldValue.serverTimestamp() });

    // 同じ予約に対する他の未回答の依頼は自動的に取り消し
    const others: TransferDoc[] = [];
    related.docs.forEach((d) => {
      if (d.id !== ref.id && d.data().status === 'pending') {
        tx.update(d.ref, { status: 'cancelled', responded_at: FieldValue.serverTimestamp() });
        others.push(d.data() as TransferDoc);
      }
    });
    return { transfer: t, accepted: true, newOwner, others };
  }).catch(async (e) => {
    // 予約が削除済みなら依頼も取り消し扱いにする
    if (e instanceof HttpError && e.status === 410) {
      await ref.update({ status: 'cancelled', responded_at: FieldValue.serverTimestamp() });
    }
    throw e;
  });

  const t = result.transfer;
  runAfterResponse('譲渡結果の通知エラー', async () => {
    const [fromName, toName] = await Promise.all([getUserName(t.from_user_id), getUserName(t.to_user_id)]);
    const detail = `【${t.vehicle_name}】${rangeOf(t)}`;

    if (!result.accepted) {
      await notifyUsers([t.from_user_id], 'transfer', [
        textMessage(`🙅 ${toName}さんが譲渡の${t.type === 'request' ? '依頼' : '申し出'}をお断りしました。\n\n${detail}${reply ? `\n返信:「${reply}」` : ''}`),
      ]);
    } else {
      const newOwnerName = result.newOwner === t.from_user_id ? fromName : toName;
      const prevOwnerName = result.newOwner === t.from_user_id ? toName : fromName;
      await Promise.all([
        notifyUsers([result.newOwner!], 'transfer', [
          textMessage(`✅ 予約の譲渡が完了しました。\n${prevOwnerName}さんから引き継いだ予約があなたの予約になりました。\n\n${detail}${reply ? `\n返信:「${reply}」` : ''}`),
        ]),
        notifyUsers([t.owner_id], 'transfer', [
          textMessage(`✅ 予約の譲渡が完了しました。\n以下の予約は${newOwnerName}さんに引き継がれました。\n\n${detail}`),
        ]),
        notifyUsers(
          (result.others || []).map((o) => o.from_user_id).filter((id) => id !== result.newOwner),
          'transfer',
          [textMessage(`ℹ️ 以下の予約は別のメンバーへ譲渡されたため、あなたの譲渡依頼は取り消されました。\n\n${detail}`)]
        ),
      ]);
    }
  });

  return { accepted: result.accepted };
}

/** 自分が送った譲渡依頼を取り消します */
export async function cancelTransfer(uid: string, transferId: string) {
  const ref = transfersCol().doc(transferId || '-');
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, '譲渡依頼が見つかりません。');
  const t = snap.data() as TransferDoc;
  if (t.from_user_id !== uid) throw new HttpError(403, 'この依頼を取り消す権限がありません。');
  if (t.status !== 'pending') throw new HttpError(409, 'この依頼は既に処理されています。');
  await ref.update({ status: 'cancelled', responded_at: FieldValue.serverTimestamp() });

  runAfterResponse('譲渡取り消しの通知エラー', async () => {
    const fromName = await getUserName(uid);
    await notifyUsers([t.to_user_id], 'transfer', [
      textMessage(`↩️ ${fromName}さんが譲渡の${t.type === 'request' ? '依頼' : '申し出'}を取り消しました。\n\n【${t.vehicle_name}】${rangeOf(t)}`),
    ]);
  });
}

/** 予約の削除に合わせて、関連する未回答の譲渡依頼を取り消します */
export async function cancelTransfersForReservations(reservationIds: string[]) {
  await Promise.all(
    reservationIds.map(async (id) => {
      const snap = await transfersCol().where('reservation_id', '==', id).get();
      const pending = snap.docs.filter((d) => d.data().status === 'pending');
      await Promise.all(pending.map((d) => d.ref.update({ status: 'cancelled', responded_at: FieldValue.serverTimestamp() })));
    })
  );
}

/** ユーザーに関係する譲渡依頼の一覧（回答待ち + 直近30日の履歴） */
export async function listTransfers(uid: string) {
  const [incomingSnap, outgoingSnap] = await Promise.all([
    transfersCol().where('to_user_id', '==', uid).get(),
    transfersCol().where('from_user_id', '==', uid).get(),
  ]);

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const nameCache = new Map<string, Promise<string>>();
  const nameOf = (id: string) => {
    if (!nameCache.has(id)) nameCache.set(id, getUserName(id));
    return nameCache.get(id)!;
  };

  const serialize = async (d: FirebaseFirestore.QueryDocumentSnapshot) => {
    const t = d.data() as TransferDoc;
    const createdAt = t.created_at instanceof Timestamp ? t.created_at.toDate() : new Date();
    return {
      id: d.id,
      reservation_id: t.reservation_id,
      vehicle_id: t.vehicle_id,
      vehicle_name: t.vehicle_name,
      type: t.type,
      status: t.status,
      message: t.message,
      response_message: t.response_message,
      from_user_id: t.from_user_id,
      from_user_name: await nameOf(t.from_user_id),
      to_user_id: t.to_user_id,
      to_user_name: await nameOf(t.to_user_id),
      start_time: t.start_time.toDate().toISOString(),
      end_time: t.end_time.toDate().toISOString(),
      created_at: createdAt.toISOString(),
    };
  };

  const relevant = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
    const t = d.data() as TransferDoc;
    if (t.status === 'pending') return t.end_time.toDate().getTime() > Date.now();
    const created = t.created_at instanceof Timestamp ? t.created_at.toMillis() : Date.now();
    return created >= cutoff;
  };

  const sortDesc = <T extends { created_at: string }>(list: T[]) =>
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return {
    incoming: sortDesc(await Promise.all(incomingSnap.docs.filter(relevant).map(serialize))),
    outgoing: sortDesc(await Promise.all(outgoingSnap.docs.filter(relevant).map(serialize))),
  };
}
