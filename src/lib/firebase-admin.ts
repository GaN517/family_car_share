import crypto from 'crypto';
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

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getGoogleCerts(): Promise<Record<string, string>> {
  if (certCache && certCache.expiresAt > Date.now()) return certCache.certs;
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error(`公開鍵の取得に失敗しました (HTTP ${res.status})`);
  const certs = (await res.json()) as Record<string, string>;
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  certCache = { certs, expiresAt: Date.now() + maxAge * 1000 };
  return certs;
}

const decodeSegment = (segment: string) => JSON.parse(Buffer.from(segment, 'base64url').toString('utf-8'));

/**
 * Firebase ID トークンを検証し、uid を返します。
 *
 * firebase-admin/auth は ERR_REQUIRE_ESM (jose/jwks-rsa) でクラッシュするため使用せず、
 * Google の公開鍵と Node.js 標準の crypto で RS256 署名・発行者・対象・有効期限を検証します。
 * （以前はペイロードをデコードするだけで署名を検証しておらず、トークンを偽造できる状態でした）
 */
async function verifyIdToken(idToken: string): Promise<{ uid: string; email?: string }> {
  if (!idToken) {
    throw new Error('認証トークンが必要です。ログインし直してください。');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('トークンの形式が不正です。');
  }

  let header: { alg?: string; kid?: string };
  let payload: Record<string, any>;
  try {
    header = decodeSegment(parts[0]);
    payload = decodeSegment(parts[1]);
  } catch {
    throw new Error('トークンの解析に失敗しました。');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('トークンの署名形式が不正です。');
  }

  const certs = await getGoogleCerts();
  let pem = certs[header.kid];
  if (!pem) {
    // 鍵がローテーションされた直後の可能性があるため、キャッシュを破棄して再取得
    certCache = null;
    pem = (await getGoogleCerts())[header.kid];
  }
  if (!pem) {
    throw new Error('トークンの署名鍵が見つかりません。ログインし直してください。');
  }

  const validSignature = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    crypto.createPublicKey(pem),
    Buffer.from(parts[2], 'base64url')
  );
  if (!validSignature) {
    throw new Error('トークンの署名が無効です。');
  }

  const now = Math.floor(Date.now() / 1000);
  const skew = 300;
  if (!FIREBASE_PROJECT_ID || payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error('トークンの発行先プロジェクトが一致しません。');
  }
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error('トークンの発行者が不正です。');
  }
  if (typeof payload.exp !== 'number' || payload.exp + skew < now) {
    throw new Error('ログインの有効期限が切れました。ページを再読み込みしてください。');
  }
  if (typeof payload.iat !== 'number' || payload.iat - skew > now) {
    throw new Error('トークンの発行時刻が不正です。');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('トークンからユーザーIDを特定できませんでした。');
  }

  return { uid: payload.sub, email: payload.email };
}

export { adminDb, verifyIdToken, Timestamp, FieldValue };
