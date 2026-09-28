import { NextRequest, NextResponse } from 'next/server';
import { adminDb, Timestamp, FieldValue } from '@/lib/firebase-admin';
import { errorResponse, HttpError, requireGroupUser } from '@/lib/server/auth';
import {
  findConflicts,
  getGroupVehicle,
  loadVehicleReservations,
  describeRange,
  type TimeRange,
} from '@/lib/server/reservations';
import { notifyNewReservation } from '@/lib/server/notifications';
import { runAfterResponse } from '@/lib/server/line';
import { cancelTransfersForReservations } from '@/lib/server/transfers';
import { formatCalendarTemplate, generateGoogleCalendarUrl } from '@/lib/utils';
import {
  describeRecurrence,
  generateOccurrences,
  validateRecurrence,
  type RecurrenceRule,
} from '@/lib/recurrence';

export const dynamic = 'force-dynamic';

const DEFAULT_TITLE_TEMPLATE = '[車共有] {vehicle_name}の予約 - {user_name}';
const DEFAULT_DESC_TEMPLATE = '予約者: {user_name}\n行き先: {destination}\n目的: {purpose}\n同乗者: {invited_emails}';

async function readJson(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'リクエストの形式が不正です。');
  }
}

function parseRange(body: any): TimeRange {
  const start = new Date(body.start_time);
  const end = new Date(body.end_time);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new HttpError(400, '日時の形式が不正です。');
  }
  if (start >= end) {
    throw new HttpError(400, '開始時間は終了時間より前に設定してください。');
  }
  return { start, end };
}

const sanitizeEmails = (emails: unknown): string[] =>
  Array.isArray(emails) ? emails.filter((e): e is string => typeof e === 'string' && /\S+@\S+\.\S+/.test(e)).slice(0, 20) : [];

const toRangeJson = (r: TimeRange) => ({
  start_time: r.start.toISOString(),
  end_time: r.end.toISOString(),
  label: describeRange(r),
});

