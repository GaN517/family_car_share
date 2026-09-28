import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireGroupUser, requireUser } from '@/lib/server/auth';
import { cancelTransfer, createTransfer, listTransfers, respondTransfer } from '@/lib/server/transfers';

export const dynamic = 'force-dynamic';

/** 自分宛て・自分が送った譲渡依頼の一覧 (GET) */
export async function GET(request: NextRequest) {
  try {
    const { uid } = await requireUser(request);
    return NextResponse.json({ success: true, data: await listTransfers(uid) });
  } catch (error) {
    return errorResponse(error, '譲渡依頼の取得エラー');
  }
}

/**
 * 譲渡依頼・申し出の作成 (POST)
 * body: { reservation_id, type: 'request' | 'offer', to_user_id?, message? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireGroupUser(request);
    const body = await request.json().catch(() => {
      throw new HttpError(400, 'リクエストの形式が不正です。');
    });
    const result = await createTransfer(ctx, body);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error, '譲渡依頼の作成エラー');
  }
}

/**
 * 譲渡依頼への回答・取り消し (PATCH)
 * body: { id, action: 'accept' | 'decline' | 'cancel', message? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { uid } = await requireUser(request);
    const body = await request.json().catch(() => {
      throw new HttpError(400, 'リクエストの形式が不正です。');
    });
    const { id, action, message } = body || {};
    if (!id) throw new HttpError(400, '譲渡依頼IDが必要です。');

    if (action === 'accept' || action === 'decline') {
      const result = await respondTransfer(uid, id, action === 'accept', message || '');
      return NextResponse.json({ success: true, data: result });
    }
    if (action === 'cancel') {
      await cancelTransfer(uid, id);
      return NextResponse.json({ success: true });
    }
    throw new HttpError(400, '操作の指定が不正です。');
  } catch (error) {
    return errorResponse(error, '譲渡依頼の更新エラー');
  }
}
