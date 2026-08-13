import { NextRequest, NextResponse } from 'next/server';
import { createReservation, updateReservation, deleteReservation } from '@/app/actions/reservations';

/**
 * 予約作成 API (POST)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const body = await request.json();

    const result = await createReservation(body, idToken);
    if (!result || typeof result !== 'object' || Object.keys(result).length === 0) {
      return NextResponse.json({ success: false, error: 'サーバー内部処理で空のレスポンスが生成されました。' }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('予約作成 API エラー:', error);
    return NextResponse.json({ success: false, error: error.message || '予約作成処理でエラーが発生しました。' }, { status: 500 });
  }
}

/**
 * 予約更新 API (PUT)
 */
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const body = await request.json();
    const { id, ...inputData } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '予約IDが必要です。' }, { status: 400 });
    }

    const result = await updateReservation(id, inputData, idToken);
    if (!result || typeof result !== 'object' || Object.keys(result).length === 0) {
      return NextResponse.json({ success: false, error: 'サーバー内部処理で空のレスポンスが生成されました。' }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('予約更新 API エラー:', error);
    return NextResponse.json({ success: false, error: error.message || '予約更新処理でエラーが発生しました。' }, { status: 500 });
  }
}

/**
 * 予約削除 API (DELETE)
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '予約IDが必要です。' }, { status: 400 });
    }

    const result = await deleteReservation(id, idToken);
    if (!result || typeof result !== 'object' || Object.keys(result).length === 0) {
      return NextResponse.json({ success: false, error: 'サーバー内部処理で空のレスポンスが生成されました。' }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('予約削除 API エラー:', error);
    return NextResponse.json({ success: false, error: error.message || '予約削除処理でエラーが発生しました。' }, { status: 500 });
  }
}
