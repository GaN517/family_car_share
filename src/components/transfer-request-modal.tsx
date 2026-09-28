'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { formatJstRange } from '@/lib/datetime';
import { X, ArrowRightLeft, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

interface TransferTarget {
  id: string;
  start_time: string;
  end_time: string;
  user_id: string;
  profiles?: { name: string };
}

interface TransferRequestModalProps {
  isOpen: boolean;
  /** request: 譲ってほしいと依頼 / offer: 自分の予約を譲る */
  mode: 'request' | 'offer';
  reservation: TransferTarget | null;
  vehicleName: string;
  /** 譲渡先として選択できるメンバー（offer のとき使用） */
  members: { uid: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}

/** 予約枠の譲渡依頼・譲渡の申し出を作成するモーダル */
export default function TransferRequestModal({
  isOpen,
  mode,
  reservation,
  vehicleName,
  members,
  onClose,
  onDone,
}: TransferRequestModalProps) {
  const [message, setMessage] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setToUserId(members[0]?.uid || '');
      setError('');
      setDone(false);
    }
  }, [isOpen, members]);

  if (!isOpen || !reservation) return null;

  const ownerName = reservation.profiles?.name || '予約者';
  const recipientName = mode === 'request' ? ownerName : members.find((m) => m.uid === toUserId)?.name || '';

  const handleSubmit = async () => {
    if (mode === 'offer' && !toUserId) {
      setError('譲渡先のメンバーを選択してください。');
      return;
    }
    setSubmitting(true);
    setError('');
    const res = await apiFetch('/api/transfers', {
      method: 'POST',
      body: {
        reservation_id: reservation.id,
        type: mode,
        ...(mode === 'offer' ? { to_user_id: toUserId } : {}),
        message: message.trim(),
      },
    });
    setSubmitting(false);
    if (res.success) {
      setDone(true);
      onDone();
    } else {
      setError(res.error || '送信に失敗しました。');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] animate-slide-up sm:animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50 rounded-t-3xl">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
            <ArrowRightLeft className="h-4.5 w-4.5 text-violet-600" />
            {mode === 'request' ? '予約枠の譲渡を依頼' : '予約枠を譲る'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="p-6 flex flex-col items-center text-center space-y-4">
            <div className="h-14 w-14 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="text-sm font-bold text-slate-800">{recipientName}さんに送信しました</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              相手が承諾すると予約の名義が切り替わります。回答状況は画面上部の「譲渡」ボタンから確認できます。
              <br />
              LINE 連携済みの場合は LINE にも通知されます。
            </p>
            <button onClick={onClose} className="w-full py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-2xl font-semibold text-xs">
              閉じる
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-700 space-y-1">
              <div>
                <span className="text-slate-400 font-bold mr-2">車両</span>
                {vehicleName}
              </div>
              <div>
                <span className="text-slate-400 font-bold mr-2">日時</span>
                {formatJstRange(reservation.start_time, reservation.end_time)}
              </div>
              <div>
                <span className="text-slate-400 font-bold mr-2">予約者</span>
                {ownerName}
              </div>
            </div>

            {mode === 'offer' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5">譲渡先のメンバー</label>
                {members.length === 0 ? (
                  <p className="text-xs text-slate-400">グループに他のメンバーがいません。</p>
                ) : (
                  <select
                    value={toUserId}
                    onChange={(e) => setToUserId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {members.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                メッセージ <span className="text-slate-400 font-normal">(任意・交渉内容や理由など)</span>
              </label>
              <textarea
                rows={3}
                maxLength={500}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  mode === 'request'
                    ? '例：病院の送迎で急ぎ車が必要になりました。代わりに土曜の枠をお譲りできます。'
                    : '例：予定がなくなったので使ってください。'
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <p className="text-[10px] text-slate-400 leading-relaxed">
              {mode === 'request'
                ? `${ownerName}さんが承諾すると、この予約はあなたの予約になります。`
                : '相手が承諾すると、この予約は相手の予約になります（行き先・同乗者などの情報はリセットされます）。'}
            </p>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-semibold flex gap-1.5 items-start">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || (mode === 'offer' && members.length === 0)}
              className="w-full py-3.5 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-violet-600/10 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
              {mode === 'request' ? '譲渡を依頼する' : '譲渡を申し出る'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
