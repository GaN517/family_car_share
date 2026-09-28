'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import { addDaysYmd, jstToDate, toJstHm, toJstYmd, weekdayLabel, weekdayOfYmd } from '@/lib/datetime';
import {
  describeRecurrence,
  generateOccurrences,
  MAX_OCCURRENCES,
  type RecurrenceFrequency,
  type RecurrenceRule,
} from '@/lib/recurrence';
import {
  X,
  Calendar as CalendarIcon,
  Clock,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  CalendarPlus,
  Repeat,
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
  series_id?: string | null;
  recurrence_text?: string | null;
}

interface ConflictItem {
  start_time: string;
  end_time: string;
  label: string;
}

interface ReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  currentVehicleId: string | null;
  currentUserId: string | null;
  /** ホーム画面で選択中の日付 (YYYY-MM-DD, JST)。新規予約の初期値に使用します */
  initialDate: string;
  editReservation?: Reservation | null;
  onSuccess: () => void;
}

type RepeatOption = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

const REPEAT_OPTIONS: { value: RepeatOption; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'daily', label: '毎日' },
  { value: 'weekly', label: '毎週' },
  { value: 'biweekly', label: '隔週' },
  { value: 'monthly', label: '毎月' },
];

export default function ReservationModal({
  isOpen,
  onClose,
  vehicles,
  currentVehicleId,
  currentUserId,
  initialDate,
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

  // 繰り返し設定
  const [repeat, setRepeat] = useState<RepeatOption>('none');
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>([]);
  const [repeatUntil, setRepeatUntil] = useState('');

  // 招待メール用ステート
  const [emailInput, setEmailInput] = useState('');
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);

  // 状態管理
  const [checking, setChecking] = useState(false);
  const [conflict, setConflict] = useState<boolean | null>(null);
  const [conflictList, setConflictList] = useState<ConflictItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState<{ googleUrl: string; count: number; skipped: ConflictItem[] } | null>(null);
  const [showDeleteOptions, setShowDeleteOptions] = useState(false);

  // フォーム初期値の設定
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage('');
    setSuccess(null);
    setShowDeleteOptions(false);
    setConflictList([]);
    setRepeat('none');
    setEmailInput('');

    if (editReservation) {
      setVehicleId(editReservation.vehicle_id);
      // 日本標準時で日付・時刻を表示
      setDate(toJstYmd(editReservation.start_time));
      setStartTime(toJstHm(editReservation.start_time));
      setEndTime(toJstHm(editReservation.end_time));
      setInvitedEmails(editReservation.invited_emails || []);
      setDestination(editReservation.destination || '');
      setPurpose(editReservation.purpose || '');
    } else {
      setVehicleId(currentVehicleId || vehicles[0]?.id || '');
      // ホーム画面で選択している日付を初期値にする
      setDate(initialDate || toJstYmd(new Date()));
      setStartTime('09:00');
      setEndTime('18:00');
      setInvitedEmails([]);
      setDestination('');
      setPurpose('');
    }
  }, [isOpen, editReservation, currentVehicleId, vehicles, initialDate]);

  // 繰り返しの既定値（曜日 = 予約日の曜日、終了日 = 約1か月後）
  useEffect(() => {
    if (!date) return;
    setRepeatWeekdays([weekdayOfYmd(date)]);
    setRepeatUntil((prev) => (prev && prev >= date ? prev : addDaysYmd(date, 28)));
  }, [date]);

  const recurrence: RecurrenceRule | null = useMemo(() => {
    if (isEditMode || repeat === 'none' || !repeatUntil) return null;
    const frequency: RecurrenceFrequency = repeat === 'biweekly' ? 'weekly' : repeat;
    return {
      frequency,
      interval: repeat === 'biweekly' ? 2 : 1,
      ...(frequency === 'weekly' ? { weekdays: repeatWeekdays } : {}),
      until: repeatUntil,
    };
  }, [isEditMode, repeat, repeatUntil, repeatWeekdays]);

  const timeRange = useMemo(() => {
    if (!date || !startTime || !endTime) return null;
    const start = jstToDate(date, startTime);
    const end = jstToDate(date, endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    return { start, end };
  }, [date, startTime, endTime]);

  const occurrenceCount = useMemo(() => {
    if (!recurrence || !timeRange || timeRange.start >= timeRange.end) return 1;
    return generateOccurrences(timeRange.start, timeRange.end, recurrence).length;
  }, [recurrence, timeRange]);

  // リアルタイム競合チェック関数
  const checkConflict = useCallback(async () => {
    if (!vehicleId || !timeRange) {
      setConflict(null);
      return;
    }
    if (timeRange.start.getTime() >= timeRange.end.getTime()) {
      setConflict(true);
      setConflictList([]);
      return;
    }

    setChecking(true);
    const params = new URLSearchParams({
      vehicle_id: vehicleId,
      start_time: timeRange.start.toISOString(),
      end_time: timeRange.end.toISOString(),
    });
    if (editReservation?.id) params.append('reservation_id', editReservation.id);
    if (recurrence) params.append('recurrence', JSON.stringify(recurrence));

    const res = await apiFetch(`/api/reservations/check?${params.toString()}`);
    if (res.error) {
      console.error('競合チェック API エラー:', res.error);
      setConflict(null);
      setConflictList([]);
    } else {
      setConflict(!!res.conflict);
      setConflictList(res.conflicts || []);
    }
    setChecking(false);
  }, [vehicleId, timeRange, editReservation, recurrence]);

  // 入力値変更時に競合チェックを実行
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (isOpen) {
        checkConflict();
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [checkConflict, isOpen]);

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

  const toggleWeekday = (w: number) => {
    setRepeatWeekdays((prev) => (prev.includes(w) ? (prev.length > 1 ? prev.filter((x) => x !== w) : prev) : [...prev, w]));
  };

  // 繰り返しで一部だけ重複している場合は、重複分をスキップして予約できる
  const isRecurring = !!recurrence && occurrenceCount > 1;
  const allConflict = conflictList.length >= occurrenceCount;
  const canSkipConflicts = isRecurring && conflict === true && conflictList.length > 0 && !allConflict;

  // 送信処理（新規作成・編集）
  const handleSubmit = async () => {
    if (!vehicleId || !timeRange) {
      setErrorMessage('すべての項目を入力してください。');
      return;
    }
    if (timeRange.start.getTime() >= timeRange.end.getTime()) {
      setErrorMessage('開始時間は終了時間より前に設定してください。');
      return;
    }
    if (conflict && !canSkipConflicts) {
      setErrorMessage('選択した時間帯は既に予約されています。');
      return;
    }
    if (recurrence && occurrenceCount === 0) {
      setErrorMessage('繰り返し条件に該当する日がありません。');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    const inputData = {
      vehicle_id: vehicleId,
      start_time: timeRange.start.toISOString(),
      end_time: timeRange.end.toISOString(),
      invited_emails: invitedEmails,
      destination: destination.trim(),
      purpose: purpose.trim(),
    };

    if (isEditMode && editReservation) {
      const res = await apiFetch('/api/reservations', {
        method: 'PUT',
        body: { id: editReservation.id, ...inputData },
      });
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || '予約の更新に失敗しました。');
      }
    } else {
      const res = await apiFetch('/api/reservations', {
        method: 'POST',
        body: {
          ...inputData,
          ...(recurrence ? { recurrence, skip_conflicts: canSkipConflicts } : {}),
        },
      });
      if (res.success) {
        setSuccess({
          googleUrl: res.data?.googleCalendarUrl || '',
          count: res.data?.count || 1,
          skipped: res.data?.skipped || [],
        });
      } else {
        if (res.conflicts) setConflictList(res.conflicts);
        setErrorMessage(res.error || '予約の作成に失敗しました。');
      }
    }
    setSubmitting(false);
  };

  // 削除処理
  const handleDelete = async (scope: 'single' | 'future' | 'all') => {
    if (!editReservation) return;
    const label = scope === 'single' ? 'この予約' : scope === 'future' ? 'この回以降の繰り返し予約' : '繰り返し予約すべて';
    if (!confirm(`${label}を本当に削除しますか？`)) return;

    setSubmitting(true);
    const res = await apiFetch(`/api/reservations?id=${encodeURIComponent(editReservation.id)}&scope=${scope}`, {
      method: 'DELETE',
    });
    setSubmitting(false);
    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setErrorMessage(res.error || '予約の削除に失敗しました。');
    }
  };

  const closeModal = () => {
    if (success) onSuccess();
    onClose();
  };

  if (!isOpen) return null;

  const inputClass =
    'w-full rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-slide-up sm:animate-fade-in">
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50 rounded-t-3xl">
          <h3 className="text-base font-bold text-slate-800">
            {success ? '予約が完了しました！' : isEditMode ? '予約を編集' : '新しい予約を作成'}
          </h3>
          <button
            onClick={closeModal}
            className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 予約完了画面（Googleカレンダー連携の案内） */}
        {success ? (
          <div className="p-6 flex-grow flex flex-col items-center justify-center text-center space-y-5 overflow-y-auto">
            <div className="h-16 w-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-800">
                {success.count > 1 ? `${success.count}件の予約が完了しました` : '予約が正常に完了しました'}
              </h4>
              <p className="text-xs text-slate-500 mt-2 px-4 leading-relaxed">
                カレンダーに追加することで、スマートフォンのカレンダーアプリに予約情報を登録できます。
                {invitedEmails.length > 0 && '同乗者への招待メールも送信されました。'}
              </p>
            </div>

            {success.skipped.length > 0 && (
              <div className="w-full text-left p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-800">
                <p className="font-bold mb-1">以下の日程は既存の予約と重複したためスキップしました:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {success.skipped.map((s) => (
                    <li key={s.start_time}>{s.label}</li>
                  ))}
                </ul>
              </div>
            )}

            {success.googleUrl && (
              <a
                href={success.googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
              >
                <CalendarPlus className="h-5 w-5" />
                Google カレンダーに追加する{success.count > 1 ? '（初回分）' : ''}
              </a>
            )}

            <button
              onClick={closeModal}
              className="w-full py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-2xl font-semibold text-xs transition-all"
            >
              閉じる
            </button>
          </div>
        ) : (
          /* 通常入力フォーム */
          <div className="p-5 flex-grow overflow-y-auto space-y-4">
            {isEditMode && editReservation?.series_id && (
              <div className="p-2.5 bg-violet-50 border border-violet-100 text-violet-700 rounded-xl text-[11px] flex items-center gap-1.5">
                <Repeat className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  繰り返し予約の1回分です{editReservation.recurrence_text ? `（${editReservation.recurrence_text}）` : ''}。
                  変更はこの回のみに反映されます。
                </span>
              </div>
            )}

            {/* 車両選択 */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5">共有車両</label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                disabled={isEditMode}
                className={`${inputClass} px-3 py-2.5 bg-white disabled:opacity-60 disabled:bg-slate-50`}
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
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                {recurrence ? '初回の予約日' : '予約日'}
              </label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-3 h-5 w-5 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${inputClass} pl-10 pr-4 py-2.5`}
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
                    className={`${inputClass} pl-9 pr-3 py-2.5`}
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
                    className={`${inputClass} pl-9 pr-3 py-2.5`}
                  />
                </div>
              </div>
            </div>

            {/* 繰り返し設定（新規作成時のみ） */}
            {!isEditMode && (
              <div className="p-3 border border-slate-100 rounded-2xl bg-slate-50/50 space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                    <Repeat className="h-3.5 w-3.5" />
                    繰り返し
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {REPEAT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRepeat(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                          repeat === opt.value
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-indigo-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(repeat === 'weekly' || repeat === 'biweekly') && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">曜日</label>
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4, 5, 6].map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => toggleWeekday(w)}
                          className={`h-8 w-8 rounded-full text-[11px] font-bold border transition-all ${
                            repeatWeekdays.includes(w)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : `bg-white border-slate-200 ${w === 0 ? 'text-rose-500' : w === 6 ? 'text-sky-600' : 'text-slate-600'}`
                          }`}
                        >
                          {weekdayLabel(w)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {repeat !== 'none' && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">終了日（この日を含む）</label>
                    <input
                      type="date"
                      value={repeatUntil}
                      min={date}
                      max={date ? addDaysYmd(date, 366) : undefined}
                      onChange={(e) => setRepeatUntil(e.target.value)}
                      className={`${inputClass} px-3 py-2 bg-white`}
                    />
                    {recurrence && timeRange && (
                      <p className="text-[10px] text-slate-500 mt-1.5">
                        {describeRecurrence(recurrence, timeRange.start)} ・ 全{occurrenceCount}回
                        {occurrenceCount >= MAX_OCCURRENCES && `（上限${MAX_OCCURRENCES}回）`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

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
                  className={`${inputClass} px-3 py-2.5`}
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
                  className={`${inputClass} px-3 py-2.5`}
                />
              </div>
            </div>

            {/* リアルタイム競合バッジ */}
            <div className="pt-1 space-y-2">
              {checking ? (
                <div className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-lg">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  空き状況を確認中...
                </div>
              ) : conflict === true ? (
                isRecurring && conflictList.length > 0 ? (
                  <div className={`p-2.5 rounded-xl border text-[11px] ${allConflict ? 'bg-red-50 border-red-100 text-red-700' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                    <p className="font-bold flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {occurrenceCount}回中{conflictList.length}回が既存の予約と重複しています
                    </p>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5 max-h-20 overflow-y-auto">
                      {conflictList.map((c) => (
                        <li key={c.start_time}>{c.label}</li>
                      ))}
                    </ul>
                    {!allConflict && <p className="mt-1">確定すると重複する日程を除いて予約します。</p>}
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1 text-[10px] text-red-600 font-bold px-2.5 py-1 bg-red-50 border border-red-100 rounded-lg">
                    <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    {timeRange && timeRange.start >= timeRange.end
                      ? '終了時刻は開始時刻より後にしてください'
                      : '選択した時間帯は既に予約されています'}
                  </div>
                )
              ) : conflict === false ? (
                <div className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {isRecurring ? `全${occurrenceCount}回とも予約可能です` : 'この時間帯で予約可能です'}
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

            {/* 繰り返し予約の削除範囲の選択 */}
            {showDeleteOptions && editReservation && (
              <div className="p-3 border border-red-100 bg-red-50/50 rounded-2xl space-y-2">
                <p className="text-[11px] font-bold text-red-700">削除する範囲を選択してください</p>
                <div className="grid grid-cols-1 gap-1.5">
                  <button type="button" disabled={submitting} onClick={() => handleDelete('single')} className="py-2 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 disabled:opacity-50">
                    この予約のみ
                  </button>
                  <button type="button" disabled={submitting} onClick={() => handleDelete('future')} className="py-2 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 disabled:opacity-50">
                    この回以降すべて
                  </button>
                  <button type="button" disabled={submitting} onClick={() => handleDelete('all')} className="py-2 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 disabled:opacity-50">
                    繰り返し予約すべて
                  </button>
                </div>
              </div>
            )}

            {/* 送信ボタン */}
            <div className="pt-2 flex gap-2">
              {isEditMode && editReservation && editReservation.user_id === currentUserId && (
                <button
                  type="button"
                  onClick={() => (editReservation.series_id ? setShowDeleteOptions((v) => !v) : handleDelete('single'))}
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
                disabled={submitting || checking || (conflict === true && !canSkipConflicts)}
                className="flex-grow py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    送信中...
                  </>
                ) : canSkipConflicts ? (
                  `重複を除いて${occurrenceCount - conflictList.length}件を予約する`
                ) : isRecurring ? (
                  `${occurrenceCount}件の予約を確定する`
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
