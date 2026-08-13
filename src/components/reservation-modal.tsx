'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { auth } from '@/lib/firebase';
import { 
  X, 
  Calendar as CalendarIcon, 
  Clock, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Trash2,
  CalendarPlus
} from 'lucide-react';

interface Vehicle {
  id: string;
  name: string;
  color: string;
}

interface Reservation {
  id: string;
  vehicle_id: string;
  start_time: string;
  end_time: string;
  invited_emails: string[];
  user_id: string;
  destination?: string;
  purpose?: string;
}

interface ReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  currentVehicleId: string | null;
  currentUserId: string | null;
  editReservation?: Reservation | null;
  onSuccess: () => void;
}

export default function ReservationModal({
  isOpen,
  onClose,
  vehicles,
  currentVehicleId,
  currentUserId,
  editReservation,
  onSuccess,
}: ReservationModalProps) {
  const isEditMode = !!editReservation;

  // フォームステート
  const [vehicleId, setVehicleId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  
  // 招待メール用ステート
  const [emailInput, setEmailInput] = useState('');
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  
  // 状態管理
  const [checking, setChecking] = useState(false);
  const [conflict, setConflict] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successGoogleUrl, setSuccessGoogleUrl] = useState<string | null>(null);

  // フォーム初期値の設定
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      setSuccessGoogleUrl(null);

      if (editReservation) {
        setVehicleId(editReservation.vehicle_id);
        const start = new Date(editReservation.start_time);
        const end = new Date(editReservation.end_time);
        
        // 日付を YYYY-MM-DD に変換
        const yyyy = start.getFullYear();
        const mm = String(start.getMonth() + 1).padStart(2, '0');
        const dd = String(start.getDate()).padStart(2, '0');
        setDate(`${yyyy}-${mm}-${dd}`);

        // 時間を HH:MM に変換
        setStartTime(String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0'));
        setEndTime(String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0'));
        setInvitedEmails(editReservation.invited_emails || []);
        setDestination(editReservation.destination || '');
        setPurpose(editReservation.purpose || '');
      } else {
        setVehicleId(currentVehicleId || (vehicles[0]?.id || ''));
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setDate(`${yyyy}-${mm}-${dd}`);
        setStartTime('09:00');
        setEndTime('18:00');
        setInvitedEmails([]);
        setDestination('');
        setPurpose('');
      }
    }
  }, [isOpen, editReservation, currentVehicleId, vehicles]);

  // リアルタイム競合チェック関数
  const checkConflict = useCallback(async () => {
    if (!vehicleId || !date || !startTime || !endTime) {
      setConflict(null);
      return;
    }

    const startStr = `${date}T${startTime}:00`;
    const endStr = `${date}T${endTime}:00`;

    const startDateTime = new Date(startStr);
    const endDateTime = new Date(endStr);

    if (startDateTime.getTime() >= endDateTime.getTime()) {
      setConflict(true);
      return;
    }

    setChecking(true);
    try {
      // ユーザー ID トークンの取得
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        setConflict(null);
        setChecking(false);
        return;
      }

      const url = new URL('/api/reservations/check', window.location.origin);
      url.searchParams.append('vehicle_id', vehicleId);
      url.searchParams.append('start_time', startDateTime.toISOString());
      url.searchParams.append('end_time', endDateTime.toISOString());
      if (editReservation?.id) {
        url.searchParams.append('reservation_id', editReservation.id);
      }

      const res = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      const data = await res.json();
      
      if (res.ok) {
        setConflict(data.conflict);
      } else {
        console.error('競合チェック API エラー:', data.error);
        setConflict(null);
      }
    } catch (err) {
      console.error('競合チェック通信エラー:', err);
      setConflict(null);
    } finally {
      setChecking(false);
    }
  }, [vehicleId, date, startTime, endTime, editReservation]);

  // 入力値変更時に競合チェックを実行
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (isOpen) {
        checkConflict();
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [vehicleId, date, startTime, endTime, checkConflict, isOpen]);

  // 招待メール追加
  const addEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim();
    if (cleanEmail && !invitedEmails.includes(cleanEmail)) {
      if (/\S+@\S+\.\S+/.test(cleanEmail)) {
        setInvitedEmails([...invitedEmails, cleanEmail]);
        setEmailInput('');
      } else {
        alert('正しいメールアドレスを入力してください。');
      }
    }
  };

  // 招待メール削除
  const removeEmail = (index: number) => {
    setInvitedEmails(invitedEmails.filter((_, i) => i !== index));
  };

  // 送信処理
  const handleSubmit = async () => {
    if (!vehicleId || !date || !startTime || !endTime) {
      setErrorMessage('すべての項目を入力してください。');
      return;
    }

    const startStr = `${date}T${startTime}:00`;
    const endStr = `${date}T${endTime}:00`;

    const startDateTime = new Date(startStr);
    const endDateTime = new Date(endStr);

    if (startDateTime.getTime() >= endDateTime.getTime()) {
      setErrorMessage('開始時間は終了時間より前に設定してください。');
      return;
    }

    if (conflict) {
      setErrorMessage('選択した時間帯は既に予約されています。');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    const inputData = {
      vehicle_id: vehicleId,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      invited_emails: invitedEmails,
      destination: destination.trim(),
      purpose: purpose.trim(),
    };

    try {
      // ユーザー ID トークンを取得して API に渡す
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        setErrorMessage('セッションの期限が切れました。ログインし直してください。');
        setSubmitting(false);
        return;
      }

      if (isEditMode && editReservation) {
        // 更新処理 (PUT)
        const response = await fetch('/api/reservations', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            id: editReservation.id,
            ...inputData,
          }),
        });
        const res = await response.json();
        if (res.success) {
          onSuccess();
          onClose();
        } else {
          setErrorMessage(res.error || '予約の更新に失敗しました。');
        }
      } else {
        // 新規作成 (POST)
        const response = await fetch('/api/reservations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify(inputData),
        });
        const res = await response.json();
        if (res.success) {
          if (res.data?.googleCalendarUrl) {
            setSuccessGoogleUrl(res.data.googleCalendarUrl);
          } else {
            onSuccess();
            onClose();
          }
        } else {
          setErrorMessage(res.error || '予約の作成に失敗しました。');
        }
      }
    } catch (err: any) {
      console.error('送信エラー:', err);
      setErrorMessage(`送信エラー: ${err.message || '通信エラーが発生しました。時間を置いて再度お試しください。'}`);
    } finally {
      setSubmitting(false);
    }
  };

  // 削除処理
  const handleDelete = async () => {
    if (!editReservation) return;
    if (!confirm('この予約を本当に削除しますか？')) return;

    setSubmitting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        setErrorMessage('セッションエラーです。');
        setSubmitting(false);
        return;
      }

      const response = await fetch(`/api/reservations?id=${editReservation.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });
      const res = await response.json();
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || '予約の削除に失敗しました。');
      }
    } catch (err: any) {
      console.error('削除エラー:', err);
      setErrorMessage('削除中に通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
      <div 
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-slide-up sm:animate-fade-in"
      >
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50 rounded-t-3xl">
          <h3 className="text-base font-bold text-slate-800">
            {successGoogleUrl ? '予約が完了しました！' : isEditMode ? '予約を編集' : '新しい予約を作成'}
          </h3>
          <button 
            onClick={() => {
              if (successGoogleUrl) onSuccess();
              onClose();
            }} 
            className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 予約完了画面（Googleカレンダー連携の案内） */}
        {successGoogleUrl ? (
          <div className="p-6 flex-grow flex flex-col items-center justify-center text-center space-y-5 overflow-y-auto">
            <div className="h-16 w-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-800">予約が正常に完了しました</h4>
              <p className="text-xs text-slate-500 mt-2 px-4 leading-relaxed">
                カレンダーに追加することで、スマートフォンのカレンダーアプリに予約情報を自動で登録できます。同乗者への招待メールも送信されました。
              </p>
            </div>
            
            <a
              href={successGoogleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
            >
              <CalendarPlus className="h-5 w-5" />
              Google カレンダーに追加する
            </a>

            <button
              onClick={() => {
                onSuccess();
                onClose();
              }}
              className="w-full py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-2xl font-semibold text-xs transition-all"
            >
              閉じる
            </button>
          </div>
        ) : (
          /* 通常入力フォーム */
          <div className="p-5 flex-grow overflow-y-auto space-y-4">
            {/* 車両選択 */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5">共有車両</label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                disabled={isEditMode}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white disabled:opacity-60 disabled:bg-slate-50 font-medium"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 日付設定 */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5">予約日</label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-3 h-5 w-5 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                />
              </div>
            </div>

            {/* 時間設定 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5">開始時刻</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="time"
                    required
                    step="900"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5">終了時刻</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="time"
                    required
                    step="900"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                  />
                </div>
              </div>
            </div>

            {/* 行き先・目的設定（任意） */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                  行き先 <span className="text-slate-400 font-normal">(任意)</span>
                </label>
                <input
                  type="text"
                  placeholder="例：イオンモール, 病院"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                  目的 <span className="text-slate-400 font-normal">(任意)</span>
                </label>
                <input
                  type="text"
                  placeholder="例：買い物, 送り迎え"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                />
              </div>
            </div>

            {/* リアルタイム競合バッジ */}
            <div className="pt-1">
              {checking ? (
                <div className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-lg">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  空き状況を確認中...
                </div>
              ) : conflict === true ? (
                <div className="inline-flex items-center gap-1 text-[10px] text-red-600 font-bold px-2.5 py-1 bg-red-50 border border-red-100 rounded-lg">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                  選択した時間帯は既に予約されています
                </div>
              ) : conflict === false ? (
                <div className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  この時間帯で予約可能です
                </div>
              ) : null}
            </div>

            <hr className="border-slate-100" />

            {/* 同乗者の招待メール */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center justify-between">
                <span>同乗者を招待（メール）</span>
                <span className="text-[9px] text-slate-400 font-normal">登録完了時にメールで .ics を送信します</span>
              </label>
              
              <form onSubmit={addEmail} className="flex gap-2">
                <div className="relative flex-grow">
                  <Mail className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="family@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all flex-shrink-0"
                >
                  追加
                </button>
              </form>

              {/* 招待メールアドレス一覧タグ */}
              {invitedEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 bg-slate-50 p-2 border border-slate-100 rounded-xl max-h-24 overflow-y-auto">
                  {invitedEmails.map((email, idx) => (
                    <span 
                      key={idx} 
                      className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 bg-white text-[10px] font-semibold text-slate-600 rounded-lg border border-slate-200"
                    >
                      {email}
                      <button 
                        type="button" 
                        onClick={() => removeEmail(idx)} 
                        className="p-0.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* エラーメッセージ表示 */}
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-semibold flex gap-1.5 items-start">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 送信ボタン */}
            <div className="pt-2 flex gap-2">
              {isEditMode && editReservation && editReservation.user_id === currentUserId && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={submitting}
                  className="px-4 py-3 border border-red-200 text-red-500 hover:bg-red-50 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1 flex-shrink-0 disabled:opacity-50"
                  title="予約を削除"
                >
                  <Trash2 className="h-4.5 w-4.5" />
                  削除
                </button>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || checking || conflict === true}
                className="flex-grow py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    送信中...
                  </>
                ) : (
                  '予約を確定する'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
