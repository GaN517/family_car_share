import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/server/auth';
import { findConflicts, loadVehicleReservations, describeRange } from '@/lib/server/reservations';
import { generateOccurrences, validateRecurrence, type RecurrenceRule } from '@/lib/recurrence';

export const dynamic = 'force-dynamic';

/**
 * 予約時間帯の重複判定 API
 * GET /api/reservations/check?vehicle_id=xxx&start_time=xxx&end_time=xxx[&reservation_id=xxx][&recurrence=JSON]
 *
 * 以前は「車両 ID + 開始時刻の範囲」の複合インデックスが必要なクエリで、
 * インデックス未作成時にエラーとなり重複を検出できていなかったため、車両単位の取得に変更しています。
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request);

    const { searchParams } = new URL(request.url);
    const vehicleId = searchParams.get('vehicle_id');
    const startTime = searchParams.get('start_time');
    const endTime = searchParams.get('end_time');
    const reservationId = searchParams.get('reservation_id');
    const recurrenceParam = searchParams.get('recurrence');

    if (!vehicleId || !startTime || !endTime) {
      throw new HttpError(400, '必要なパラメータが不足しています。');
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      throw new HttpError(400, '日時の指定が不正です。');
    }

    let candidates = [{ start, end }];
    if (recurrenceParam) {
      let rule: RecurrenceRule;
      try {
        rule = JSON.parse(recurrenceParam);
      } catch {
        throw new HttpError(400, '繰り返し条件の形式が不正です。');
      }
      const invalid = validateRecurrence(rule, start);
      if (invalid) {
        return NextResponse.json({ conflict: false, total: 0, conflicts: [], message: invalid, invalid: true });
      }
      candidates = generateOccurrences(start, end, rule);
    }

    const existing = await loadVehicleReservations(vehicleId);
    const conflicts = findConflicts(existing, candidates, new Set(reservationId ? [reservationId] : []));

    return NextResponse.json({
      conflict: conflicts.length > 0,
      total: candidates.length,
      conflicts: conflicts.map((c) => ({ start_time: c.start.toISOString(), end_time: c.end.toISOString(), label: describeRange(c) })),
      message: conflicts.length > 0 ? '選択した時間帯は既に予約されています。' : 'この時間帯で予約可能です。',
    });
  } catch (error) {
    return errorResponse(error, '予約重複チェックエラー');
  }
}
