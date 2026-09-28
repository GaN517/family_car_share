import { NextRequest, NextResponse } from 'next/server';
import { sendReminders } from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';

/**
 * 予約リマインド送信 API（定期実行用）
 * GET /api/cron/reminders?mode=daily     … 明日の予約を前日にまとめて通知（Vercel Cron で毎日実行）
 * GET /api/cron/reminders?mode=upcoming  … 開始が近い予約を通知（外部の定期実行から呼び出し）
 *
 * Authorization: Bearer <CRON_SECRET> が必要です（Vercel Cron は自動で付与します）。
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') === 'daily' ? 'daily' : 'upcoming';
  const lead = Number(searchParams.get('lead_minutes') || process.env.REMINDER_LEAD_MINUTES || 120);

  try {
    const result = await sendReminders(mode, Number.isFinite(lead) && lead > 0 ? Math.min(lead, 24 * 60) : 120);
    return NextResponse.json({ success: true, mode, ...result });
  } catch (error: any) {
    console.error('リマインド送信エラー:', error);
    return NextResponse.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
