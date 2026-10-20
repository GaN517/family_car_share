'use client';

import React, { useEffect } from 'react';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** シート下部に固定するボタンなど */
  footer?: React.ReactNode;
  testId?: string;
}

/**
 * ボトムシート（モバイル） / 中央ダイアログ（PC）
 * つまみ・ヘッダーを下へドラッグ、背景タップ、Esc キーで閉じられます。
 */
export default function Sheet({ open, onClose, title, icon, children, footer, testId }: SheetProps) {
  const dragControls = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-slate-900/25 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            data-testid={testId}
            className="glass-strong relative w-full sm:max-w-md rounded-t-[32px] sm:rounded-[32px] flex flex-col max-h-[92dvh] sm:max-h-[86dvh] pb-[env(safe-area-inset-bottom)]"
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.7 }}
            onDragEnd={handleDragEnd}
          >
            <div
              className="touch-none cursor-grab active:cursor-grabbing select-none"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-900/15 sm:hidden" />
              <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3">
                <h3 className="text-[17px] font-bold tracking-tight text-ink flex items-center gap-2">
                  {icon}
                  {title}
                </h3>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={onClose}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="閉じる"
                  className="h-9 w-9 rounded-full bg-slate-900/5 hover:bg-slate-900/10 text-slate-500 flex items-center justify-center"
                >
                  <X className="h-4.5 w-4.5" />
                </motion.button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
            {footer && <div className="px-5 pt-3 pb-5 border-t border-slate-900/5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
