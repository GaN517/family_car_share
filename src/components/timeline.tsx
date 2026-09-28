'use client';

import React, { useState } from 'react';
import { formatTime } from '@/lib/utils';
import { Clock, Mail, Edit3, MapPin, Tag, Repeat, ArrowRightLeft, Hourglass } from 'lucide-react';

interface Reservation {
  id: string;
  vehicle_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  invited_emails: string[];
  destination?: string;
  purpose?: string;
  series_id?: string | null;
  recurrence_text?: string | null;
  profiles?: {
    name: string;
    email: string;
  };
}

interface TimelineProps {
  reservations: Reservation[];
  currentUserId: string | null;
  onEditReservation: (res: any) => void;
  /** 他の人の予約に「譲ってほしい」と依頼する */
  onRequestTransfer?: (res: Reservation) => void;
  /** 自分の予約を他のメンバーに譲る */
  onOfferTransfer?: (res: Reservation) => void;
  /** 自分が関わる回答待ちの譲渡依頼がある予約 ID */
  pendingTransferIds?: Set<string>;
}

export default function Timeline({
  reservations,
  currentUserId,
  onEditReservation,
  onRequestTransfer,
  onOfferTransfer,
  pendingTransferIds,
}: TimelineProps) {
  // 表示時点の時刻（終了済みの予約には譲渡ボタンを出さない）
  const [now] = useState(() => Date.now());

  if (reservations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-3xl border border-slate-100 shadow-sm mx-4 my-6 space-y-3">
        <div className="h-12 w-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center">
          <Clock className="h-6 w-6 text-indigo-500" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800">予約がありません</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-[200px] leading-relaxed">
            この日の予約はまだありません。右下の＋ボタンから予約を追加できます。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 space-y-4">
      {/* 縦のタイムライン表示 */}
      <div className="relative border-l-2 border-indigo-100 ml-4 pl-6 space-y-6 py-2">
        {reservations.map((res) => {
          const isOwnReservation = currentUserId === res.user_id;
          const userName = res.profiles?.name || '不明なユーザー';
          const startTimeStr = formatTime(res.start_time);
          const endTimeStr = formatTime(res.end_time);
          const isFinished = new Date(res.end_time).getTime() <= now;
          const hasPendingTransfer = pendingTransferIds?.has(res.id);

          return (
            <div key={res.id} className="relative">
              {/* タイムラインのインジケータードット */}
              <span className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white border-2 border-indigo-500 ring-4 ring-indigo-50">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
              </span>

              {/* 予約カード */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex justify-between items-start mb-2">
                  {/* 時間帯 */}
                  <div className="flex items-center gap-1.5 text-indigo-600 font-bold text-sm bg-indigo-50 px-2.5 py-1 rounded-lg">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{startTimeStr} 〜 {endTimeStr}</span>
                  </div>

                  <div className="flex items-center gap-0.5">
                    {/* 譲渡（交渉）ボタン */}
                    {!isFinished && isOwnReservation && onOfferTransfer && (
                      <button
                        onClick={() => onOfferTransfer(res)}
                        className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-violet-600 rounded-lg transition-all flex items-center gap-1"
                        title="この予約を他のメンバーに譲る"
                      >
                        <ArrowRightLeft className="h-4 w-4" />
                        <span className="text-[10px] font-bold">譲る</span>
                      </button>
                    )}
                    {!isFinished && !isOwnReservation && onRequestTransfer && (
                      <button
                        onClick={() => onRequestTransfer(res)}
                        className="px-2 py-1 bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-lg transition-all flex items-center gap-1"
                        title="この予約枠を譲ってもらえるよう依頼する"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold">譲ってほしい</span>
                      </button>
                    )}
                    {/* 自分の予約であれば編集可能 */}
                    {isOwnReservation && (
                      <button
                        onClick={() => onEditReservation(res)}
                        className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-all flex items-center gap-1"
                        title="予約を変更"
                      >
                        <Edit3 className="h-4 w-4" />
                        <span className="text-[10px] font-bold">編集</span>
                      </button>
                    )}
                  </div>
                </div>

                {(res.series_id || hasPendingTransfer) && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {res.series_id && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md" title={res.recurrence_text || undefined}>
                        <Repeat className="h-3 w-3" />
                        繰り返し
                      </span>
                    )}
                    {hasPendingTransfer && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-md">
                        <Hourglass className="h-3 w-3" />
                        譲渡の交渉中
                      </span>
                    )}
                  </div>
                )}

                {/* 予約者情報 */}
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="h-6 w-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
                    {userName.charAt(0)}
                  </div>
                  <span className="text-xs font-bold text-slate-700">{userName}</span>
                  {isOwnReservation && (
                    <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md">
                      自分
                    </span>
                  )}
                </div>

                {/* 行き先・目的（入力がある場合） */}
                {(res.destination || res.purpose) && (
                  <div className="flex flex-wrap gap-2 mb-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100/80 text-xs">
                    {res.destination && (
                      <div className="flex items-center gap-1 text-slate-700 font-medium">
                        <MapPin className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
                        <span>{res.destination}</span>
                      </div>
                    )}
                    {res.purpose && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <Tag className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                        <span>{res.purpose}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 招待された同乗者 */}
                {res.invited_emails && res.invited_emails.length > 0 && (
                  <div className="pt-2 border-t border-slate-50">
                    <span className="text-[9px] text-slate-400 font-semibold block mb-1">同乗予定:</span>
                    <div className="flex flex-wrap gap-1">
                      {res.invited_emails.map((email, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 border border-slate-100 rounded text-[9px] text-slate-500 font-medium"
                        >
                          <Mail className="h-2.5 w-2.5 text-slate-400" />
                          <span>{email.split('@')[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
