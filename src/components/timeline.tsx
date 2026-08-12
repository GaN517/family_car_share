'use client';

import React from 'react';
import { formatTime } from '@/lib/utils';
import { Clock, User, Mail, Edit3, Trash2 } from 'lucide-react';

interface Reservation {
  id: string;
  vehicle_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  invited_emails: string[];
  profiles?: {
    name: string;
    email: string;
  };
}

interface TimelineProps {
  reservations: Reservation[];
  currentUserId: string | null;
  onEditReservation: (res: any) => void;
}

export default function Timeline({
  reservations,
  currentUserId,
  onEditReservation,
}: TimelineProps) {
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

                {/* 予約者情報 */}
                <div className="flex items-center gap-2 mb-3">
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
