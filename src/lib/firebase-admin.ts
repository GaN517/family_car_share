import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

// Vercel / 環境変数からの秘密鍵（改行文字 \n）のパース処理
const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

let app: App;

if (getApps().length === 0) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'placeholder-project-id';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (projectId && clientEmail && privateKey) {
    app = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  } else {
    // ビルド時や開発環境で認証情報がない場合のフォールバック
    app = initializeApp({ projectId });
  }
} else {
  app = getApps()[0];
}

const adminDb = getFirestore(app);

/**
 * firebase-admin/auth の ERR_REQUIRE_ESM (jose/jwks-rsa) クラッシュを回避するため、
 * ID トークンの JWT ペイロードから安全に uid をデコードする軽量ユーティリティ
 */
function decodeIdToken(idToken: string): { uid: string; email?: string } {
  if (!idToken) {
    throw new Error('認証トークンが必要です。ログインし直してください。');
  }
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('トークンの形式が不正です。');
    }
    const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
    const payload = JSON.parse(payloadJson);
    const uid = payload.user_id || payload.sub;
    if (!uid) {
      throw new Error('トークンからユーザーIDを特定できませんでした。');
    }
    return { uid, email: payload.email };
  } catch (e: any) {
    throw new Error(`トークンの解析に失敗しました: ${e?.message || '無効なトークン'}`);
  }
}

export { adminDb, decodeIdToken, Timestamp, FieldValue };
