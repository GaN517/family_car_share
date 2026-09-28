'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { MessageCircle, Loader2, Copy, Check, AlertCircle, Link2Off } from 'lucide-react';

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
    <div className="space-y-3 bg-emerald-50/40 p-4 border border-emerald-100/60 rounded-2xl">
      <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1">
        <MessageCircle className="h-4 w-4 text-emerald-600" />
        LINE 連携
      </h4>

      {error && (
        <div className="p-2.5 bg-red-50 border border-red-100 text-red-600 rounded-xl text-[11px] font-semibold flex gap-1.5 items-start">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!status ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        </div>
      ) : !status.configured ? (
        <p className="text-[10px] text-slate-500 leading-relaxed">
          LINE 公式アカウントがまだ設定されていません。管理者が環境変数（LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET）を設定すると利用できるようになります。
        </p>
      ) : status.linked ? (
        <div className="space-y-3">
          <p className="text-[11px] font-bold text-emerald-700">✅ LINE と連携済みです</p>
          <div className="space-y-2">
            {NOTIFICATION_LABELS.map(({ key, label, desc }) => (
              <label key={key} className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-100 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-700 block">{label}</span>
                  <span className="text-[10px] text-slate-400">{desc}</span>
                </div>
                <input
                  type="checkbox"
                  checked={status.notifications[key]}
                  onChange={() => toggleNotification(key)}
                  className="h-4 w-4 accent-emerald-600"
                />
              </label>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            LINE のトークで「予約」と送ると今後の予約、「譲渡」と送ると回答待ちの譲渡依頼を確認できます。
          </p>
          <button
            onClick={unlink}
            disabled={busy}
            className="w-full py-2 border border-slate-200 bg-white hover:bg-red-50 hover:text-red-600 text-slate-500 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Link2Off className="h-3.5 w-3.5" />
            連携を解除する
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            新規予約・予約リマインド・譲渡依頼などの通知を LINE で受け取れます。
          </p>
          <ol className="text-[10px] text-slate-600 leading-relaxed list-decimal pl-4 space-y-0.5">
            <li>公式アカウントを友だち追加します</li>
            <li>下のボタンで連携コードを発行します</li>
            <li>LINE のトーク画面で6桁のコードを送信します</li>
          </ol>
          {status.friend_url && (
            <a
              href={status.friend_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2 bg-[#06C755] hover:bg-[#05b34c] text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1"
            >
              <MessageCircle className="h-4 w-4" />
              公式アカウントを友だち追加
            </a>
          )}
          {code ? (
            <div className="bg-white border border-emerald-200 rounded-xl p-3 text-center space-y-1">
              <span className="text-[10px] text-slate-400 block">LINE のトークでこのコードを送信してください</span>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-extrabold tracking-[0.3em] text-slate-800">{code.code}</span>
                <button onClick={copyCode} className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:text-emerald-600" title="コピー">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <span className="text-[10px] text-slate-400 block">
                有効期限: {new Date(code.expires_at).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}まで
                ・連携を確認中 <Loader2 className="inline h-3 w-3 animate-spin" />
              </span>
            </div>
          ) : (
            <button
              onClick={issueCode}
              disabled={busy}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs transition-all disabled:opacity-50"
            >
              {busy ? '発行中...' : '連携コードを発行する'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
