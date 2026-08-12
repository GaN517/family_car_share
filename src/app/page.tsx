'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  onSnapshot
} from 'firebase/firestore';
import { formatJapaneseDate } from '@/lib/utils';
import VehicleTabs from '@/components/vehicle-tabs';
import Timeline from '@/components/timeline';
import ReservationModal from '@/components/reservation-modal';
import { 
  Settings, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Car, 
  Info
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();

  // 認証・ユーザーデータ
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [groupMembers, setGroupMembers] = useState<Record<string, { name: string; email: string }>>({});
  const [loading, setLoading] = useState(true);

  // カレンダー操作・選択ステート
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // モーダルステート
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editReservation, setEditReservation] = useState<any | null>(null);

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await fetchInitialData(user.uid);
      } else {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  // 初期データの取得 (プロフィール, グループ, 車両リスト)
  const fetchInitialData = async (uid: string) => {
    try {
      const profileRef = doc(db, 'profiles', uid);
      const profileSnap = await getDoc(profileRef);

      if (!profileSnap.exists()) {
        console.error('ユーザープロフィールが見つかりません。');
        setLoading(false);
        return;
      }

      const profData = profileSnap.data()!;
      setProfile(profData);
      
      if (profData.group_id) {
        // グループ情報の取得
        const groupRef = doc(db, 'groups', profData.group_id);
        const groupSnap = await getDoc(groupRef);
        if (groupSnap.exists()) {
          setGroup({ id: groupSnap.id, ...groupSnap.data() });
        }

        // 同一グループのメンバー全員のプロフィールを取得（ユーザーIDから名前をマッピングするため）
        const membersQuery = query(
          collection(db, 'profiles'),
          where('group_id', '==', profData.group_id)
        );
        const membersSnap = await getDocs(membersQuery);
        const membersMap: Record<string, { name: string; email: string }> = {};
        membersSnap.docs.forEach(doc => {
          const data = doc.data();
          membersMap[doc.id] = {
            name: data.name || '不明なユーザー',
            email: data.email || '',
          };
        });
        setGroupMembers(membersMap);

        // 車両リストの取得
        const vehiclesQuery = query(
          collection(db, 'vehicles'),
          where('group_id', '==', profData.group_id)
        );
        const vehiclesSnap = await getDocs(vehiclesQuery);
        const vehList = vehiclesSnap.docs.map(doc => ({ 
          id: doc.id, 
          name: doc.data().name,
          color: doc.data().color
        }));

        setVehicles(vehList);
        
        if (vehList.length > 0) {
          setSelectedVehicleId(vehList[0].id);
        }
      } else {
        setGroup(null);
        setVehicles([]);
      }
    } catch (err) {
      console.error('初期データの取得中に例外が発生しました:', err);
    } finally {
      setLoading(false);
    }
  };

  // 予約データのリアルタイムリスナー設定
  useEffect(() => {
    if (!selectedVehicleId) {
      setReservations([]);
      return;
    }

    // 選択された日付の 00:00:00 〜 23:59:59
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // インデックス設定を回避しつつ、日付フィルタを安全に処理するため、
    // まず車両に紐づくすべての予約を購読し、クライアント側で日付フィルタとソートを行います。
    const resQuery = query(
      collection(db, 'reservations'),
      where('vehicle_id', '==', selectedVehicleId)
    );

    const unsubscribe = onSnapshot(resQuery, (querySnapshot) => {
      const allReservations = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          vehicle_id: data.vehicle_id,
          user_id: data.user_id,
          start_time: data.start_time.toDate().toISOString(),
          end_time: data.end_time.toDate().toISOString(),
          invited_emails: data.invited_emails || [],
          profiles: groupMembers[data.user_id] || { name: '不明なユーザー', email: '' }
        };
      });

      // クライアント側での日付フィルタ
      const filtered = allReservations.filter(res => {
        const resStart = new Date(res.start_time).getTime();
        return resStart >= startOfDay.getTime() && resStart <= endOfDay.getTime();
      });

      // 開始時間でソート
      filtered.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      setReservations(filtered);
    }, (error) => {
      console.error('予約データの購読エラー:', error);
    });

    return () => unsubscribe();
  }, [selectedVehicleId, selectedDate, groupMembers]);

  // 日付の操作
  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + days);
    setSelectedDate(newDate);
  };

  // 今日へ移動
  const goToToday = () => {
    setSelectedDate(new Date());
  };

  // 予約作成モーダルオープン
  const handleOpenCreateModal = () => {
    setEditReservation(null);
    setIsModalOpen(true);
  };

  // 予約編集モーダルオープン
  const handleOpenEditModal = (res: any) => {
    // 編集モーダルに合わせるために Timestamp などのオブジェクト構造を合わせる
    setEditReservation({
      id: res.id,
      vehicle_id: res.vehicle_id,
      start_time: res.start_time,
      end_time: res.end_time,
      invited_emails: res.invited_emails,
      user_id: res.user_id
    });
    setIsModalOpen(true);
  };

  // 予約更新後のコールバック (モーダルでの変更時に再読み込みをトリガー)
  const handleSuccess = async () => {
    if (currentUser) {
      await fetchInitialData(currentUser.uid);
    }
  };

  // 日付選択用の1週間分のリストを生成
  const getWeekDates = () => {
    const dates = [];
    const baseDate = new Date(selectedDate);
    for (let i = -3; i <= 3; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // グループ未設定の場合の案内
  if (currentUser && !group) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4 flex flex-col justify-center">
        <div className="w-full max-w-md mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 p-6 space-y-6 text-center">
          <div className="h-16 w-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto">
            <Info className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">グループの設定が必要です</h2>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              車の予約を開始するには、まず車共有グループを作成するか、既存のグループに参加する必要があります。
            </p>
          </div>
          <button
            onClick={() => router.push('/login')}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-semibold text-sm shadow-md transition-all"
          >
            設定画面へ移動する
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <main className="w-full max-w-md mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden flex flex-col min-h-[85vh] relative">
        {/* ヘッダー */}
        <header className="flex items-center justify-between p-4 border-b border-slate-100">
          <div>
            <span className="text-[9px] uppercase font-bold text-indigo-600 tracking-wider">車共有ダッシュボード</span>
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-1">
              <Car className="h-5 w-5 text-indigo-600" />
              {group?.name || 'ファミリー'}
            </h2>
          </div>
          <button
            onClick={() => router.push('/login')}
            className="p-2 hover:bg-slate-50 rounded-xl text-slate-500 hover:text-indigo-600 border border-slate-100 transition-all flex items-center gap-1 text-xs font-bold"
          >
            <Settings className="h-4.5 w-4.5" />
            設定・管理
          </button>
        </header>

        {/* 車両切り替えタブ */}
        {vehicles.length > 0 ? (
          <div className="py-3 border-b border-slate-100 bg-slate-50/30">
            <VehicleTabs
              vehicles={vehicles}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={setSelectedVehicleId}
            />
          </div>
        ) : (
          <div className="p-4 bg-amber-50 border-b border-amber-100 text-amber-800 text-xs flex gap-2">
            <Info className="h-5 w-5 flex-shrink-0" />
            <div>
              車両が登録されていません。右上の「設定・管理」ボタンから車両を登録してください。
            </div>
          </div>
        )}

        {/* 週めくり日付ナビゲーション */}
        <div className="bg-white py-3 border-b border-slate-50 flex items-center justify-between px-2">
          <button 
            onClick={() => changeDate(-1)} 
            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-700 transition-all"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-1.5">
            <CalendarIcon className="h-4.5 w-4.5 text-indigo-500" />
            <span className="text-xs font-bold text-slate-800">
              {formatJapaneseDate(selectedDate)}
            </span>
            <button 
              onClick={goToToday} 
              className="text-[10px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 px-2 py-0.5 rounded-md font-bold transition-all ml-1.5"
            >
              今日
            </button>
          </div>

          <button 
            onClick={() => changeDate(1)} 
            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-700 transition-all"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* 1週間分の日付ショートカット表示 */}
        <div className="flex justify-between px-4 py-2 bg-slate-50/50 border-b border-slate-100 overflow-x-auto scrollbar-none">
          {getWeekDates().map((d, idx) => {
            const isSelected = d.toDateString() === selectedDate.toDateString();
            const dayNum = d.getDate();
            const dayOfWeek = d.toLocaleDateString('ja-JP', { weekday: 'short' });
            const isToday = d.toDateString() === new Date().toDateString();

            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(d)}
                className={`flex flex-col items-center p-2 rounded-xl min-w-[44px] transition-all ${
                  isSelected 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                    : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                <span className={`text-[8px] font-bold ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                  {dayOfWeek}
                </span>
                <span className="text-xs font-extrabold mt-0.5">{dayNum}</span>
                {isToday && !isSelected && (
                  <span className="h-1 w-1 bg-indigo-500 rounded-full mt-0.5"></span>
                )}
              </button>
            );
          })}
        </div>

        {/* 予約タイムライン表示 */}
        <div className="flex-grow pb-24">
          <Timeline
            reservations={reservations}
            currentUserId={currentUser?.uid || null}
            onEditReservation={handleOpenEditModal}
          />
        </div>

        {/* 予約作成用 Floating Action Button (FAB) */}
        {vehicles.length > 0 && (
          <button
            onClick={handleOpenCreateModal}
            className="absolute bottom-6 right-6 h-14 w-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg shadow-indigo-600/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-10"
            title="予約を作成"
          >
            <Plus className="h-7 w-7" />
          </button>
        )}
      </main>

      {/* 予約作成・編集モーダル */}
      <ReservationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        vehicles={vehicles}
        currentVehicleId={selectedVehicleId}
        currentUserId={currentUser?.uid || null}
        editReservation={editReservation}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