/**
 * 予約作成 API (POST)
 * recurrence を指定すると繰り返し予約として各回を個別の予約ドキュメントで作成します（series_id で紐付け）。
 * 重複がある場合は conflicts を返し、skip_conflicts: true で再送すると重複分を除いて作成します。
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireGroupUser(request);
    const body = await readJson(request);
    const first = parseRange(body);
    // 車両・既存予約・グループ設定を並列に取得
    const [vehicle, existing, groupSnap] = await Promise.all([
      getGroupVehicle(body.vehicle_id, ctx.groupId),
      loadVehicleReservations(String(body.vehicle_id || '')),
      adminDb.collection('groups').doc(ctx.groupId).get(),
    ]);

    const invitedEmails = sanitizeEmails(body.invited_emails);
    const destination = String(body.destination || '').trim().slice(0, 100);
    const purpose = String(body.purpose || '').trim().slice(0, 100);

    // 繰り返しの展開
    const recurrence: RecurrenceRule | null = body.recurrence || null;
    let occurrences: TimeRange[] = [first];
    let recurrenceText = '';
    if (recurrence) {
      const invalid = validateRecurrence(recurrence, first.start);
      if (invalid) throw new HttpError(400, invalid);
      occurrences = generateOccurrences(first.start, first.end, recurrence);
      if (occurrences.length === 0) throw new HttpError(400, '指定した条件に該当する日がありません。');
      recurrenceText = describeRecurrence(recurrence, first.start);
    }

    // 重複チェック
    const conflicts = findConflicts(existing, occurrences);
    if (conflicts.length > 0 && !(body.skip_conflicts && occurrences.length > 1)) {
      return NextResponse.json({
        success: false,
        error:
          occurrences.length > 1
            ? `${occurrences.length}回のうち${conflicts.length}回が既存の予約と重複しています。`
            : '指定された時間帯にはすでに他の予約が入っています。',
        conflicts: conflicts.map(toRangeJson),
        total: occurrences.length,
      });
    }
    const toCreate = occurrences.filter((o) => !conflicts.includes(o));
    if (toCreate.length === 0) {
      throw new HttpError(409, 'すべての日程が既存の予約と重複しているため、予約できませんでした。');
    }

    // 予約作成（繰り返しは一括書き込み）
    const seriesId = toCreate.length > 1 || recurrence ? adminDb.collection('reservations').doc().id : null;
    const batch = adminDb.batch();
    const ids: string[] = [];
    toCreate.forEach((o) => {
      const ref = adminDb.collection('reservations').doc();
      ids.push(ref.id);
      batch.set(ref, {
        vehicle_id: vehicle.id,
        user_id: ctx.uid,
        start_time: Timestamp.fromDate(o.start),
        end_time: Timestamp.fromDate(o.end),
        invited_emails: invitedEmails,
        destination,
        purpose,
        series_id: seriesId,
        recurrence_text: recurrenceText || null,
        created_at: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    // Google カレンダー URL（初回分）とメール本文
    const gd = groupSnap.data();
    const vars = {
      vehicle_name: vehicle.name,
      user_name: ctx.name,
      invited_emails: invitedEmails.join(', '),
      destination,
      purpose,
    };
    const calTitle = formatCalendarTemplate(gd?.calendar_title_template || DEFAULT_TITLE_TEMPLATE, vars);
    const calDesc = formatCalendarTemplate(gd?.calendar_description_template || DEFAULT_DESC_TEMPLATE, vars);
    const googleCalendarUrl = generateGoogleCalendarUrl({
      title: calTitle,
      description: calDesc,
      location: destination,
      startTime: toCreate[0].start,
      endTime: toCreate[0].end,
    });

    // 招待メールと LINE 通知はレスポンス後に送信（完了を待たずに画面へ結果を返す）
    runAfterResponse('新規予約の LINE 通知エラー', () =>
      notifyNewReservation({
        groupId: ctx.groupId,
        creatorUid: ctx.uid,
        creatorName: ctx.name,
        vehicleName: vehicle.name,
        occurrences: toCreate,
        recurrenceText,
        destination,
        purpose,
      })
    );
    if (invitedEmails.length > 0) {
      runAfterResponse('招待メール送信エラー', () =>
        import('@/lib/email').then(({ sendInviteEmail }) =>
          sendInviteEmail({
            invitedEmails,
            vehicleName: vehicle.name,
            userName: ctx.name,
            startTime: toCreate[0].start.toISOString(),
            endTime: toCreate[0].end.toISOString(),
            title: calTitle,
            description: calDesc,
            occurrences: toCreate,
            recurrenceText,
          })
        )
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: ids[0],
        ids,
        count: ids.length,
        series_id: seriesId,
        skipped: conflicts.map(toRangeJson),
        googleCalendarUrl,
      },
    });
  } catch (error) {
    return errorResponse(error, '予約作成エラー');
  }
}

/**
 * 予約更新 API (PUT)
 * 繰り返し予約の場合も、指定した1回分のみを変更します。
 */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await requireGroupUser(request);
    const body = await readJson(request);
    const { id } = body;
    if (!id) throw new HttpError(400, '予約IDが必要です。');
    const range = parseRange(body);

    const ref = adminDb.collection('reservations').doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, '変更対象の予約が見つかりません。');
    const current = snap.data()!;
    if (current.user_id !== ctx.uid) throw new HttpError(403, '他のユーザーの予約を変更する権限がありません。');

    const vehicleId = body.vehicle_id || current.vehicle_id;
    const [vehicle, existing] = await Promise.all([
      getGroupVehicle(vehicleId, ctx.groupId),
      loadVehicleReservations(vehicleId),
    ]);
    if (findConflicts(existing, [range], new Set([id])).length > 0) {
      throw new HttpError(409, '指定された時間帯にはすでに他の予約が入っています。');
    }

    const timeChanged =
      current.start_time.toMillis() !== range.start.getTime() || current.end_time.toMillis() !== range.end.getTime();

    await ref.update({
      vehicle_id: vehicle.id,
      start_time: Timestamp.fromDate(range.start),
      end_time: Timestamp.fromDate(range.end),
      invited_emails: sanitizeEmails(body.invited_emails),
      destination: String(body.destination || '').trim().slice(0, 100),
      purpose: String(body.purpose || '').trim().slice(0, 100),
      // 時間が変わったらリマインドを再送できるようにする
      ...(timeChanged ? { reminder_sent: false, day_before_reminder_sent: false } : {}),
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, '予約更新エラー');
  }
}

/**
 * 予約削除 API (DELETE)
 * scope: single（この予約のみ・既定） / future（この回以降の繰り返し） / all（繰り返しすべて）
 */
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireGroupUser(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const scope = searchParams.get('scope') || 'single';
    if (!id) throw new HttpError(400, '予約IDが必要です。');

    const ref = adminDb.collection('reservations').doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, '削除対象の予約が見つかりません。');
    const target = snap.data()!;
    if (target.user_id !== ctx.uid) throw new HttpError(403, '他のユーザーの予約を削除する権限がありません。');

    let refs: FirebaseFirestore.DocumentReference[] = [ref];
    if (scope !== 'single' && target.series_id) {
      const seriesSnap = await adminDb.collection('reservations').where('series_id', '==', target.series_id).get();
      const fromTime = target.start_time.toMillis();
      refs = seriesSnap.docs
        .filter((d) => d.data().user_id === ctx.uid)
        .filter((d) => scope === 'all' || d.data().start_time.toMillis() >= fromTime)
        .map((d) => d.ref);
    }

    const batch = adminDb.batch();
    refs.forEach((r) => batch.delete(r));
    await batch.commit();
    await cancelTransfersForReservations(refs.map((r) => r.id));

    return NextResponse.json({ success: true, data: { deleted: refs.length } });
  } catch (error) {
    return errorResponse(error, '予約削除エラー');
  }
}
