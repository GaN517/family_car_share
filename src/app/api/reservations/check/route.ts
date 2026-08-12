import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth, Timestamp } from '@/lib/firebase-admin';

/**
 * 予約時間帯の重複判定 API
 * GET /api/reservations/check?vehicle_id=xxx&start_time=xxx&end_time=xxx[&reservation_id=xxx]
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get('vehicle_id');
  const startTime = searchParams.get('start_time');
  const endTime = searchParams.get('end_time');
  const reservationId = searchParams.get('reservation_id');

  if (!vehicleId || !startTime || !endTime) {
    return NextResponse.json({ error: '必要なパラメータが不足しています。' }, { status: 400 });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    await adminAuth.verifyIdToken(idToken);

    const startDateTime = new Date(startTime);
    const endDateTime = new Date(endTime);

    const twoDaysAgo = new Date(startDateTime);
    twoDaysAgo.setDate(startDateTime.getDate() - 2);
    const twoDaysLater = new Date(startDateTime);
    twoDaysLater.setDate(startDateTime.getDate() + 2);

    const resSnap = await adminDb.collection('reservations')
      .where('vehicle_id', '==', vehicleId)
      .where('start_time', '>=', Timestamp.fromDate(twoDaysAgo))
      .where('start_time', '<=', Timestamp.fromDate(twoDaysLater))
      .get();

    const hasConflict = resSnap.docs.some((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      if (reservationId && doc.id === reservationId) return false;
      const data = doc.data();
      const existingStart = (data.start_time as FirebaseFirestore.Timestamp).toDate().getTime();
      const existingEnd = (data.end_time as FirebaseFirestore.Timestamp).toDate().getTime();
      return !(startDateTime.getTime() >= existingEnd || endDateTime.getTime() <= existingStart);
    });

    return NextResponse.json({
      conflict: hasConflict,
      message: hasConflict ? '選択した時間帯は既に予約されています。' : 'この時間帯で予約可能です。',
    });
  } catch (error) {
    console.error('予約重複チェック API エラー:', error);
    return NextResponse.json({ error: 'システムエラーが発生しました。' }, { status: 500 });
  }
}
