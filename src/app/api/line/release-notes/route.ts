import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { getAppUrl, isLineConfigured, pushLine, textMessage } from '@/lib/server/line';
import { formatReleaseNote, LATEST_RELEASE } from '@/lib/release-notes';

export const dynamic = 'force-dynamic';

/**
 * リリースノートの LINE 配信 API（本番デプロイ後に GitHub Actions から呼び出し）
 * POST /api/line/release-notes            … 未配信の version なら LINE 連携済みの全ユーザーへ送信
 * POST /api/line/release-notes?dry_run=1  … 送信せず、宛先数と本文だけを返す
 *
 * Authorization: Bearer <CRON_SECRET> が必要です。
 * 同じ version は release_broadcasts/{version} の作成で排他し、二重配信しません。
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!isLineConfigured()) {
    return NextResponse.json({ success: false, error: 'LINE が未設定です。' }, { status: 503 });
  }

  const dryRun = new URL(request.url).searchParams.get('dry_run') === '1';
  const note = LATEST_RELEASE;
  const text = formatReleaseNote(note, getAppUrl());

  try {
    const profiles = await adminDb.collection('profiles').get();
    const recipients = [
      ...new Set(profiles.docs.map((d) => d.data().line_user_id as string | undefined).filter((id): id is string => !!id)),
    ];

    if (dryRun) {
      return NextResponse.json({ success: true, dry_run: true, version: note.version, recipients: recipients.length, text });
    }

    const ref = adminDb.collection('release_broadcasts').doc(note.version);
    try {
      await ref.create({ version: note.version, status: 'sending', recipients: recipients.length, created_at: FieldValue.serverTimestamp() });
    } catch {
      return NextResponse.json({ success: true, skipped: true, reason: 'already_sent', version: note.version });
    }

    const results = await Promise.allSettled(recipients.map((to) => pushLine(to, [textMessage(text)])));
    const failed = results.filter((r) => r.status === 'rejected').length;
    await ref.update({ status: 'sent', failed, sent_at: FieldValue.serverTimestamp() });

    return NextResponse.json({ success: true, version: note.version, recipients: recipients.length, failed });
  } catch (error: any) {
    console.error('リリースノート配信エラー:', error);
    return NextResponse.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
