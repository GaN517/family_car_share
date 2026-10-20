'use client';

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRightLeft, Hourglass, MapPin, Pencil, Repeat, Tag, Users } from 'lucide-react';
import { formatDuration, toJstHm, toJstYmd } from '@/lib/datetime';
import type { ReservationView } from '@/lib/types';
import { Avatar } from '@/components/ui/primitives';

interface TimelineProps {
  reservations: ReservationView[];
  /** 表示中の日付 (YYYY-MM-DD) */
  date: string;
  currentUserId: string | null;
  now: number;
  onEditReservation: (res: ReservationView) => void;
  /** 他の人の予約に「譲ってほしい」と依頼する */
  onRequestTransfer?: (res: ReservationView) => void;
  /** 自分の予約を他のメンバーに譲る */
  onOfferTransfer?: (res: ReservationView) => void;
  /** 自分が関わる回答待ちの譲渡依頼がある予約 ID */
  pendingTransferIds?: Set<string>;
  /** 一時的に強調表示する予約 */
  highlightId?: string | null;
}

/** 日をまたぐ予約は、表示中の日付側の時刻だけを見せる */
const clipLabel = (res: ReservationView, date: string) => {
  const startLabel = toJstYmd(res.start_time) === date ? toJstHm(res.start_time) : '前日〜';
  const endLabel = toJstYmd(res.end_time) === date ? toJstHm(res.end_time) : '翌日';
  return { startLabel, endLabel };
};

function NowLine({ now }: { now: number }) {
  return (
    <motion.div layout initial={{ opacity: 0, scaleX: 0.6 }} animate={{ opacity: 1, scaleX: 1 }} className="flex items-center gap-2 py-0.5" data-testid="now-line">
      <span className="text-[11px] font-extrabold text-rose-500 tabular-nums">{toJstHm(now)}</span>
      <span className="relative flex h-2 w-2">
        <span className="absolute inset-0 rounded-full bg-rose-500 animate-pulse-ring" />
        <span className="relative h-2 w-2 rounded-full bg-rose-500" />
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-rose-400/80 to-rose-400/0" />
    </motion.div>
  );
}

export default function Timeline({
  reservations,
  date,
  currentUserId,
  now,
  onEditReservation,
  onRequestTransfer,
  onOfferTransfer,
  pendingTransferIds,
  highlightId,
}: TimelineProps) {
  const isToday = toJstYmd(now) === date;
  // 「いま」の線を入れる位置（開始が現在より後の最初の予約の手前）
  const nowIndex = isToday ? reservations.findIndex((r) => new Date(r.start_time).getTime() > now) : -1;

  if (reservations.length === 0) {
    return (
      <motion.div
        data-testid="timeline-empty"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass flex flex-col items-center gap-1 rounded-[24px] px-6 py-10 text-center"
      >
        <span className="text-[15px] font-bold text-slate-500">予約なし</span>
        {isToday && <span className="text-[12px] font-semibold text-slate-400">終日空いています</span>}
      </motion.div>
    );
  }

  return (
    <motion.div layout role="list" className="space-y-2.5" data-testid="timeline">
      <AnimatePresence initial={true}>
        {reservations.map((res, index) => {
          const isOwn = currentUserId === res.user_id;
          const userName = res.profiles?.name || '不明なユーザー';
          const start = new Date(res.start_time).getTime();
          const end = new Date(res.end_time).getTime();
          const isFinished = end <= now;
          const isOngoing = start <= now && now < end;
          const hasPendingTransfer = pendingTransferIds?.has(res.id);
          const { startLabel, endLabel } = clipLabel(res, date);
          const highlighted = highlightId === res.id;

          return (
            <React.Fragment key={res.id}>
              {index === nowIndex && <NowLine now={now} />}
              <motion.div
                layout
                role="listitem"
                data-testid="reservation-card"
                data-reservation-id={res.id}
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{
                  opacity: isFinished ? 0.55 : 1,
                  y: 0,
                  scale: highlighted ? [1, 1.03, 1] : 1,
                }}
                exit={{ opacity: 0, x: -30, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 300, damping: 28, delay: index * 0.045 }}
                className={`glass relative overflow-hidden rounded-[22px] p-4 ${
                  isOngoing ? 'ring-2 ring-rose-400/60' : highlighted ? 'ring-2 ring-accent/60' : ''
                }`}
              >
                {isOngoing && (
                  <motion.span
                    className="absolute inset-y-0 left-0 w-1 bg-rose-500"
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    style={{ originY: 0 }}
                  />
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[22px] font-extrabold leading-none tracking-tight text-ink tabular-nums" data-testid="reservation-time">
                      {startLabel}
                      <span className="mx-1 text-slate-300">–</span>
                      {endLabel}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <Avatar name={userName} seed={res.user_id} size={28} />
                      <span className="truncate text-[14px] font-bold text-slate-700" data-testid="reservation-user">
                        {userName}
                      </span>
                      {isOwn && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-white">自分</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {isOngoing && (
                      <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-extrabold text-rose-600 tabular-nums">
                        使用中・残り{formatDuration(end - now)}
                      </span>
                    )}
                    {!isOngoing && !isFinished && isToday && (
                      <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-extrabold text-accent tabular-nums">
                        あと{formatDuration(start - now)}
                      </span>
                    )}
                    {isFinished && <span className="text-[11px] font-bold text-slate-400">終了</span>}
                  </div>
                </div>

                {(res.destination || res.purpose || res.series_id || hasPendingTransfer || res.invited_emails?.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[12px] font-semibold text-slate-600">
                    {res.destination && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1">
                        <MapPin className="h-3.5 w-3.5 text-rose-500" />
                        {res.destination}
                      </span>
                    )}
                    {res.purpose && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1">
                        <Tag className="h-3.5 w-3.5 text-amber-500" />
                        {res.purpose}
                      </span>
                    )}
                    {res.series_id && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1" title={res.recurrence_text || undefined}>
                        <Repeat className="h-3.5 w-3.5 text-slate-500" />
                        繰り返し
                      </span>
                    )}
                    {res.invited_emails?.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1" title={res.invited_emails.join(', ')}>
                        <Users className="h-3.5 w-3.5 text-slate-500" />
                        同乗 {res.invited_emails.length}人
                      </span>
                    )}
                    {hasPendingTransfer && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-700">
                        <Hourglass className="h-3.5 w-3.5" />
                        譲渡の交渉中
                      </span>
                    )}
                  </div>
                )}

                {(isOwn || !isFinished) && (
                  <div className="mt-3 flex gap-2">
                    {isOwn ? (
                      <>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onEditReservation(res)}
                          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/80 text-[13px] font-bold text-ink border border-slate-900/5"
                        >
                          <Pencil className="h-4 w-4" />
                          編集
                        </motion.button>
                        {onOfferTransfer && !isFinished && (
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onOfferTransfer(res)}
                            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/80 text-[13px] font-bold text-violet-600 border border-slate-900/5"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                            譲る
                          </motion.button>
                        )}
                      </>
                    ) : (
                      onRequestTransfer && (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onRequestTransfer(res)}
                          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-500/10 text-[13px] font-bold text-violet-700"
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                          譲ってほしい
                        </motion.button>
                      )
                    )}
                  </div>
                )}
              </motion.div>
            </React.Fragment>
          );
        })}
        {nowIndex === -1 && isToday && <NowLine key="now-end" now={now} />}
      </AnimatePresence>
    </motion.div>
  );
}
