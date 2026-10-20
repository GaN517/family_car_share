'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { formatJstRange } from '@/lib/datetime';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRightLeft, Check } from 'lucide-react';
import Sheet from '@/components/ui/sheet';
import { Avatar, Button, FieldLabel, Notice } from '@/components/ui/primitives';

interface TransferTarget {
  id: string;
  start_time: string;
  end_time: string;
  user_id: string;
  profiles?: { name: string };
}

interface TransferRequestModalProps {
  isOpen: boolean;
  /** request: 譲ってほしいと依頼 / offer: 自分の予約を譲る */
  mode: 'request' | 'offer';
  reservation: TransferTarget | null;
  vehicleName: string;
  /** 譲渡先として選択できるメンバー（offer のとき使用） */
  members: { uid: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}

/** 予約枠の譲渡依頼・譲渡の申し出を作成するモーダル */
export default function TransferRequestModal({
  isOpen,
  mode,
  reservation,
  vehicleName,
  members,
  onClose,
  onDone,
}: TransferRequestModalProps) {
  const [message, setMessage] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setToUserId(members[0]?.uid || '');
      setError('');
      setDone(false);
    }
  }, [isOpen, members]);

  const ownerName = reservation?.profiles?.name || '予約者';
  const recipientName = mode === 'request' ? ownerName : members.find((m) => m.uid === toUserId)?.name || '';

  const handleSubmit = async () => {
    if (!reservation) return;
    if (mode === 'offer' && !toUserId) {
      setError('譲渡先のメンバーを選択してください。');
      return;
    }
    setSubmitting(true);
    setError('');
    const res = await apiFetch('/api/transfers', {
      method: 'POST',
      body: {
        reservation_id: reservation.id,
        type: mode,
        ...(mode === 'offer' ? { to_user_id: toUserId } : {}),
        message: message.trim(),
      },
    });
    setSubmitting(false);
    if (res.success) {
      setDone(true);
      onDone();
    } else {
      setError(res.error || '送信に失敗しました。');
    }
  };

  return (
    <Sheet
      open={isOpen && !!reservation}
      onClose={onClose}
      testId="transfer-sheet"
      icon={<ArrowRightLeft className="h-5 w-5 text-violet-600" />}
      title={mode === 'request' ? '譲ってほしい' : '予約を譲る'}
      footer={
        done ? (
          <Button variant="secondary" className="w-full" onClick={onClose}>
            閉じる
          </Button>
        ) : (
          <Button
            variant="violet"
            className="w-full"
            onClick={handleSubmit}
            loading={submitting}
            disabled={mode === 'offer' && members.length === 0}
            data-testid="submit-transfer"
          >
            {mode === 'request' ? `${ownerName}さんに依頼` : '譲渡を申し出る'}
          </Button>
        )
      }
    >
      {reservation && (
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4 py-6 text-center" data-testid="transfer-done">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 14 }}
                className="flex h-18 w-18 items-center justify-center rounded-full bg-gradient-to-b from-violet-400 to-violet-600 text-white"
              >
                <Check className="h-9 w-9" strokeWidth={3} />
              </motion.div>
              <p className="text-[18px] font-extrabold text-ink">{recipientName}さんに送信しました</p>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
              <div className="glass flex items-center gap-3 rounded-[22px] p-4">
                <Avatar name={ownerName} seed={reservation.user_id} size={44} />
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-slate-500">
                    {ownerName}・{vehicleName}
                  </div>
                  <div className="text-[17px] font-extrabold text-ink tabular-nums">{formatJstRange(reservation.start_time, reservation.end_time)}</div>
                </div>
              </div>

              {mode === 'offer' && (
                <div>
                  <FieldLabel>譲る相手</FieldLabel>
                  {members.length === 0 ? (
                    <p className="text-[13px] font-semibold text-slate-400">他のメンバーがいません</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {members.map((m) => (
                        <motion.button
                          key={m.uid}
                          type="button"
                          whileTap={{ scale: 0.94 }}
                          onClick={() => setToUserId(m.uid)}
                          className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-[14px] font-bold transition-colors ${
                            toUserId === m.uid ? 'border-transparent bg-ink text-white' : 'border-slate-900/8 bg-white/70 text-slate-600'
                          }`}
                        >
                          <Avatar name={m.name} seed={m.uid} size={28} />
                          {m.name}
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <FieldLabel htmlFor="transfer-message">メッセージ</FieldLabel>
                <textarea
                  id="transfer-message"
                  rows={3}
                  maxLength={500}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="任意"
                  className="glass-input px-4 py-3"
                />
              </div>

              <Notice kind="error">{error}</Notice>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </Sheet>
  );
}
