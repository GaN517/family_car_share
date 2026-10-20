'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { AnimatePresence, motion } from 'motion/react';
import { MessageCircle, Loader2, Copy, Check, Link2Off } from 'lucide-react';
import { Button, Notice } from '@/components/ui/primitives';

interface LineStatus {
  configured: boolean;
  friend_url: string;
  linked: boolean;
  notifications: { new_reservation: boolean; reminder: boolean; transfer: boolean };
}

const NOTIFICATION_LABELS: { key: keyof LineStatus['notifications']; label: string; desc: string }[] = [
  { key: 'new_reservation', label: '新規予約の通知', desc: '家族が車を予約したとき' },
  { key: 'reminder', label: '予約リマインド', desc: '前日の夜と開始の1〜2時間前' },
  { key: 'transfer', label: '譲渡の依頼・完了の通知', desc: '譲渡の依頼・回答・成立時（LINE 上で承諾も可能）' },
];

/** LINE 公式アカウント連携の設定（連携コード発行・通知設定・解除） */
export default function LineSettings() {
  const [status, setStatus] = useState<LineStatus | null>(null);
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch<LineStatus>('/api/line/link');
    if (res.success && res.data) {
      setStatus(res.data);
      if (res.data.linked) setCode(null);
    } else {
      setError(res.error || 'LINE 連携状態を取得できませんでした。');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // コード発行後は、連携が完了するまで定期的に状態を確認
  useEffect(() => {
    if (!code) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [code, load]);

  const issueCode = async () => {
    setBusy(true);
    setError('');
    const res = await apiFetch('/api/line/link', { method: 'POST' });
    setBusy(false);
    if (res.success) setCode({ code: res.data.code, expires_at: res.data.expires_at });
    else setError(res.error || 'コードの発行に失敗しました。');
  };

  const unlink = async () => {
    if (!confirm('LINE 連携を解除しますか？LINE への通知が届かなくなります。')) return;
    setBusy(true);
    const res = await apiFetch('/api/line/link', { method: 'DELETE' });
    setBusy(false);
    if (res.success) load();
    else setError(res.error || '解除に失敗しました。');
  };

  const toggleNotification = async (key: keyof LineStatus['notifications']) => {
    if (!status) return;
    const next = !status.notifications[key];
    setStatus({ ...status, notifications: { ...status.notifications, [key]: next } });
    const res = await apiFetch('/api/line/link', { method: 'PATCH', body: { notifications: { [key]: next } } });
    if (!res.success) {
      setError(res.error || '通知設定の保存に失敗しました。');
      load();
    }
  };

  const copyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.section
      variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="glass space-y-3 rounded-[26px] p-5"
      data-testid="line-settings"
    >
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
        <MessageCircle className="h-4.5 w-4.5 text-[#06C755]" />
        LINE 連携
      </h2>

      <Notice kind="error">{error}</Notice>

      {!status ? (
        <div className="space-y-2">
          <div className="skeleton h-12 rounded-2xl" />
          <div className="skeleton h-12 rounded-2xl" />
        </div>
      ) : !status.configured ? (
        <p className="text-[13px] font-semibold text-slate-400">未設定（管理者が LINE チャネルを設定すると利用できます）</p>
      ) : status.linked ? (
        <div className="space-y-2">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[#06C755]/10 px-3 py-1 text-[13px] font-bold text-[#06a347]">
            <Check className="h-4 w-4" />
            連携済み
          </p>
          {NOTIFICATION_LABELS.map(({ key, label, desc }) => {
            const on = status.notifications[key];
            return (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggleNotification(key)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/60 px-4 py-3 text-left"
              >
                <div>
                  <span className="block text-[14px] font-bold text-ink">{label}</span>
                  <span className="text-[12px] font-semibold text-slate-400">{desc}</span>
                </div>
                <span className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${on ? 'bg-[#06C755]' : 'bg-slate-900/12'}`}>
                  <motion.span
                    layout
                    transition={{ type: 'spring', stiffness: 600, damping: 32 }}
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${on ? 'right-0.5' : 'left-0.5'}`}
                  />
                </span>
              </button>
            );
          })}
          <p className="px-1 text-[12px] font-semibold text-slate-400">トークで「予約」「譲渡」と送ると一覧を返信します</p>
          <Button variant="secondary" size="sm" className="w-full" onClick={unlink} disabled={busy} icon={<Link2Off className="h-4 w-4" />}>
            連携を解除
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-[13px] font-semibold text-slate-600">
            <li>公式アカウントを友だち追加</li>
            <li>連携コードを発行</li>
            <li>トークでコードを送信</li>
          </ol>
          {status.friend_url && (
            <a
              href={status.friend_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#06C755] text-[14px] font-bold text-white"
            >
              <MessageCircle className="h-4.5 w-4.5" />
              友だち追加
            </a>
          )}
          <AnimatePresence mode="wait" initial={false}>
            {code ? (
              <motion.div
                key="code"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-1 rounded-2xl bg-white/70 p-4 text-center"
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[30px] font-extrabold tracking-[0.3em] text-ink tabular-nums">{code.code}</span>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={copyCode}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/5 text-slate-500"
                    aria-label="コピー"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </motion.button>
                </div>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-400">
                  {new Date(code.expires_at).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}まで有効
                  <Loader2 className="h-3 w-3 animate-spin" />
                </span>
              </motion.div>
            ) : (
              <motion.div key="issue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Button variant="line" className="w-full" onClick={issueCode} loading={busy}>
                  連携コードを発行
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.section>
  );
}
