'use client';

import React, { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { formatJstRange } from '@/lib/datetime';
import { X, ArrowRightLeft, Loader2, Inbox, Send, AlertCircle } from 'lucide-react';

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
  pending: { label: '回答待ち', className: 'bg-amber-100 text-amber-700' },
  accepted: { label: '譲渡成立', className: 'bg-emerald-100 text-emerald-700' },
  declined: { label: 'お断り', className: 'bg-slate-200 text-slate-600' },
  cancelled: { label: '取り消し', className: 'bg-slate-100 text-slate-400' },
};

/** 譲渡依頼の受信箱・送信済み一覧（承諾・辞退・取り消し） */
export default function TransferInbox({ isOpen, onClose, incoming, outgoing, onChanged }: TransferInboxProps) {
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-slide-up sm:animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50 rounded-t-3xl">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
            <ArrowRightLeft className="h-4.5 w-4.5 text-violet-600" />
            予約の譲渡
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 p-2 border-b border-slate-100">
          {(['incoming', 'outgoing'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                tab === t ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {t === 'incoming' ? <Inbox className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {t === 'incoming' ? '受け取った依頼' : '送った依頼'}
              {t === 'incoming' && pendingIncoming > 0 && (
                <span className={`ml-1 px-1.5 rounded-full text-[10px] ${tab === t ? 'bg-white text-violet-600' : 'bg-rose-500 text-white'}`}>
                  {pendingIncoming}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto space-y-3 flex-grow">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-semibold flex gap-1.5 items-start">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {list.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">
              {tab === 'incoming' ? '受け取った譲渡依頼はありません。' : '送った譲渡依頼はありません。'}
            </p>
          ) : (
            list.map((t) => {
              const status = STATUS_LABEL[t.status];
              const counterpart = tab === 'incoming' ? t.from_user_name : t.to_user_name;
              const heading =
                tab === 'incoming'
                  ? t.type === 'request'
                    ? `${counterpart}さんが「譲ってほしい」と依頼しています`
                    : `${counterpart}さんが予約を譲りたいと申し出ています`
                  : t.type === 'request'
                    ? `${counterpart}さんに譲渡を依頼しました`
                    : `${counterpart}さんに譲渡を申し出ました`;
              const busy = busyId === t.id;

              return (
                <div key={t.id} className="border border-slate-100 rounded-2xl p-3.5 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-slate-800 leading-snug">{heading}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${status.className}`}>{status.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    🚗 {t.vehicle_name} ・ {formatJstRange(t.start_time, t.end_time)}
                  </p>
                  {t.message && <p className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2">「{t.message}」</p>}
                  {t.response_message && (
                    <p className="text-[11px] text-slate-600 bg-violet-50 rounded-lg p-2">返信:「{t.response_message}」</p>
                  )}

                  {t.status === 'pending' && tab === 'incoming' && (
                    <>
                      {replyFor === t.id ? (
                        <div className="space-y-2">
                          <textarea
                            rows={2}
                            maxLength={500}
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                            placeholder="お断りの理由や代わりの提案（任意）"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => setReplyFor(null)} className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500">
                              戻る
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => act(t.id, 'decline', reply)}
                              className="flex-1 py-2 bg-slate-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'お断りを送信'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            disabled={busy}
                            onClick={() => {
                              setReplyFor(t.id);
                              setReply('');
                            }}
                            className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 disabled:opacity-50"
                          >
                            お断りする
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => act(t.id, 'accept')}
                            className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : '承諾する'}
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {t.status === 'pending' && tab === 'outgoing' && (
                    <button
                      disabled={busy}
                      onClick={() => act(t.id, 'cancel')}
                      className="w-full py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-500 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : '依頼を取り消す'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
