import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { HttpError } from '@/lib/server/auth';
import { replyLine, textMessage, verifyLineSignature, openAppAction, buttonsMessage } from '@/lib/server/line';
import { findProfileByLineUserId, upcomingReservationsText } from '@/lib/server/notifications';
import { listTransfers, respondTransfer } from '@/lib/server/transfers';
import { formatJstRange } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

const HELP_TEXT = [
  '📖 使い方',
  '・アプリの「設定・管理」→「LINE 連携」で表示される6桁のコードを送信すると連携できます。',
  '・「予約」… 今後の自分の予約を表示',
  '・「譲渡」… 回答待ちの譲渡依頼を表示',
  '・「解除」… LINE 連携を解除',
].join('\n');

/**
 * LINE 公式アカウントの Webhook
 * LINE Developers コンソールの Webhook URL に https://<ドメイン>/api/line/webhook を設定してください。
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyLineSignature(rawBody, request.headers.get('x-line-signature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  for (const event of payload.events || []) {
    try {
      await handleEvent(event);
    } catch (e) {
      console.error('LINE Webhook イベント処理エラー:', e);
    }
  }
  // LINE プラットフォームには常に 200 を返す
  return NextResponse.json({ ok: true });
}

async function handleEvent(event: any) {
  const lineUserId: string | undefined = event.source?.userId;
  const replyToken: string = event.replyToken;
  if (!lineUserId) return;

  switch (event.type) {
    case 'follow':
      await replyLine(replyToken, [
        textMessage('友だち追加ありがとうございます！🚗\nファミリーカーシェアの通知をお届けします。\n\nアプリの「設定・管理」→「LINE 連携」で表示される6桁のコードをこのトークに送信して、アカウントを連携してください。'),
      ]);
      return;

    case 'unfollow': {
      const profile = await findProfileByLineUserId(lineUserId);
      if (profile) await adminDb.collection('profiles').doc(profile.uid).update({ line_user_id: FieldValue.delete() });
      return;
    }

    case 'message':
      if (event.message?.type === 'text') await handleText(lineUserId, replyToken, String(event.message.text).trim());
      return;

    case 'postback':
      await handlePostback(lineUserId, replyToken, String(event.postback?.data || ''));
      return;
  }
}

async function handleText(lineUserId: string, replyToken: string, text: string) {
  // 連携コード（6桁の数字）
  const normalized = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\s/g, '');
  if (/^\d{6}$/.test(normalized)) {
    await linkAccount(lineUserId, replyToken, normalized);
    return;
  }

  const profile = await findProfileByLineUserId(lineUserId);
  if (!profile) {
    await replyLine(replyToken, [textMessage('まだアカウントが連携されていません。\nアプリの「設定・管理」→「LINE 連携」で表示される6桁のコードを送信してください。')]);
    return;
  }

  if (/予約|予定/.test(text)) {
    await replyLine(replyToken, [textMessage(await upcomingReservationsText(profile.uid))]);
  } else if (/譲渡|依頼/.test(text)) {
    await replyPendingTransfers(profile.uid, replyToken);
  } else if (/解除/.test(text)) {
    await adminDb.collection('profiles').doc(profile.uid).update({ line_user_id: FieldValue.delete() });
    await replyLine(replyToken, [textMessage('LINE 連携を解除しました。再度連携する場合はアプリで新しいコードを発行してください。')]);
  } else {
    await replyLine(replyToken, [textMessage(HELP_TEXT)]);
  }
}

async function linkAccount(lineUserId: string, replyToken: string, code: string) {
  const codeRef = adminDb.collection('line_link_codes').doc(code);
  const snap = await codeRef.get();
  if (!snap.exists || snap.data()!.expires_at.toMillis() < Date.now()) {
    await replyLine(replyToken, [textMessage('連携コードが見つからないか、有効期限が切れています。アプリで新しいコードを発行してください。')]);
    return;
  }
  const uid: string = snap.data()!.uid;

  // 同じ LINE アカウントが別のユーザーに連携されていれば解除（1 LINE アカウント = 1 ユーザー）
  const others = await adminDb.collection('profiles').where('line_user_id', '==', lineUserId).get();
  await Promise.all(others.docs.filter((d) => d.id !== uid).map((d) => d.ref.update({ line_user_id: FieldValue.delete() })));

  await adminDb.collection('profiles').doc(uid).set(
    { line_user_id: lineUserId, line_linked_at: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await codeRef.delete();

  const profileSnap = await adminDb.collection('profiles').doc(uid).get();
  const name = profileSnap.data()?.name || 'ユーザー';
  await replyLine(replyToken, [
    textMessage(`✅ ${name}さんのアカウントと連携しました！\n今後、新規予約・予約リマインド・譲渡依頼などをこのトークでお知らせします。\n\n${HELP_TEXT}`),
  ]);
}

async function replyPendingTransfers(uid: string, replyToken: string) {
  const { incoming } = await listTransfers(uid);
  const pending = incoming.filter((t) => t.status === 'pending').slice(0, 4);
  if (pending.length === 0) {
    await replyLine(replyToken, [textMessage('📭 回答待ちの譲渡依頼はありません。')]);
    return;
  }
  await replyLine(
    replyToken,
    pending.map((t) =>
      buttonsMessage({
        altText: `${t.from_user_name}さんからの譲渡${t.type === 'request' ? '依頼' : '申し出'}`,
        text: `${t.from_user_name}さんからの${t.type === 'request' ? '譲渡依頼' : '譲渡の申し出'}\n${t.vehicle_name} ${formatJstRange(t.start_time, t.end_time)}${t.message ? `\n「${t.message}」` : ''}`,
        actions: [
          { type: 'postback', label: '承諾する', data: `action=transfer_accept&id=${t.id}`, displayText: '承諾します' },
          { type: 'postback', label: 'お断りする', data: `action=transfer_decline&id=${t.id}`, displayText: 'お断りします' },
          ...openAppAction(),
        ],
      })
    )
  );
}

async function handlePostback(lineUserId: string, replyToken: string, data: string) {
  const params = new URLSearchParams(data);
  const action = params.get('action');
  const id = params.get('id') || '';
  if (action !== 'transfer_accept' && action !== 'transfer_decline') return;

  const profile = await findProfileByLineUserId(lineUserId);
  if (!profile) {
    await replyLine(replyToken, [textMessage('アカウントが連携されていないため、この操作はできません。')]);
    return;
  }

  try {
    const accept = action === 'transfer_accept';
    await respondTransfer(profile.uid, id, accept);
    await replyLine(replyToken, [
      textMessage(accept ? '✅ 譲渡を承諾しました。手続きが完了し、相手にも通知しました。' : '🙅 譲渡をお断りしました。相手に通知しました。'),
    ]);
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : '処理中にエラーが発生しました。アプリから操作してください。';
    await replyLine(replyToken, [textMessage(`⚠️ ${msg}`)]);
  }
}
