import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';

/**
 * LINE Messaging API クライアント（公式アカウント連携）
 *
 * 必要な環境変数:
 *   LINE_CHANNEL_ACCESS_TOKEN … Messaging API のチャネルアクセストークン（長期）
 *   LINE_CHANNEL_SECRET       … Webhook 署名検証用のチャネルシークレット
 */

const LINE_API = 'https://api.line.me/v2/bot';

export type LineMessage = Record<string, any>;

export const isLineConfigured = () =>
  !!process.env.LINE_CHANNEL_ACCESS_TOKEN && !!process.env.LINE_CHANNEL_SECRET;

/** アプリの公開 URL（LINE のボタンからアプリを開くために使用） */
export const getAppUrl = (): string => {
  const url =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return url.replace(/\/$/, '');
};

async function callLineApi(path: string, body: unknown) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return;
  const res = await fetch(`${LINE_API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`LINE API エラー (${path}): HTTP ${res.status} ${await res.text().catch(() => '')}`);
  }
}

/** Webhook リクエストの署名 (x-line-signature) を検証します */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const actual = Buffer.from(signature, 'base64');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** 返信メッセージ（Webhook の replyToken を使用・無料枠を消費しません） */
export async function replyLine(replyToken: string, messages: LineMessage[]) {
  if (!replyToken || messages.length === 0) return;
  await callLineApi('/message/reply', { replyToken, messages: messages.slice(0, 5) });
}

/** プッシュメッセージ（特定の LINE ユーザーへ送信） */
export async function pushLine(to: string, messages: LineMessage[]) {
  if (!to || messages.length === 0) return;
  await callLineApi('/message/push', { to, messages: messages.slice(0, 5) });
}

export type NotificationKind = 'new_reservation' | 'reminder' | 'transfer';

/**
 * アプリのユーザー ID を指定して LINE 通知を送信します。
 * LINE 未連携のユーザーや、該当する通知をオフにしているユーザーはスキップします。
 */
export async function notifyUsers(uids: string[], kind: NotificationKind, messages: LineMessage[]) {
  if (!isLineConfigured()) return;
  const unique = [...new Set(uids.filter(Boolean))];
  await Promise.all(
    unique.map(async (uid) => {
      try {
        const snap = await adminDb.collection('profiles').doc(uid).get();
        const profile = snap.data();
        if (!profile?.line_user_id) return;
        if (profile.line_notifications?.[kind] === false) return;
        await pushLine(profile.line_user_id, messages);
      } catch (e) {
        console.error(`LINE 通知送信エラー (uid=${uid}):`, e);
      }
    })
  );
}

/** テキストメッセージ */
export const textMessage = (text: string): LineMessage => ({ type: 'text', text: text.slice(0, 5000) });

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * ボタン付きメッセージ（ボタンテンプレート）
 * actions は最大 4 件。uri アクションはアプリ URL が未設定なら自動で除外されます。
 */
export function buttonsMessage(params: {
  altText: string;
  title?: string;
  text: string;
  actions: LineMessage[];
}): LineMessage {
  const actions = params.actions.filter((a) => a.type !== 'uri' || /^https:\/\//.test(a.uri || '')).slice(0, 4);
  if (actions.length === 0) return textMessage(params.text);
  return {
    type: 'template',
    altText: truncate(params.altText, 400),
    template: {
      type: 'buttons',
      ...(params.title ? { title: truncate(params.title, 40) } : {}),
      // LINE の仕様: タイトルありは 60 文字、タイトルなしは 160 文字まで
      text: truncate(params.text, params.title ? 60 : 160),
      actions,
    },
  };
}

/** アプリを開く URI アクション（アプリ URL 未設定時は空配列） */
export const openAppAction = (label = 'アプリで確認'): LineMessage[] => {
  const appUrl = getAppUrl();
  return appUrl ? [{ type: 'uri', label, uri: appUrl }] : [];
};
