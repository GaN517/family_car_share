'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { addDaysYmd, jstDayRange, todayJst, toJstYmd } from '@/lib/datetime';
import { apiFetch } from '@/lib/api-client';
import { useNow } from '@/lib/hooks/use-now';
import type { ReservationView, Vehicle } from '@/lib/types';
import VehicleTabs from '@/components/vehicle-tabs';
import Timeline from '@/components/timeline';
import NextUp from '@/components/next-up';
import DateStrip from '@/components/date-strip';
import ReservationModal from '@/components/reservation-modal';
import TransferRequestModal from '@/components/transfer-request-modal';
import TransferInbox, { type TransferItem } from '@/components/transfer-inbox';
import { DashboardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/primitives';
import { Settings, Plus, ArrowRightLeft, Users, Car } from 'lucide-react';

const SELECTED_DATE_KEY = 'fcs:selectedDate';
const SELECTED_VEHICLE_KEY = 'fcs:selectedVehicleId';

const readSession = (key: string): string | null => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

const writeSession = (key: string, value: string) => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // プライベートブラウズ等で保存できない場合は無視
  }
};

type RawReservation = Omit<ReservationView, 'profiles'>;

const dayVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 60 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -60 }),
};

export default function DashboardPage() {
  const router = useRouter();
  const now = useNow();

  // 認証・ユーザーデータ
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [group, setGroup] = useState<any>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [groupMembers, setGroupMembers] = useState<Record<string, { name: string; email: string }>>({});
  const [loading, setLoading] = useState(true);

  // 車両ごとの予約（リアルタイム購読）
  const [resByVehicle, setResByVehicle] = useState<Record<string, RawReservation[]>>({});

  // カレンダー操作・選択ステート（日付は日本標準時の YYYY-MM-DD）
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => todayJst());
  const [direction, setDirection] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // 設定画面から戻ったときなどに、選択していた日付を復元
  useEffect(() => {
    const saved = readSession(SELECTED_DATE_KEY);
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) setSelectedDate(saved);
  }, []);

  useEffect(() => {
    writeSession(SELECTED_DATE_KEY, selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (selectedVehicleId) writeSession(SELECTED_VEHICLE_KEY, selectedVehicleId);
  }, [selectedVehicleId]);

  // モーダルステート
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editReservation, setEditReservation] = useState<any | null>(null);

  // 譲渡（交渉）ステート
  const [transfers, setTransfers] = useState<{ incoming: TransferItem[]; outgoing: TransferItem[] }>({ incoming: [], outgoing: [] });
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<{ mode: 'request' | 'offer'; reservation: any } | null>(null);

  const fetchTransfers = useCallback(async () => {
    const res = await apiFetch<{ incoming: TransferItem[]; outgoing: TransferItem[] }>('/api/transfers');
    if (res.success && res.data) setTransfers(res.data);
  }, []);

  // 初期データの取得 (プロフィール, グループ, メンバー, 車両リスト)
  const fetchInitialData = useCallback(async (uid: string) => {
    try {
      const profileSnap = await getDoc(doc(db, 'profiles', uid));
      if (!profileSnap.exists()) {
        console.error('ユーザープロフィールが見つかりません。');
        return;
      }

      const profData = profileSnap.data()!;
      if (!profData.group_id) {
        setGroup(null);
        setVehicles([]);
        return;
      }

      const [groupSnap, vehiclesSnap] = await Promise.all([
        getDoc(doc(db, 'groups', profData.group_id)),
        getDocs(query(collection(db, 'vehicles'), where('group_id', '==', profData.group_id))),
      ]);

      if (groupSnap.exists()) setGroup({ id: groupSnap.id, ...groupSnap.data() });

      const vehList = vehiclesSnap.docs
        .map((d) => ({ id: d.id, name: d.data().name, color: d.data().color, created: d.data().created_at?.seconds || 0 }))
        .sort((a, b) => a.created - b.created)
        .map(({ id, name, color }) => ({ id, name, color }));
      setVehicles(vehList);

      // 選択中の車両を維持（予約の作成・更新後に先頭の車両へ戻らないようにする）
      setSelectedVehicleId((prev) => {
        const preferred = prev || readSession(SELECTED_VEHICLE_KEY);
        if (preferred && vehList.some((v) => v.id === preferred)) return preferred;
        return vehList[0]?.id ?? null;
      });
    } catch (err) {
      console.error('初期データの取得中に例外が発生しました:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await fetchInitialData(user.uid);
      } else {
        router.replace('/login');
      }
    });
    return () => unsubscribe();
  }, [router, fetchInitialData]);

  // グループのメンバーをリアルタイム購読（後から参加した家族の名前もすぐ表示する）
  const groupId: string | undefined = group?.id;
  useEffect(() => {
    if (!groupId) return;
    return onSnapshot(
      query(collection(db, 'profiles'), where('group_id', '==', groupId)),
      (snap) => {
        const membersMap: Record<string, { name: string; email: string }> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          membersMap[d.id] = { name: data.name || '不明なユーザー', email: data.email || '' };
        });
        setGroupMembers(membersMap);
      },
      (error) => console.error('メンバーの購読エラー:', error)
    );
  }, [groupId]);

  // 全車両の予約をリアルタイム購読（「次の予約」は車両をまたいで表示するため）
  const vehicleKey = vehicles.map((v) => v.id).join(',');
  useEffect(() => {
    if (!vehicleKey) {
      setResByVehicle({});
      return;
    }
    const ids = vehicleKey.split(',');
    const unsubscribes = ids.map((vehicleId) =>
      onSnapshot(
        query(collection(db, 'reservations'), where('vehicle_id', '==', vehicleId)),
        (snap) => {
          const list: RawReservation[] = snap.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              vehicle_id: data.vehicle_id,
              user_id: data.user_id,
              start_time: data.start_time.toDate().toISOString(),
              end_time: data.end_time.toDate().toISOString(),
              invited_emails: data.invited_emails || [],
              destination: data.destination || '',
              purpose: data.purpose || '',
              series_id: data.series_id || null,
              recurrence_text: data.recurrence_text || null,
            };
          });
          setResByVehicle((prev) => ({ ...prev, [vehicleId]: list }));
        },
        (error) => {
          console.error('予約データの購読エラー:', error);
          setResByVehicle((prev) => ({ ...prev, [vehicleId]: prev[vehicleId] || [] }));
        }
      )
    );
    return () => unsubscribes.forEach((u) => u());
  }, [vehicleKey]);

  const reservationsReady = vehicles.every((v) => resByVehicle[v.id] !== undefined);

  const allReservations: ReservationView[] = useMemo(
    () =>
      Object.values(resByVehicle)
        .flat()
        .map((r) => ({ ...r, profiles: groupMembers[r.user_id] || { name: '不明なユーザー', email: '' } }))
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [resByVehicle, groupMembers]
  );

  // 選択中の車両・日付 (JST 00:00〜翌 00:00) にかかる予約
  const dayReservations = useMemo(() => {
    const { start, end } = jstDayRange(selectedDate);
    return allReservations.filter(
      (r) =>
        r.vehicle_id === selectedVehicleId &&
        new Date(r.start_time).getTime() < end.getTime() &&
        new Date(r.end_time).getTime() > start.getTime()
    );
  }, [allReservations, selectedVehicleId, selectedDate]);

  const busyDays = useMemo(
    () => new Set(allReservations.filter((r) => r.vehicle_id === selectedVehicleId).map((r) => toJstYmd(r.start_time))),
    [allReservations, selectedVehicleId]
  );

  // 譲渡依頼の定期取得（画面に戻ったとき・1分ごと）
  useEffect(() => {
    if (!currentUser) return;
    fetchTransfers();
    const timer = setInterval(fetchTransfers, 60 * 1000);
    const onFocus = () => fetchTransfers();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [currentUser, fetchTransfers]);

  const pendingIncomingCount = transfers.incoming.filter((t) => t.status === 'pending').length;
  const pendingTransferIds = useMemo(
    () =>
      new Set(
        [...transfers.incoming, ...transfers.outgoing].filter((t) => t.status === 'pending').map((t) => t.reservation_id)
      ),
    [transfers]
  );

  const otherMembers = useMemo(
    () =>
      Object.entries(groupMembers)
        .filter(([uid]) => uid !== currentUser?.uid)
        .map(([uid, m]) => ({ uid, name: m.name })),
    [groupMembers, currentUser]
  );

  // 日付の変更（前後関係に応じてスライド方向を切り替える）
  const selectDate = (ymd: string) => {
    setDirection(ymd > selectedDate ? 1 : ymd < selectedDate ? -1 : 0);
    setSelectedDate(ymd);
  };

  const handleSwipe = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 70 || Math.abs(info.offset.x) < Math.abs(info.offset.y)) return;
    selectDate(addDaysYmd(selectedDate, info.offset.x < 0 ? 1 : -1));
  };

  // 「次の予約」カードから該当日のタイムラインへ移動
  const jumpTo = (res: ReservationView) => {
    setSelectedVehicleId(res.vehicle_id);
    selectDate(toJstYmd(res.start_time));
    setHighlightId(res.id);
    setTimeout(() => timelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    setTimeout(() => setHighlightId(null), 1800);
  };

  const handleOpenCreateModal = () => {
    setEditReservation(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (res: ReservationView) => {
    setEditReservation({
      id: res.id,
      vehicle_id: res.vehicle_id,
      start_time: res.start_time,
      end_time: res.end_time,
      invited_emails: res.invited_emails,
      user_id: res.user_id,
      destination: res.destination,
      purpose: res.purpose,
      series_id: res.series_id,
      recurrence_text: res.recurrence_text,
    });
    setIsModalOpen(true);
  };

  // 予約更新後のコールバック
  const handleSuccess = async () => {
    if (currentUser) await fetchInitialData(currentUser.uid);
    fetchTransfers();
  };

  const selectedVehicleName = vehicles.find((v) => v.id === selectedVehicleId)?.name || '車両';
  // 予約・メンバー名がそろうまではスケルトンを表示（「不明なユーザー」が一瞬見えないように）
  const showSkeleton = loading || (!!group && (!reservationsReady || Object.keys(groupMembers).length === 0));

  return (
    <AnimatePresence mode="wait">
      {showSkeleton ? (
        <DashboardSkeleton key="skeleton" />
      ) : currentUser && !group ? (
        // グループ未設定の場合の案内
        <motion.div
          key="no-group"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="min-h-dvh flex items-center justify-center px-4"
        >
          <div className="glass w-full max-w-md rounded-[32px] p-7 text-center space-y-5">
            <motion.div
              initial={{ scale: 0.6, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 16 }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-b from-[#2b95ff] to-accent text-white"
            >
              <Users className="h-8 w-8" />
            </motion.div>
            <h2 className="text-[20px] font-extrabold text-ink">グループに参加してください</h2>
            <Button className="w-full" onClick={() => router.push('/login')}>
              グループを設定
            </Button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="dashboard"
          data-testid="dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="min-h-dvh w-full max-w-md mx-auto px-4 pt-[max(12px,env(safe-area-inset-top))] pb-32"
        >
          {/* ヘッダー */}
          <motion.header
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 flex items-center justify-between py-2"
          >
            <h1 className="flex items-center gap-2 text-[22px] font-extrabold tracking-tight text-ink" data-testid="group-name">
              {group?.name || 'ファミリー'}
            </h1>
            <div className="flex items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => {
                  fetchTransfers();
                  setIsInboxOpen(true);
                }}
                className="glass relative flex h-11 w-11 items-center justify-center rounded-full text-slate-600"
                aria-label="予約の譲渡"
                data-testid="open-inbox"
              >
                <ArrowRightLeft className="h-5 w-5" />
                <AnimatePresence>
                  {pendingIncomingCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 18 }}
                      className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-white"
                    >
                      {pendingIncomingCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.88, rotate: 30 }}
                onClick={() => router.push('/login')}
                className="glass flex h-11 w-11 items-center justify-center rounded-full text-slate-600"
                aria-label="設定"
                data-testid="open-settings"
              >
                <Settings className="h-5 w-5" />
              </motion.button>
            </div>
          </motion.header>

          {vehicles.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-[28px] p-6 text-center space-y-4">
              <Car className="mx-auto h-10 w-10 text-slate-300" />
              <p className="text-[15px] font-bold text-slate-600">車両が登録されていません</p>
              <Button className="w-full" onClick={() => router.push('/login')}>
                車両を登録
              </Button>
            </motion.div>
          ) : (
            <>
              <NextUp
                reservations={allReservations}
                vehicles={vehicles}
                currentUserId={currentUser?.uid || null}
                now={now}
                onJump={jumpTo}
                onCreate={handleOpenCreateModal}
              />

              <div ref={timelineRef} className="mt-7 scroll-mt-16 space-y-3">
                <VehicleTabs vehicles={vehicles} selectedVehicleId={selectedVehicleId} onSelectVehicle={setSelectedVehicleId} />
                <DateStrip selectedDate={selectedDate} onSelect={selectDate} busyDays={busyDays} />

                <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18} dragDirectionLock onDragEnd={handleSwipe} className="min-h-[200px] pt-1">
                  <AnimatePresence mode="popLayout" custom={direction} initial={false}>
                    <motion.div
                      key={`${selectedVehicleId}-${selectedDate}`}
                      custom={direction}
                      variants={dayVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                    >
                      <Timeline
                        reservations={dayReservations}
                        date={selectedDate}
                        now={now}
                        currentUserId={currentUser?.uid || null}
                        onEditReservation={handleOpenEditModal}
                        onRequestTransfer={(res) => setTransferTarget({ mode: 'request', reservation: res })}
                        onOfferTransfer={(res) => setTransferTarget({ mode: 'offer', reservation: res })}
                        pendingTransferIds={pendingTransferIds}
                        highlightId={highlightId}
                      />
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              </div>

              {/* 予約作成ボタン */}
              <motion.button
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.25 }}
                whileTap={{ scale: 0.88 }}
                whileHover={{ scale: 1.06 }}
                onClick={handleOpenCreateModal}
                className="fixed bottom-[max(24px,env(safe-area-inset-bottom))] right-[max(20px,calc(50vw-224px+20px))] z-40 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-[#2b95ff] to-accent text-white shadow-[0_14px_30px_-10px_rgba(10,132,255,0.85),inset_0_1px_0_rgba(255,255,255,0.45)]"
                aria-label="予約を作成"
                data-testid="fab-create"
              >
                <Plus className="h-7 w-7" strokeWidth={2.6} />
              </motion.button>
            </>
          )}

          <ReservationModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            vehicles={vehicles}
            currentVehicleId={selectedVehicleId}
            currentUserId={currentUser?.uid || null}
            initialDate={selectedDate}
            editReservation={editReservation}
            onSuccess={handleSuccess}
          />

          <TransferRequestModal
            isOpen={!!transferTarget}
            mode={transferTarget?.mode || 'request'}
            reservation={transferTarget?.reservation || null}
            vehicleName={selectedVehicleName}
            members={otherMembers}
            onClose={() => setTransferTarget(null)}
            onDone={fetchTransfers}
          />

          <TransferInbox
            isOpen={isInboxOpen}
            onClose={() => setIsInboxOpen(false)}
            incoming={transfers.incoming}
            outgoing={transfers.outgoing}
            onChanged={fetchTransfers}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
