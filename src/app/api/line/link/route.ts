import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue, Timestamp } from '@/lib/firebase-admin';
import { errorResponse, HttpError, requireUser } from '@/lib/server/auth';
import { isLineConfigured } from '@/lib/server/line';

export const dynamic = 'force-dynamic';

const CODE_TTL_MINUTES = 15;

const lineInfo = () => ({
  configured: isLineConfigured(),
  friend_url: process.env.LINE_FRIEND_URL || process.env.NEXT_PUBLIC_LINE_FRIEND_URL || '',
});

/** LINE 連携状態と通知設定の取得 (GET) */
export async function GET(request: NextRequest) {
  try {
    const { uid } = await requireUser(request);
    const snap = await adminDb.collection('profiles').doc(uid).get();
    const profile = snap.data() || {};
    return NextResponse.json({
      success: true,
      data: {
        ...lineInfo(),
        linked: !!profile.line_user_id,
        notifications: {
          new_reservation: profile.line_notifications?.new_reservation !== false,
          reminder: profile.line_notifications?.reminder !== false,
          transfer: profile.line_notifications?.transfer !== false,
        },
      },
    });
  } catch (error) {
    return errorResponse(error, 'LINE 連携状態の取得エラー');
  }
}

/**
 * 連携コードの発行 (POST)
 * ユーザーは公式アカウントを友だち追加し、トーク画面でこのコードを送信すると連携が完了します。
 */
export async function POST(request: NextRequest) {
  try {
    const { uid } = await requireUser(request);
    if (!isLineConfigured()) throw new HttpError(503, 'LINE 公式アカウントの連携が設定されていません（管理者向け: 環境変数を設定してください）。');

    // 古いコードを削除
    const old = await adminDb.collection('line_link_codes').where('uid', '==', uid).get();
    await Promise.all(old.docs.map((d) => d.ref.delete()));

    let code = '';
    for (let i = 0; i < 5; i++) {
      const candidate = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      const exists = await adminDb.collection('line_link_codes').doc(candidate).get();
      if (!exists.exists || exists.data()!.expires_at.toMillis() < Date.now()) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new HttpError(503, 'コードの発行に失敗しました。もう一度お試しください。');

    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
    await adminDb.collection('line_link_codes').doc(code).set({
      uid,
      expires_at: Timestamp.fromDate(expiresAt),
      created_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, data: { code, expires_at: expiresAt.toISOString(), ...lineInfo() } });
  } catch (error) {
    return errorResponse(error, 'LINE 連携コードの発行エラー');
  }
}

/** 通知設定の更新 (PATCH) body: { notifications: { new_reservation?, reminder?, transfer? } } */
export async function PATCH(request: NextRequest) {
  try {
    const { uid } = await requireUser(request);
    const body = await request.json().catch(() => ({}));
    const input = body?.notifications || {};
    const update: Record<string, boolean> = {};
    for (const key of ['new_reservation', 'reminder', 'transfer']) {
      if (typeof input[key] === 'boolean') update[`line_notifications.${key}`] = input[key];
    }
    if (Object.keys(update).length === 0) throw new HttpError(400, '更新する設定がありません。');
    await adminDb.collection('profiles').doc(uid).update(update);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'LINE 通知設定の更新エラー');
  }
}

/** LINE 連携の解除 (DELETE) */
export async function DELETE(request: NextRequest) {
  try {
    const { uid } = await requireUser(request);
    await adminDb.collection('profiles').doc(uid).update({ line_user_id: FieldValue.delete() });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'LINE 連携の解除エラー');
  }
}
