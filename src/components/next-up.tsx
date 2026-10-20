'use client';

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, ChevronRight, MapPin, Plus, User } from 'lucide-react';
import { formatDuration, relativeDayLabel, toJstHm, toJstYmd } from '@/lib/datetime';
import type { ReservationView, Vehicle } from '@/lib/types';
import { Avatar, vehicleColor } from '@/components/ui/primitives';

interface NextUpProps {
  /** 全車両の予約（終了していないもの） */
  reservations: ReservationView[];
  vehicles: Vehicle[];
  currentUserId: string | null;
  now: number;
  onJump: (res: ReservationView) => void;
  onCreate: () => void;
}

const t = (iso: string) => new Date(iso).getTime();

const timeRange = (res: ReservationView) => {
  const sameDay = toJstYmd(res.start_time) === toJstYmd(res.end_time);
  return sameDay
    ? `${toJstHm(res.start_time)}–${toJstHm(res.end_time)}`
    : `${toJstHm(res.start_time)}–${relativeDayLabel(res.end_time)} ${toJstHm(res.end_time)}`;
};

const swap = {
  initial: { opacity: 0, y: 14, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -14, filter: 'blur(6px)' },
};

function VehicleChip({ vehicle }: { vehicle?: Vehicle }) {
  if (!vehicle) return null;
  const c = vehicleColor(vehicle.color);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${c.soft} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {vehicle.name}
    </span>
  );
}

/** ホーム最上部: 次の予約（誰が・いつ）と自分の次の予約 */
export default function NextUp({ reservations, vehicles, currentUserId, now, onJump, onCreate }: NextUpProps) {
  const multiVehicle = vehicles.length > 1;
  const vehicleOf = (id: string) => vehicles.find((v) => v.id === id);

  const active = reservations.filter((r) => t(r.end_time) > now).sort((a, b) => t(a.start_time) - t(b.start_time));
  const ongoing = active.filter((r) => t(r.start_time) <= now);
  const next = active.find((r) => t(r.start_time) > now) || null;
  const mine = active.find((r) => r.user_id === currentUserId) || null;
  const mineOngoing = !!mine && t(mine.start_time) <= now;

  return (
    <section className="space-y-3">
      {/* いまの状況 */}
      <motion.div
        layout
        data-testid="now-status"
        className="flex flex-wrap items-center gap-2 px-1 text-[13px] font-semibold text-slate-600"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {ongoing.length === 0 ? (
            <motion.span key="free" {...swap} className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
              いまは空いています
            </motion.span>
          ) : (
            ongoing.map((r) => (
              <motion.button
                key={r.id}
                {...swap}
                whileTap={{ scale: 0.96 }}
                onClick={() => onJump(r)}
                className="glass inline-flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-rose-500 animate-pulse-ring" />
                  <span className="relative h-2 w-2 rounded-full bg-rose-500" />
                </span>
                <span>
                  <span className="text-ink">{r.profiles?.name || '不明'}</span>が使用中
                </span>
                <span className="tabular-nums text-slate-500">〜{toJstHm(r.end_time)}</span>
                {multiVehicle && <span className="text-slate-400">・{vehicleOf(r.vehicle_id)?.name}</span>}
              </motion.button>
            ))
          )}
        </AnimatePresence>
      </motion.div>

      {/* 次の予約 */}
      <motion.button
        layout
        data-testid="next-up"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        whileTap={next ? { scale: 0.98 } : undefined}
        onClick={() => (next ? onJump(next) : onCreate())}
        className="glass block w-full overflow-hidden rounded-[30px] p-5 text-left"
      >
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-slate-500">次の予約</span>
          <AnimatePresence mode="popLayout" initial={false}>
            {next && (
              <motion.span
                key={`cd-${next.id}-${formatDuration(t(next.start_time) - now)}`}
                {...swap}
                data-testid="next-up-countdown"
                className="rounded-full bg-accent/10 px-2.5 py-1 text-[12px] font-bold text-accent tabular-nums"
              >
                あと {formatDuration(t(next.start_time) - now)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          {next ? (
            <motion.div key={next.id} {...swap} className="mt-3">
              <div className="flex items-center gap-3">
                <Avatar name={next.profiles?.name || '?'} seed={next.user_id} size={52} />
                <div className="min-w-0">
                  <div data-testid="next-up-name" className="truncate text-[24px] font-extrabold leading-tight tracking-tight text-ink">
                    {next.profiles?.name || '不明なユーザー'}
                    {next.user_id === currentUserId && (
                      <span className="ml-2 align-middle rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">自分</span>
                    )}
                  </div>
                  {(multiVehicle || next.destination) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
                      {multiVehicle && <VehicleChip vehicle={vehicleOf(next.vehicle_id)} />}
                      {next.destination && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {next.destination}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="text-[17px] font-bold text-slate-500">{relativeDayLabel(next.start_time, now)}</span>
                <span
                  data-testid="next-up-time"
                  className={`${
                    toJstYmd(next.start_time) === toJstYmd(next.end_time) ? 'text-[34px]' : 'text-[26px]'
                  } font-extrabold leading-none tracking-tight text-ink tabular-nums`}
                >
                  {timeRange(next)}
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div key="none" {...swap} className="mt-3 flex items-center justify-between">
              <span data-testid="next-up-empty" className="text-[22px] font-extrabold text-slate-400">
                予約はありません
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white">
                <Plus className="h-5 w-5" />
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* 自分の次の予約 */}
      <motion.button
        layout
        data-testid="my-next"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.06 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => (mine ? onJump(mine) : onCreate())}
        className="glass flex w-full items-center gap-3.5 rounded-[24px] p-4 text-left"
      >
        <span
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${
            mineOngoing ? 'bg-rose-500 text-white' : 'bg-ink text-white'
          }`}
        >
          {mine ? <User className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold text-slate-500">あなたの次の予約</div>
          <AnimatePresence mode="popLayout" initial={false}>
            {mine ? (
              <motion.div key={mine.id} {...swap} className="flex flex-wrap items-baseline gap-x-2">
                <span data-testid="my-next-time" className="text-[20px] font-extrabold tracking-tight text-ink tabular-nums">
                  {relativeDayLabel(mine.start_time, now)} {timeRange(mine)}
                </span>
                <span className={`text-[12px] font-bold tabular-nums ${mineOngoing ? 'text-rose-500' : 'text-accent'}`}>
                  {mineOngoing ? `使用中・残り${formatDuration(t(mine.end_time) - now)}` : `あと ${formatDuration(t(mine.start_time) - now)}`}
                </span>
                {multiVehicle && <span className="text-[12px] font-semibold text-slate-400">{vehicleOf(mine.vehicle_id)?.name}</span>}
              </motion.div>
            ) : (
              <motion.div key="none" {...swap} data-testid="my-next-empty" className="text-[18px] font-extrabold text-slate-400">
                予定なし
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {mine ? (
          <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-300" />
        ) : (
          <span className="flex-shrink-0 rounded-full bg-accent px-3.5 py-2 text-[13px] font-bold text-white">予約する</span>
        )}
      </motion.button>
    </section>
  );
}
