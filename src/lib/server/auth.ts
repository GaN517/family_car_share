import { NextResponse } from 'next/server';
import { adminDb, verifyIdToken } from '@/lib/firebase-admin';

/** ステータスコード付きのエラー（API レスポンスにそのまま変換されます） */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Authorization: Bearer <ID トークン> を検証してログインユーザーを返します */
export async function requireUser(request: Request): Promise<{ uid: string; email?: string }> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError(401, '認証が必要です。');
  }
  try {
    return await verifyIdToken(authHeader.slice('Bearer '.length));
  } catch (e: any) {
    throw new HttpError(401, e?.message || '認証に失敗しました。');
  }
}

export interface UserContext {
  uid: string;
  name: string;
  email: string;
  groupId: string;
  profile: FirebaseFirestore.DocumentData;
}

/** ユーザーのプロフィールと所属グループを取得します */
export async function getUserContext(uid: string): Promise<UserContext> {
  const profileSnap = await adminDb.collection('profiles').doc(uid).get();
  const profile = profileSnap.exists ? profileSnap.data()! : {};
  let groupId: string = profile.group_id || '';

  // プロフィールに group_id がない場合、所属グループを直接検索
  if (!groupId) {
    const gs = await adminDb.collection('groups').where('members', 'array-contains', uid).limit(1).get();
    if (!gs.empty) {
      groupId = gs.docs[0].id;
    } else {
      const os = await adminDb.collection('groups').where('owner_id', '==', uid).limit(1).get();
      if (!os.empty) groupId = os.docs[0].id;
    }
  }

  return {
    uid,
    name: profile.name || 'ユーザー',
    email: profile.email || '',
    groupId,
    profile,
  };
}

/** グループ未所属ならエラーにします */
export async function requireGroupUser(request: Request): Promise<UserContext> {
  const { uid } = await requireUser(request);
  const ctx = await getUserContext(uid);
  if (!ctx.groupId) {
    throw new HttpError(400, 'グループに所属していません。設定画面からグループを作成または参加してください。');
  }
  return ctx;
}

/** 例外を JSON のエラーレスポンスに変換します */
export function errorResponse(error: unknown, label: string) {
  if (error instanceof HttpError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error(`${label}:`, error);
  const detail = (error as any)?.message || String(error);
  return NextResponse.json({ success: false, error: `${label}: ${detail}` }, { status: 500 });
}
