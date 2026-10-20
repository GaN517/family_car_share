'use client';

import React, { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { formatJstRange } from '@/lib/datetime';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRightLeft } from 'lucide-react';
import Sheet from '@/components/ui/sheet';
import { Avatar, Button, Notice } from '@/components/ui/primitives';

export interface TransferItem {
  id: string;
  reservation_id: string;
  vehicle_name: string;
  type: 'request' | 'offer';
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message: string;
  response_message: string;
  from_user_id: string;
  from_user_name: string;
  to_user_id: string;
  to_user_name: string;
  start_time: string;
  end_time: string;
  created_at: string;
}

interface TransferInboxProps {
  isOpen: boolean;
  onClose: () => void;
  incoming: TransferItem[];
  outgoing: TransferItem[];
  onChanged: () => void;
}

const STATUS_LABEL: Record<TransferItem['status'], { label: string; className: string }> = {
  pending: { label: '回答待ち', className: 'bg-amber-500/12 text-amber-700' },
  accepted: { label: '成立', className: 'bg-emerald-500/12 text-emerald-700' },
  declined: { label: 'お断り', className: 'bg-slate-900/6 text-slate-500' },
  cancelled: { label: '取り消し', className: 'bg-slate-900/5 text-slate-400' },
};

/** 譲渡依頼の受信箱・送信済み一覧（承諾・辞退・取り消し） */
export default function TransferInbox({ isOpen, onClose, incoming, outgoing, onChanged }: TransferInboxProps) {
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  const act = async (id: string, action: 'accept' | 'decline' | 'cancel', message = '') => {
    if (action === 'accept' && !confirm('譲渡を承諾しますか？予約の名義が切り替わります。')) return;
    if (action === 'cancel' && !confirm('この依頼を取り消しますか？')) return;
    setBusyId(id);
    setError('');
    const res = await apiFetch('/api/transfers', { method: 'PATCH', body: { id, action, message } });
    setBusyId(null);
    if (res.success) {
      setReplyFor(null);
      setReply('');
      onChanged();
    } else {
      setError(res.error || '処理に失敗しました。');
    }
  };

  const list = tab === 'incoming' ? incoming : outgoing;
  const pendingIncoming = incoming.filter((t) => t.status === 'pending').length;

  return (
    <Sheet open={isOpen} onClose={onClose} testId="transfer-inbox" icon={<ArrowRightLeft className="h-5 w-5 text-violet-600" />} title="予約の譲渡">
      <div className="glass sticky top-0 z-10 mb-4 flex rounded-full p-1">
        {(['incoming', 'outgoing'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className="relative flex-1 rounded-full py-2.5 text-[14px] font-bold">
            {tab === k && (
              <motion.span layoutId="inbox-tab" className="absolute inset-0 rounded-full bg-white shadow-[0_4px_14px_-6px_rgba(15,23,42,0.3)]" />
            )}
            <span className={`relative inline-flex items-center gap-1.5 ${tab === k ? 'text-ink' : 'text-slate-500'}`}>
              {k === 'incoming' ? '受け取った' : '送った'}
              {k === 'incoming' && pendingIncoming > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 text-[11px] text-white">{pendingIncoming}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <Notice kind="error">{error}</Notice>

        <AnimatePresence mode="popLayout" initial={false}>
          {list.length === 0 ? (
            <motion.p key={`empty-${tab}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-12 text-center text-[14px] font-bold text-slate-400">
              なし
            </motion.p>
          ) : (
            list.map((t, i) => {
              const status = STATUS_LABEL[t.status];
              const counterpart = tab === 'incoming' ? t.from_user_name : t.to_user_name;
              const counterpartId = tab === 'incoming' ? t.from_user_id : t.to_user_id;
              const heading =
                tab === 'incoming'
                  ? t.type === 'request'
                    ? '譲ってほしいと依頼'
                    : '譲りたいと申し出'
                  : t.type === 'request'
                    ? '譲渡を依頼済み'
                    : '譲渡を申し出済み';
              const busy = busyId === t.id;

              return (
                <motion.div
                  key={`${tab}-${t.id}`}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28, delay: i * 0.04 }}
                  className="glass space-y-3 rounded-[22px] p-4"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={counterpart} seed={counterpartId} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[15px] font-extrabold text-ink">{counterpart}</span>
                        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.className}`}>{status.label}</span>
                      </div>
                      <div className="text-[12px] font-semibold text-slate-500">{heading}</div>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/60 px-3 py-2 text-[14px] font-bold text-ink tabular-nums">
                    {t.vehicle_name}・{formatJstRange(t.start_time, t.end_time)}
                  </div>
                  {t.message && <p className="text-[13px] text-slate-600">「{t.message}」</p>}
                  {t.response_message && <p className="rounded-2xl bg-violet-500/8 px-3 py-2 text-[13px] text-slate-600">返信:「{t.response_message}」</p>}

                  {t.status === 'pending' && tab === 'incoming' && (
                    <AnimatePresence mode="wait" initial={false}>
                      {replyFor === t.id ? (
                        <motion.div key="reply" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                          <textarea
                            rows={2}
                            maxLength={500}
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                            placeholder="返信（任意）"
                            className="glass-input px-3 py-2"
                          />
                          <div className="flex gap-2">
                            <Button variant="secondary" size="sm" className="flex-1" onClick={() => setReplyFor(null)}>
                              戻る
                            </Button>
                            <Button variant="dark" size="sm" className="flex-1" loading={busy} onClick={() => act(t.id, 'decline', reply)}>
                              お断りを送信
                            </Button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            disabled={busy}
                            onClick={() => {
                              setReplyFor(t.id);
                              setReply('');
                            }}
                          >
                            お断り
                          </Button>
                          <Button variant="violet" size="sm" className="flex-1" loading={busy} onClick={() => act(t.id, 'accept')}>
                            承諾
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}

                  {t.status === 'pending' && tab === 'outgoing' && (
                    <Button variant="secondary" size="sm" className="w-full" loading={busy} onClick={() => act(t.id, 'cancel')}>
                      依頼を取り消す
                    </Button>
                  )}
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
