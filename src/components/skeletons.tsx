'use client';

import React from 'react';
import { motion } from 'motion/react';

const Bone = ({ className = '' }: { className?: string }) => (
  <div className={`skeleton ${className.includes('rounded') ? '' : 'rounded-xl'} ${className}`} />
);

const Screen = ({ children, testId }: { children: React.ReactNode; testId: string }) => (
  <motion.div
    data-testid={testId}
    aria-busy="true"
    aria-label="読み込み中"
    className="min-h-dvh w-full max-w-md mx-auto px-4 pt-[max(16px,env(safe-area-inset-top))] pb-28"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0, transition: { duration: 0.2 } }}
  >
    {children}
  </motion.div>
);

/** ホーム画面と同じ骨組みのスケルトン */
export function DashboardSkeleton() {
  return (
    <Screen testId="dashboard-skeleton">
      <div className="flex items-center justify-between py-2">
        <Bone className="h-7 w-32" />
        <div className="flex gap-2">
          <Bone className="h-11 w-11 rounded-full" />
          <Bone className="h-11 w-11 rounded-full" />
        </div>
      </div>

      <div className="glass mt-4 rounded-[28px] p-5 space-y-4">
        <Bone className="h-4 w-20" />
        <div className="flex items-center gap-3">
          <Bone className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Bone className="h-6 w-28" />
            <Bone className="h-4 w-20" />
          </div>
        </div>
        <Bone className="h-10 w-48" />
        <Bone className="h-4 w-32" />
      </div>

      <div className="glass mt-3 rounded-[24px] p-4 flex items-center gap-3">
        <Bone className="h-11 w-11 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Bone className="h-4 w-24" />
          <Bone className="h-5 w-40" />
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <Bone className="h-10 w-24 rounded-full" />
        <Bone className="h-10 w-24 rounded-full" />
      </div>

      <div className="mt-4 flex justify-between gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Bone key={i} className="h-16 flex-1 rounded-2xl" />
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass rounded-[22px] p-4 space-y-3">
            <div className="flex justify-between">
              <Bone className="h-5 w-32" />
              <Bone className="h-5 w-12" />
            </div>
            <div className="flex items-center gap-2">
              <Bone className="h-8 w-8 rounded-full" />
              <Bone className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}

/** 設定画面・ログイン画面のスケルトン */
export function SettingsSkeleton() {
  return (
    <Screen testId="settings-skeleton">
      <div className="flex items-center gap-3 py-2">
        <Bone className="h-11 w-11 rounded-full" />
        <Bone className="h-7 w-28" />
      </div>
      <div className="glass mt-4 rounded-[28px] p-5 flex items-center gap-3">
        <Bone className="h-14 w-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Bone className="h-5 w-28" />
          <Bone className="h-4 w-40" />
        </div>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="glass mt-3 rounded-[24px] p-5 space-y-3">
          <Bone className="h-5 w-32" />
          <Bone className="h-12 w-full" />
          <Bone className="h-12 w-full" />
        </div>
      ))}
    </Screen>
  );
}
