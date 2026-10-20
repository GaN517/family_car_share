'use client';

import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { CalendarDays } from 'lucide-react';
import { addDaysYmd, dayOfYmd, formatJstDate, todayJst, weekdayLabel, weekdayOfYmd } from '@/lib/datetime';

interface DateStripProps {
  selectedDate: string;
  onSelect: (ymd: string) => void;
  /** 予約がある日 (YYYY-MM-DD) */
  busyDays: Set<string>;
}

const DAYS = 14;

/** 横スクロールの日付選択。選択中の日付へピルが移動し、予約がある日にはドットが付きます */
export default function DateStrip({ selectedDate, onSelect, busyDays }: DateStripProps) {
  const today = todayJst();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const inDefaultWindow = selectedDate >= addDaysYmd(today, -1) && selectedDate <= addDaysYmd(today, DAYS - 2);
  const start = inDefaultWindow ? addDaysYmd(today, -1) : addDaysYmd(selectedDate, -3);
  const days = Array.from({ length: DAYS }, (_, i) => addDaysYmd(start, i));

  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-ymd="${selectedDate}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedDate]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <label className="relative inline-flex cursor-pointer items-center gap-1.5 text-[15px] font-extrabold text-ink">
          <CalendarDays className="h-4.5 w-4.5 text-accent" />
          <span data-testid="selected-date-label">{formatJstDate(selectedDate)}</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && onSelect(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="日付を選択"
          />
        </label>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => onSelect(today)}
          animate={{ opacity: selectedDate === today ? 0.4 : 1 }}
          className="rounded-full bg-white/70 px-3 py-1.5 text-[12px] font-bold text-accent border border-slate-900/5"
        >
          今日
        </motion.button>
      </div>

      <div ref={scrollerRef} className="-mx-4 flex gap-1.5 overflow-x-auto scrollbar-none px-4 pt-1 pb-3 snap-x">
        {days.map((d) => {
          const isSelected = d === selectedDate;
          const w = weekdayOfYmd(d);
          const isToday = d === today;
          return (
            <motion.button
              key={d}
              data-ymd={d}
              data-testid={`day-${d}`}
              whileTap={{ scale: 0.9 }}
              onClick={() => onSelect(d)}
              className="relative flex h-[68px] w-[48px] flex-shrink-0 snap-center flex-col items-center justify-center rounded-[18px]"
            >
              {isSelected && (
                <motion.span
                  layoutId="day-pill"
                  className="absolute inset-0 rounded-[18px] bg-gradient-to-b from-[#2b95ff] to-accent shadow-[0_8px_20px_-8px_rgba(10,132,255,0.8),inset_0_1px_0_rgba(255,255,255,0.4)]"
                  transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                />
              )}
              <span
                className={`relative text-[11px] font-bold ${
                  isSelected ? 'text-white/80' : w === 0 ? 'text-rose-500' : w === 6 ? 'text-sky-600' : 'text-slate-400'
                }`}
              >
                {isToday ? '今日' : weekdayLabel(w)}
              </span>
              <span className={`relative mt-0.5 text-[18px] font-extrabold tabular-nums ${isSelected ? 'text-white' : 'text-ink'}`}>
                {dayOfYmd(d)}
              </span>
              <span
                className={`relative mt-1 h-1 w-1 rounded-full transition-opacity ${isSelected ? 'bg-white' : 'bg-accent'} ${
                  busyDays.has(d) ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
