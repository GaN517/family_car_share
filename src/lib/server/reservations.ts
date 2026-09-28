import { adminDb } from '@/lib/firebase-admin';
import { formatJstRange } from '@/lib/datetime';
import { HttpError } from './auth';

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface ExistingReservation extends TimeRange {
  id: string;
  user_id: string;
  series_id?: string | null;
}

/**
 * 車両のすべての予約を取得します。
 * 複合インデックスを不要にするため、車両 ID の等価条件のみで取得して JS 側で判定します。
 */
export async function loadVehicleReservations(vehicleId: string): Promise<ExistingReservation[]> {
  const snap = await adminDb.collection('reservations').where('vehicle_id', '==', vehicleId).get();
  const list: ExistingReservation[] = [];
  snap.docs.forEach((doc) => {
    const d = doc.data();
    if (!d.start_time || !d.end_time) return;
    list.push({
      id: doc.id,
      user_id: d.user_id,
      series_id: d.series_id || null,
      start: d.start_time.toDate(),
      end: d.end_time.toDate(),
    });
  });
  return list;
}

/** 境界値（一方の終了時刻 = 他方の開始時刻）は重複とみなしません */
export const rangesOverlap = (a: TimeRange, b: TimeRange) =>
  a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

/** 候補の時間帯のうち、既存予約と重複するものを返します */
export function findConflicts<T extends TimeRange>(
  existing: ExistingReservation[],
  candidates: T[],
  excludeIds: Set<string> = new Set()
): T[] {
  return candidates.filter((c) => existing.some((e) => !excludeIds.has(e.id) && rangesOverlap(e, c)));
}

/** 車両がユーザーのグループに属しているか確認して取得します */
export async function getGroupVehicle(vehicleId: string, groupId: string) {
  if (!vehicleId) throw new HttpError(400, '車両を指定してください。');
  const snap = await adminDb.collection('vehicles').doc(vehicleId).get();
  if (!snap.exists) throw new HttpError(404, '指定された車両が見つかりません。');
  const data = snap.data()!;
  if (data.group_id && data.group_id !== groupId) {
    throw new HttpError(403, 'この車両を予約する権限がありません。');
  }
  return { id: snap.id, name: (data.name as string) || '車両', groupId: data.group_id as string };
}

/** グループメンバーのプロフィール一覧 */
export async function getGroupMembers(groupId: string) {
  const snap = await adminDb.collection('profiles').where('group_id', '==', groupId).get();
  return snap.docs.map((doc) => ({ uid: doc.id, ...(doc.data() as Record<string, any>) }));
}

/** 予約の時間帯の日本語表記 */
export const describeRange = (r: TimeRange) => formatJstRange(r.start, r.end);
