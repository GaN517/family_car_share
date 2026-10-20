'use client';

import React from 'react';
import { MotionConfig } from 'motion/react';

/**
 * アプリ全体の共通ラッパー
 * - OS の「視差効果を減らす」設定に合わせてアニメーションを抑制
 * - ガラスの透過が映えるよう、背景にゆっくり漂う淡い光の玉を配置
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#f4f6fb]">
        <div className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-sky-200/60 blur-[90px] animate-drift" />
        <div
          className="absolute top-1/3 -right-32 h-[380px] w-[380px] rounded-full bg-violet-200/50 blur-[90px] animate-drift"
          style={{ animationDelay: '-7s' }}
        />
        <div
          className="absolute -bottom-40 left-1/4 h-[420px] w-[420px] rounded-full bg-emerald-100/70 blur-[100px] animate-drift"
          style={{ animationDelay: '-13s' }}
        />
      </div>
      {children}
    </MotionConfig>
  );
}
