import { initializeApp, getApps, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'placeholder-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'placeholder-auth-domain',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'placeholder-project-id',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'placeholder-storage-bucket',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'placeholder-sender-id',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'placeholder-app-id',
};

// Next.js のビルド・サーバーレンダリング時に多重初期化されるのを防ぎます
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// E2E テスト用: NEXT_PUBLIC_FIREBASE_EMULATOR_HOST が設定されている場合のみローカルのエミュレータへ接続
const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST;
const globalForEmulator = globalThis as { __fcsEmulatorConnected?: boolean };
if (emulatorHost && typeof window !== 'undefined' && !globalForEmulator.__fcsEmulatorConnected) {
  globalForEmulator.__fcsEmulatorConnected = true;
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
}

export { app, auth, db };
