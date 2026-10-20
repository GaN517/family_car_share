'use client';

import React from 'react';
import { AnimatePresence, motion, type HTMLMotionProps } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'violet' | 'line' | 'secondary' | 'danger' | 'ghost' | 'dark';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-[#2b95ff] to-accent text-white shadow-[0_8px_24px_-8px_rgba(10,132,255,0.7),inset_0_1px_0_rgba(255,255,255,0.35)]',
  violet:
    'bg-gradient-to-b from-violet-500 to-violet-600 text-white shadow-[0_8px_24px_-8px_rgba(124,58,237,0.7),inset_0_1px_0_rgba(255,255,255,0.35)]',
  line: 'bg-[#06C755] text-white shadow-[0_8px_24px_-10px_rgba(6,199,85,0.8)]',
  secondary: 'bg-white/70 text-ink border border-slate-900/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]',
  danger: 'bg-rose-50/80 text-rose-600 border border-rose-200/70',
  ghost: 'text-slate-500 hover:bg-slate-900/5',
  dark: 'bg-ink text-white shadow-[0_8px_24px_-10px_rgba(11,18,32,0.6)]',
};

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  size?: 'md' | 'sm';
}

/** 押すと沈むボタン */
export function Button({ variant = 'primary', loading, icon, children, className = '', size = 'md', disabled, ...rest }: ButtonProps) {
  return (
    <motion.button
      whileTap={disabled || loading ? undefined : { scale: 0.96 }}
      whileHover={disabled || loading ? undefined : { y: -1 }}
      disabled={disabled || loading}
      className={`relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold rounded-2xl transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
        size === 'md' ? 'h-13 px-5 text-[15px]' : 'h-10 px-4 text-[13px]'
      } ${BUTTON_STYLES[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : icon}
      {children}
    </motion.button>
  );
}

const NOTICE_STYLES = {
  error: { cls: 'bg-rose-50/85 border-rose-200/70 text-rose-700', Icon: AlertCircle },
  success: { cls: 'bg-emerald-50/85 border-emerald-200/70 text-emerald-700', Icon: CheckCircle2 },
  warning: { cls: 'bg-amber-50/85 border-amber-200/70 text-amber-800', Icon: AlertCircle },
  info: { cls: 'bg-sky-50/85 border-sky-200/70 text-sky-800', Icon: Info },
};

/** 出現・消滅がアニメーションするメッセージ */
export function Notice({ kind, children, testId }: { kind: keyof typeof NOTICE_STYLES; children?: React.ReactNode; testId?: string }) {
  const { cls, Icon } = NOTICE_STYLES[kind];
  return (
    <AnimatePresence initial={false}>
      {children ? (
        <motion.div
          data-testid={testId}
          initial={{ opacity: 0, height: 0, y: -6 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -6 }}
          className="overflow-hidden"
        >
          <div className={`flex items-start gap-2 rounded-2xl border px-3.5 py-3 text-[13px] font-semibold leading-relaxed ${cls}`}>
            <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

const AVATAR_COLORS = [
  'from-sky-400 to-blue-500',
  'from-violet-400 to-purple-500',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-rose-400 to-pink-500',
  'from-cyan-400 to-sky-500',
];

const hashString = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** 名前の頭文字アバター（同じ人は常に同じ色） */
export function Avatar({ name, seed, size = 36 }: { name: string; seed?: string; size?: number }) {
  const color = AVATAR_COLORS[hashString(seed || name) % AVATAR_COLORS.length];
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${color} text-white font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_10px_-4px_rgba(15,23,42,0.4)]`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {name.charAt(0) || '?'}
    </span>
  );
}

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-bold text-slate-500">
      {children}
    </label>
  );
}

/** 車両カラー */
export const VEHICLE_COLORS: Record<string, { dot: string; soft: string; text: string }> = {
  indigo: { dot: 'bg-indigo-500', soft: 'bg-indigo-500/10', text: 'text-indigo-600' },
  emerald: { dot: 'bg-emerald-500', soft: 'bg-emerald-500/10', text: 'text-emerald-600' },
  rose: { dot: 'bg-rose-500', soft: 'bg-rose-500/10', text: 'text-rose-600' },
  amber: { dot: 'bg-amber-500', soft: 'bg-amber-500/10', text: 'text-amber-600' },
  sky: { dot: 'bg-sky-500', soft: 'bg-sky-500/10', text: 'text-sky-600' },
  violet: { dot: 'bg-violet-500', soft: 'bg-violet-500/10', text: 'text-violet-600' },
};

export const vehicleColor = (color?: string) => VEHICLE_COLORS[color || ''] || VEHICLE_COLORS.indigo;
