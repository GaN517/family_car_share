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
import { AnimatePresence, motion } from 'motion/react';
import { X, Mail, Check, CheckCircle2, AlertCircle, Loader2, Trash2, CalendarPlus, Repeat } from 'lucide-react';
import Sheet from '@/components/ui/sheet';
import { Button, FieldLabel, Notice, vehicleColor } from '@/components/ui/primitives';

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
    setConflict(null);
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
        setErrorMessage('正しいメールアドレスを入力してください。');
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

  const setDuration = (hours: number) => {
    const [h, m] = startTime.split(':').map(Number);
    const total = Math.min(h * 60 + m + hours * 60, 23 * 60 + 45);
    setEndTime(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
  };

  const durationMinutes = timeRange ? Math.round((timeRange.end.getTime() - timeRange.start.getTime()) / 60000) : 0;

  const submitLabel = canSkipConflicts
    ? `重複を除いて${occurrenceCount - conflictList.length}件を予約`
    : isRecurring
      ? `${occurrenceCount}件を予約`
      : isEditMode
        ? '変更を保存'
        : '予約する';

  return (
    <Sheet
      open={isOpen}
      onClose={closeModal}
      testId="reservation-sheet"
      title={success ? '予約しました' : isEditMode ? '予約を編集' : '新しい予約'}
      footer={
        success ? (
          <Button variant="secondary" className="w-full" onClick={closeModal}>
            閉じる
          </Button>
        ) : (
          <div className="flex gap-2">
            {isEditMode && editReservation && editReservation.user_id === currentUserId && (
              <Button
                variant="danger"
                onClick={() => (editReservation.series_id ? setShowDeleteOptions((v) => !v) : handleDelete('single'))}
                disabled={submitting}
                icon={<Trash2 className="h-4.5 w-4.5" />}
                aria-label="予約を削除"
                data-testid="delete-reservation"
              />
            )}
            <Button
              className="flex-1"
              onClick={handleSubmit}
              loading={submitting}
              disabled={conflict === true && !canSkipConflicts}
              data-testid="submit-reservation"
            >
              {submitLabel}
            </Button>
          </div>
        )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {success ? (
          <motion.div
            key="success"
            data-testid="reservation-success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-5 py-4 text-center"
          >
            <motion.div
              initial={{ scale: 0, rotate: -40 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 14, delay: 0.05 }}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-500 text-white shadow-[0_14px_30px_-10px_rgba(16,185,129,0.8)]"
            >
              <Check className="h-10 w-10" strokeWidth={3} />
            </motion.div>
            <div className="text-[20px] font-extrabold text-ink">
              {success.count > 1 ? `${success.count}件の予約が完了` : '予約が完了しました'}
            </div>

            {success.skipped.length > 0 && (
              <Notice kind="warning">
                <p className="mb-1">重複のためスキップ:</p>
                <ul className="list-disc pl-4 space-y-0.5 font-medium">
                  {success.skipped.map((s) => (
                    <li key={s.start_time}>{s.label}</li>
                  ))}
                </ul>
              </Notice>
            )}

            {success.googleUrl && (
              <a
                href={success.googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-white/80 border border-slate-900/8 text-[15px] font-bold text-ink"
              >
                <CalendarPlus className="h-5 w-5 text-accent" />
                Google カレンダーに追加{success.count > 1 ? '（初回分）' : ''}
              </a>
            )}
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
            {isEditMode && editReservation?.series_id && (
              <Notice kind="info">
                繰り返し予約の1回分です{editReservation.recurrence_text ? `（${editReservation.recurrence_text}）` : ''}。変更はこの回のみに反映されます。
              </Notice>
            )}

            {/* 車両選択 */}
            {vehicles.length > 1 && (
              <div>
                <FieldLabel>車両</FieldLabel>
                <div className="flex gap-2 overflow-x-auto scrollbar-none">
                  {vehicles.map((v) => {
                    const selected = vehicleId === v.id;
                    const c = vehicleColor(v.color);
                    return (
                      <motion.button
                        key={v.id}
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        disabled={isEditMode}
                        onClick={() => setVehicleId(v.id)}
                        className={`relative flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-[14px] font-bold border transition-colors disabled:opacity-60 ${
                          selected ? 'border-transparent bg-ink text-white' : 'border-slate-900/8 bg-white/70 text-slate-600'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                        {v.name}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 日時 */}
            <div className="glass rounded-[22px] p-4 space-y-3">
              <div>
                <FieldLabel htmlFor="res-date">{recurrence ? '初回の日付' : '日付'}</FieldLabel>
                <input
                  id="res-date"
                  data-testid="res-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="glass-input px-4 font-bold"
                />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                <div>
                  <FieldLabel htmlFor="res-start">開始</FieldLabel>
                  <input
                    id="res-start"
                    data-testid="res-start"
                    type="time"
                    required
                    step="900"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="glass-input px-3 text-center text-[18px] font-extrabold tabular-nums"
                  />
                </div>
                <span className="pb-3 text-slate-300 font-bold">–</span>
                <div>
                  <FieldLabel htmlFor="res-end">終了</FieldLabel>
                  <input
                    id="res-end"
                    data-testid="res-end"
                    type="time"
                    required
                    step="900"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="glass-input px-3 text-center text-[18px] font-extrabold tabular-nums"
                  />
                </div>
              </div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                {[1, 2, 3, 5, 8].map((h) => (
                  <motion.button
                    key={h}
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setDuration(h)}
                    className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold border transition-colors ${
                      durationMinutes === h * 60 ? 'border-transparent bg-accent text-white' : 'border-slate-900/8 bg-white/70 text-slate-600'
                    }`}
                  >
                    {h}時間
                  </motion.button>
                ))}
              </div>

              {/* 空き状況 */}
              <div className="min-h-[28px]" data-testid="availability">
                <AnimatePresence mode="wait" initial={false}>
                  {checking ? (
                    <motion.div key="checking" {...badgeMotion} className="inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      確認中
                    </motion.div>
                  ) : conflict === true ? (
                    isRecurring && conflictList.length > 0 ? (
                      <motion.div key="partial" {...badgeMotion}>
                        <Notice kind={allConflict ? 'error' : 'warning'}>
                          <p>
                            {occurrenceCount}回中{conflictList.length}回が重複
                          </p>
                          <ul className="mt-1 max-h-20 list-disc space-y-0.5 overflow-y-auto pl-4 font-medium">
                            {conflictList.map((c) => (
                              <li key={c.start_time}>{c.label}</li>
                            ))}
                          </ul>
                        </Notice>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="conflict"
                        {...badgeMotion}
                        data-testid="availability-conflict"
                        className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1.5 text-[13px] font-bold text-rose-600"
                      >
                        <AlertCircle className="h-4 w-4" />
                        {timeRange && timeRange.start >= timeRange.end ? '終了は開始より後にしてください' : 'この時間は予約済みです'}
                      </motion.div>
                    )
                  ) : conflict === false ? (
                    <motion.div
                      key="ok"
                      {...badgeMotion}
                      data-testid="availability-ok"
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[13px] font-bold text-emerald-600"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {isRecurring ? `全${occurrenceCount}回 空いています` : '空いています'}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>

            {/* 繰り返し設定（新規作成時のみ） */}
            {!isEditMode && (
              <div className="space-y-3">
                <FieldLabel>
                  <span className="inline-flex items-center gap-1">
                    <Repeat className="h-3.5 w-3.5" />
                    繰り返し
                  </span>
                </FieldLabel>
                <div className="glass relative flex rounded-full p-1">
                  {REPEAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRepeat(opt.value)}
                      className="relative flex-1 rounded-full py-2 text-[13px] font-bold"
                    >
                      {repeat === opt.value && (
                        <motion.span layoutId="repeat-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
                      )}
                      <span className={`relative ${repeat === opt.value ? 'text-white' : 'text-slate-500'}`}>{opt.label}</span>
                    </button>
                  ))}
                </div>

                <AnimatePresence initial={false}>
                  {repeat !== 'none' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 pt-1">
                        {(repeat === 'weekly' || repeat === 'biweekly') && (
                          <div className="flex justify-between gap-1">
                            {[0, 1, 2, 3, 4, 5, 6].map((w) => {
                              const on = repeatWeekdays.includes(w);
                              return (
                                <motion.button
                                  key={w}
                                  type="button"
                                  whileTap={{ scale: 0.85 }}
                                  animate={{ scale: on ? 1.05 : 1 }}
                                  onClick={() => toggleWeekday(w)}
                                  className={`h-10 w-10 rounded-full text-[13px] font-bold border transition-colors ${
                                    on
                                      ? 'border-transparent bg-accent text-white'
                                      : `border-slate-900/8 bg-white/70 ${w === 0 ? 'text-rose-500' : w === 6 ? 'text-sky-600' : 'text-slate-600'}`
                                  }`}
                                >
                                  {weekdayLabel(w)}
                                </motion.button>
                              );
                            })}
                          </div>
                        )}
                        <div>
                          <FieldLabel htmlFor="repeat-until">終了日</FieldLabel>
                          <input
                            id="repeat-until"
                            type="date"
                            value={repeatUntil}
                            min={date}
                            max={date ? addDaysYmd(date, 366) : undefined}
                            onChange={(e) => setRepeatUntil(e.target.value)}
                            className="glass-input px-4 font-bold"
                          />
                          {recurrence && timeRange && (
                            <p className="mt-1.5 text-[12px] font-semibold text-slate-500">
                              {describeRecurrence(recurrence, timeRange.start)} ・ 全{occurrenceCount}回
                              {occurrenceCount >= MAX_OCCURRENCES && `（上限${MAX_OCCURRENCES}回）`}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* 行き先・目的 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="res-destination">行き先</FieldLabel>
                <input
                  id="res-destination"
                  type="text"
                  placeholder="任意"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="glass-input h-12 px-4"
                />
              </div>
              <div>
                <FieldLabel htmlFor="res-purpose">目的</FieldLabel>
                <input
                  id="res-purpose"
                  type="text"
                  placeholder="任意"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="glass-input h-12 px-4"
                />
              </div>
            </div>

            {/* 同乗者の招待メール */}
            <div>
              <FieldLabel htmlFor="invite-email">同乗者にメールで招待</FieldLabel>
              <form onSubmit={addEmail} className="flex gap-2">
                <div className="relative flex-grow">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="invite-email"
                    type="email"
                    placeholder="family@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="glass-input h-12 pl-10 pr-3"
                  />
                </div>
                <Button type="submit" variant="dark" className="h-12 flex-shrink-0">
                  追加
                </Button>
              </form>
              <motion.div layout className="mt-2 flex flex-wrap gap-1.5">
                <AnimatePresence>
                  {invitedEmails.map((email, idx) => (
                    <motion.span
                      key={email}
                      layout
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-slate-900/8 py-1 pl-3 pr-1 text-[12px] font-semibold text-slate-600"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => removeEmail(idx)}
                        aria-label={`${email} を削除`}
                        className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-slate-900/5 text-slate-400"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>

            <Notice kind="error" testId="reservation-error">{errorMessage}</Notice>

            {/* 繰り返し予約の削除範囲の選択 */}
            <AnimatePresence>
              {showDeleteOptions && editReservation && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="space-y-2 rounded-[22px] border border-rose-200/70 bg-rose-50/70 p-3"
                >
                  <p className="text-[13px] font-bold text-rose-700">削除する範囲</p>
                  {(
                    [
                      ['single', 'この予約のみ'],
                      ['future', 'この回以降すべて'],
                      ['all', '繰り返し予約すべて'],
                    ] as const
                  ).map(([scope, label]) => (
                    <Button key={scope} variant="danger" size="sm" className="w-full" disabled={submitting} onClick={() => handleDelete(scope)}>
                      {label}
                    </Button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

const badgeMotion = {
  initial: { opacity: 0, y: 6, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.96 },
};
