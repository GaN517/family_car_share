import { adminDb, Timestamp } from '@/lib/firebase-admin';
import { addDaysYmd, formatJstDate, jstDayRange, toJstHm, todayJst } from '@/lib/datetime';
import { getGroupMembers, describeRange, type TimeRange } from './reservations';
import { notifyUsers, openAppAction, buttonsMessage, textMessage, isLineConfigured } from './line';

/** 新規予約をグループの他メンバーへ LINE 通知します */
export async function notifyNewReservation(params: {
  groupId: string;
  creatorUid: string;
  creatorName: string;
  vehicleName: string;
  occurrences: TimeRange[];
  recurrenceText?: string;
  destination?: string;
  purpose?: string;
}) {
  if (!isLineConfigured() || params.occurrences.length === 0) return;
  const members = await getGroupMembers(params.groupId);
  const targets = members.map((m) => m.uid).filter((uid) => uid !== params.creatorUid);
  if (targets.length === 0) return;

  const first = params.occurrences[0];
  const lines = [`🚗 ${params.creatorName}さんが「${params.vehicleName}」を予約しました。`, ''];
  if (params.occurrences.length > 1) {
    lines.push(`🔁 ${params.recurrenceText || '繰り返し予約'}（全${params.occurrences.length}回）`);
    lines.push(`初回: ${describeRange(first)}`);
    lines.push(`最終: ${describeRange(params.occurrences[params.occurrences.length - 1])}`);
  } else {
    lines.push(`📅 ${describeRange(first)}`);
  }
  if (params.destination) lines.push(`📍 行き先: ${params.destination}`);
  if (params.purpose) lines.push(`🏷 目的: ${params.purpose}`);

  const messages = [textMessage(lines.join('\n'))];
  const open = openAppAction('予約状況を見る');
  if (open.length) {
    messages.push(buttonsMessage({ altText: '予約状況を確認', text: 'アプリで予約状況を確認できます。', actions: open }));
  }
  await notifyUsers(targets, 'new_reservation', messages);
}

/**
 * 予約リマインドを送信します。
 * - upcoming: 開始まで leadMinutes 分以内の予約（各予約につき1回）
 * - daily:    明日 (JST) の予約をまとめて前日に通知
 */
export async function sendReminders(mode: 'upcoming' | 'daily', leadMinutes = 120) {
  if (!isLineConfigured()) return { sent: 0, skipped: 'LINE が未設定です' };

  let rangeStart: Date;
  let rangeEnd: Date;
  const flag = mode === 'daily' ? 'day_before_reminder_sent' : 'reminder_sent';
  if (mode === 'daily') {
    ({ start: rangeStart, end: rangeEnd } = jstDayRange(addDaysYmd(todayJst(), 1)));
  } else {
    rangeStart = new Date();
    rangeEnd = new Date(Date.now() + leadMinutes * 60 * 1000);
  }

  // start_time の単一フィールド範囲クエリ（複合インデックス不要）
  const snap = await adminDb
    .collection('reservations')
    .where('start_time', '>=', Timestamp.fromDate(rangeStart))
    .where('start_time', '<', Timestamp.fromDate(rangeEnd))
    .get();

  const targets = snap.docs.filter((d) => d.data()[flag] !== true);
  if (targets.length === 0) return { sent: 0 };

  const vehicleNames = new Map<string, string>();
  const vehicleName = async (id: string) => {
    if (!vehicleNames.has(id)) {
      const v = await adminDb.collection('vehicles').doc(id).get();
      vehicleNames.set(id, (v.data()?.name as string) || '車両');
    }
    return vehicleNames.get(id)!;
  };

  // ユーザーごとにまとめて送信
  const byUser = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  targets.forEach((d) => {
    const uid = d.data().user_id as string;
    byUser.set(uid, [...(byUser.get(uid) || []), d]);
  });

  let sent = 0;
  for (const [uid, docs] of byUser) {
    const items = await Promise.all(
      docs
        .sort((a, b) => a.data().start_time.toMillis() - b.data().start_time.toMillis())
        .map(async (d) => {
          const r = d.data();
          const range = `${toJstHm(r.start_time.toDate())}〜${toJstHm(r.end_time.toDate())}`;
          const dest = r.destination ? `（${r.destination}）` : '';
          return `・${await vehicleName(r.vehicle_id)} ${range}${dest}`;
        })
    );
    const header =
      mode === 'daily'
        ? `🔔 明日 ${formatJstDate(rangeStart)} の予約リマインドです。`
        : '🔔 まもなく予約の時間です。';
    await notifyUsers([uid], 'reminder', [textMessage(`${header}\n\n${items.join('\n')}\n\n不要になった場合はアプリから取り消しまたは譲渡をお願いします。`)]);
    await Promise.all(docs.map((d) => d.ref.update({ [flag]: true })));
    sent += docs.length;
  }
  return { sent };
}

/** LINE ユーザー ID からアプリのユーザーを探します */
export async function findProfileByLineUserId(lineUserId: string) {
  const snap = await adminDb.collection('profiles').where('line_user_id', '==', lineUserId).limit(1).get();
  if (snap.empty) return null;
  return { uid: snap.docs[0].id, ...(snap.docs[0].data() as Record<string, any>) };
}

/** 自分の今後の予約一覧テキスト（LINE で「予約」と送信したとき） */
export async function upcomingReservationsText(uid: string): Promise<string> {
  const snap = await adminDb.collection('reservations').where('user_id', '==', uid).get();
  const now = Date.now();
  const upcoming = snap.docs
    .map((d) => d.data())
    .filter((r) => r.end_time?.toDate().getTime() > now)
    .sort((a, b) => a.start_time.toMillis() - b.start_time.toMillis())
    .slice(0, 10);
  if (upcoming.length === 0) return '📭 今後の予約はありません。';

  const names = new Map<string, string>();
  const rows: string[] = [];
  for (const r of upcoming) {
    if (!names.has(r.vehicle_id)) {
      const v = await adminDb.collection('vehicles').doc(r.vehicle_id).get();
      names.set(r.vehicle_id, (v.data()?.name as string) || '車両');
    }
    rows.push(`・${names.get(r.vehicle_id)} ${describeRange({ start: r.start_time.toDate(), end: r.end_time.toDate() })}`);
  }
  return `📅 あなたの今後の予約（最大10件）\n\n${rows.join('\n')}`;
}
