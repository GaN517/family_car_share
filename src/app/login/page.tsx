'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import LineSettings from '@/components/line-settings';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';
import {
  Car,
  User as UserIcon,
  Lock,
  Users,
  Calendar,
  Plus,
  Trash2,
  Copy,
  Check,
  LogOut,
  ChevronLeft,
  ChevronDown,
  KeyRound,
  Mail,
  FileText,
} from 'lucide-react';
import { SettingsSkeleton } from '@/components/skeletons';
import { Avatar, Button, FieldLabel, Notice, vehicleColor } from '@/components/ui/primitives';

export default function LoginPage() {
  const router = useRouter();

  // 認証関連ステート
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // ユーザー・グループ情報ステート
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // グループ管理関連ステート
  const [groupName, setGroupName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehicleColor, setNewVehicleColor] = useState('indigo');

  // カレンダーテンプレート設定ステート
  const [titleTemplate, setTitleTemplate] = useState('');
  const [descTemplate, setDescTemplate] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // カラーパレット
  const colors = [
    { value: 'indigo', label: 'インディゴ', bg: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
    { value: 'emerald', label: 'エメラルド', bg: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    { value: 'rose', label: 'ローズ', bg: 'bg-rose-100 text-rose-700 border-rose-300' },
    { value: 'amber', label: 'アンバー', bg: 'bg-amber-100 text-amber-700 border-amber-300' },
    { value: 'sky', label: 'スカイ', bg: 'bg-sky-100 text-sky-700 border-sky-300' },
    { value: 'violet', label: 'バイオレット', bg: 'bg-violet-100 text-violet-700 border-violet-300' },
  ];

  // Auth 状態監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await fetchUserData(user.uid);
      } else {
        setCurrentUser(null);
        setProfile(null);
        setGroup(null);
        setVehicles([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchUserData = async (uid: string) => {
    try {
      // 1. プロフィールの取得
      const profileRef = doc(db, 'profiles', uid);
      let profileSnap = await getDoc(profileRef);

      let profData = profileSnap.exists() ? profileSnap.data() : null;

      // カレンダートークンが存在しない場合は自動生成して保存
      if (!profData || !profData.calendar_token) {
        const newToken = self.crypto.randomUUID ? self.crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
        const updatedData = {
          ...(profData || {}),
          calendar_token: newToken,
          updated_at: serverTimestamp()
        };
        await setDoc(profileRef, updatedData, { merge: true });
        profData = updatedData;
      }
      setProfile(profData);

      // 2. 所属グループ情報の取得
      if (profData.group_id) {
        const groupRef = doc(db, 'groups', profData.group_id);
        const groupSnap = await getDoc(groupRef);

        if (groupSnap.exists()) {
          const groupData = groupSnap.data();
          setGroup({ id: groupSnap.id, ...groupData });
          setTitleTemplate(groupData.calendar_title_template || '');
          setDescTemplate(groupData.calendar_description_template || '');

          // 3. 車両一覧の取得（インデックス未作成エラーを回避するため orderBy を外して取得）
          const vehiclesQuery = query(
            collection(db, 'vehicles'),
            where('group_id', '==', groupSnap.id)
          );
          const vehiclesSnap = await getDocs(vehiclesQuery);
          const vehList = vehiclesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          // JavaScript側で安全にソート
          vehList.sort((a: any, b: any) => {
            const timeA = a.created_at?.seconds || 0;
            const timeB = b.created_at?.seconds || 0;
            return timeA - timeB;
          });

          setVehicles(vehList);
        } else {
          setGroup(null);
          setVehicles([]);
        }
      }
    } catch (err) {
      console.error('ユーザーデータの取得中にエラーが発生しました:', err);
    }
  };

  // サインイン・サインアップ処理
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setErrorMessage('');

    try {
      if (isSignUp) {
        // 新規登録
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Firebase Auth の表示名を設定
        await updateProfile(user, { displayName: name || email.split('@')[0] });

        // profiles コレクションに初期データを書き込み
        const calendarToken = self.crypto.randomUUID(); // クライアント側で UUID を生成
        await setDoc(doc(db, 'profiles', user.uid), {
          email: user.email,
          name: name || email.split('@')[0],
          avatar_url: null,
          group_id: null,
          calendar_token: calendarToken,
          created_at: serverTimestamp()
        });

        await fetchUserData(user.uid);
      } else {
        // ログイン後は予約画面へ
        await signInWithEmailAndPassword(auth, email, password);
        router.replace('/');
      }
    } catch (error: any) {
      console.error('認証エラー:', error);
      let msg = '認証に失敗しました。';
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        msg = 'メールアドレスまたはパスワードが正しくありません。';
      } else if (error.code === 'auth/email-already-in-use') {
        msg = 'このメールアドレスは既に登録されています。';
      } else if (error.code === 'auth/weak-password') {
        msg = 'パスワードは6文字以上で入力してください。';
      } else if (error.code === 'auth/operation-not-allowed') {
        msg = 'Firebase コンソールで「メール/パスワード」認証が有効化されていません。';
      } else if (error.code === 'auth/invalid-api-key' || error.code === 'auth/app-not-authorized') {
        msg = 'Firebase API キーまたは環境変数の設定が正しくありません。';
      } else if (error.message) {
        msg = `認証エラー (${error.code || '不明'}): ${error.message}`;
      }
      setErrorMessage(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  // パスワード再設定メールの送信
  const sendResetEmail = async (targetEmail: string) => {
    auth.languageCode = 'ja';
    const continueUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
    try {
      await sendPasswordResetEmail(auth, targetEmail, continueUrl ? { url: continueUrl } : undefined);
    } catch (error: any) {
      // 戻り先 URL のドメインが Firebase に未登録の場合は、戻り先なしで再送
      if (error?.code === 'auth/unauthorized-continue-uri' || error?.code === 'auth/invalid-continue-uri') {
        await sendPasswordResetEmail(auth, targetEmail);
      } else {
        throw error;
      }
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      await sendResetEmail(email.trim());
      setInfoMessage(`${email.trim()} 宛てにパスワード再設定用のメールを送信しました（登録済みのアドレスの場合のみ届きます）。メール内のリンクから新しいパスワードを設定してください。届かない場合は迷惑メールフォルダもご確認ください。`);
    } catch (error: any) {
      console.error('パスワード再設定メール送信エラー:', error);
      let msg = `送信に失敗しました (${error.code || '不明'})。`;
      if (error.code === 'auth/invalid-email') {
        msg = 'メールアドレスの形式が正しくありません。';
      } else if (error.code === 'auth/user-not-found') {
        msg = 'このメールアドレスのアカウントは登録されていません。';
      } else if (error.code === 'auth/too-many-requests') {
        msg = '短時間に何度も送信されました。しばらく時間を置いてから再度お試しください。';
      }
      setErrorMessage(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  // ログイン中のユーザー向け: パスワード変更用メールの送信
  const [accountMessage, setAccountMessage] = useState('');
  const handleSendResetForCurrentUser = async () => {
    if (!currentUser?.email) return;
    if (!confirm(`${currentUser.email} 宛てにパスワード再設定用のメールを送信しますか？`)) return;
    try {
      await sendResetEmail(currentUser.email);
      setAccountMessage('パスワード再設定用のメールを送信しました。メール内のリンクから新しいパスワードを設定してください。');
    } catch (error: any) {
      console.error('パスワード再設定メール送信エラー:', error);
      setAccountMessage(`メールの送信に失敗しました (${error.code || error.message})。`);
    }
  };

  // ログアウト処理
  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  // グループ処理状態
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState('');

  // グループ新規作成
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName || !currentUser) return;
    setGroupLoading(true);
    setGroupError('');

    try {
      // 招待コードの生成
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // groups コレクションに書き込み
      const newGroupRef = doc(collection(db, 'groups'));
      const groupId = newGroupRef.id;

      await setDoc(newGroupRef, {
        name: groupName,
        invite_code: inviteCode,
        calendar_title_template: '[車共有] {vehicle_name}の予約 - {user_name}',
        calendar_description_template: '予約者: {user_name}\n同乗者: {invited_emails}',
        created_at: serverTimestamp()
      });

      // ユーザーのプロフィールを更新 (ドキュメントが存在しなくても安全に作成・マージ)
      await setDoc(doc(db, 'profiles', currentUser.uid), {
        group_id: groupId,
        email: currentUser.email,
        name: profile?.name || currentUser.displayName || currentUser.email?.split('@')[0] || 'ユーザー',
        updated_at: serverTimestamp()
      }, { merge: true });

      await fetchUserData(currentUser.uid);
      setGroupName('');
    } catch (error: any) {
      console.error('グループ作成エラー:', error);
      let msg = `グループ作成エラー: ${error.message || error}`;
      if (error.code === 'permission-denied') {
        msg = '【Firestoreルールエラー】セキュリティルールで書き込みが拒否されました。Firebaseコンソールの「Firestore」->「ルール」でアクセスを許可してください。';
      } else if (error.code === 'not-found') {
        msg = 'ユーザープロフィールが見つかりません。一度ログアウトして再ログインをお試しください。';
      }
      setGroupError(msg);
    } finally {
      setGroupLoading(false);
    }
  };

  // グループに参加
  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput || !currentUser) return;
    setGroupLoading(true);
    setGroupError('');

    try {
      // 招待コードからグループを検索
      const groupQuery = query(
        collection(db, 'groups'),
        where('invite_code', '==', inviteCodeInput.trim().toUpperCase())
      );
      const querySnap = await getDocs(groupQuery);

      if (querySnap.empty) {
        setGroupError('指定された招待コードのグループが見つかりません。');
        return;
      }

      const targetGroupId = querySnap.docs[0].id;

      // ユーザーのプロフィールを更新
      await setDoc(doc(db, 'profiles', currentUser.uid), {
        group_id: targetGroupId,
        email: currentUser.email,
        name: profile?.name || currentUser.displayName || currentUser.email?.split('@')[0] || 'ユーザー',
        updated_at: serverTimestamp()
      }, { merge: true });

      await fetchUserData(currentUser.uid);
      setInviteCodeInput('');
      router.push('/');
    } catch (error: any) {
      console.error('グループ参加エラー:', error);
      let msg = 'グループへの参加に失敗しました。';
      if (error.code === 'permission-denied') {
        msg = 'Firestore のセキュリティルールでアクセスが拒否されました。';
      } else if (error.message) {
        msg = `グループ参加エラー: ${error.message}`;
      }
      setGroupError(msg);
    } finally {
      setGroupLoading(false);
    }
  };

  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [vehicleError, setVehicleError] = useState('');

  // 車両の追加
  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehicleName || !group) return;
    setVehicleLoading(true);
    setVehicleError('');

    try {
      const newVehicleRef = doc(collection(db, 'vehicles'));
      await setDoc(newVehicleRef, {
        group_id: group.id,
        name: newVehicleName,
        color: newVehicleColor,
        created_at: serverTimestamp()
      });

      setNewVehicleName('');
      if (currentUser) {
        await fetchUserData(currentUser.uid);
      }
    } catch (error: any) {
      console.error('車両追加エラー:', error);
      let msg = `車両の追加に失敗しました: ${error.message || error}`;
      if (error.code === 'permission-denied') {
        msg = '【Firestoreルールエラー】書き込み権限がありません。FirebaseコンソールのRulesを確認してください。';
      }
      setVehicleError(msg);
    } finally {
      setVehicleLoading(false);
    }
  };

  // 車両の削除
  const handleDeleteVehicle = async (vehicleId: string) => {
    if (!confirm('この車両を削除しますか？関連するすべての予約も削除されます。')) return;

    try {
      await deleteDoc(doc(db, 'vehicles', vehicleId));
      await fetchUserData(currentUser.uid);
    } catch (error: any) {
      console.error('車両削除エラー:', error);
      alert('車両の削除に失敗しました。');
    }
  };

  // カレンダーテンプレート設定の保存
  const handleSaveCalendarSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group) return;

    try {
      await updateDoc(doc(db, 'groups', group.id), {
        calendar_title_template: titleTemplate,
        calendar_description_template: descTemplate
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchUserData(currentUser.uid);
    } catch (error: any) {
      console.error('カレンダー設定保存エラー:', error);
      alert('カレンダー設定の保存に失敗しました。');
    }
  };

  // iCal トークンの手動生成・再発行処理
  const handleRegenerateToken = async () => {
    if (!currentUser) return;
    try {
      const newToken = self.crypto.randomUUID ? self.crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
      await setDoc(doc(db, 'profiles', currentUser.uid), {
        calendar_token: newToken
      }, { merge: true });
      await fetchUserData(currentUser.uid);
    } catch (err) {
      console.error('トークン生成エラー:', err);
      alert('トークンの生成に失敗しました。');
    }
  };

  // SSR/クライアントでの origin 安全取得
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  // iCal 購読 URL コピー処理
  const copyCalendarUrl = () => {
    if (!profile?.calendar_token || !origin) return;
    const url = `${origin}/api/calendar/ics?token=${profile.calendar_token}`;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const [inviteCopied, setInviteCopied] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const copyInviteCode = () => {
    if (!group?.invite_code) return;
    navigator.clipboard?.writeText(group.invite_code).catch(() => undefined);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const switchAuthMode = (mode: 'login' | 'signup' | 'reset') => {
    setIsSignUp(mode === 'signup');
    setIsResetMode(mode === 'reset');
    setErrorMessage('');
    setInfoMessage('');
  };

  const authMode = isResetMode ? 'reset' : isSignUp ? 'signup' : 'login';

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <SettingsSkeleton key="skeleton" />
      ) : !currentUser ? (
        /* 認証前画面 */
        <motion.main
          key="auth"
          data-testid="auth-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="min-h-dvh w-full max-w-md mx-auto flex flex-col justify-center px-5 py-10"
        >
          <div className="mb-8 flex flex-col items-center gap-4">
            <motion.div
              initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14 }}
              className="glass flex h-20 w-20 items-center justify-center rounded-[26px]"
            >
              <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
                <Car className="h-10 w-10 text-accent" strokeWidth={2.2} />
              </motion.div>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-[26px] font-extrabold tracking-tight text-ink"
            >
              Family Car Share
            </motion.h1>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.15 }}
            className="glass rounded-[32px] p-5"
          >
            {authMode !== 'reset' && (
              <div className="mb-5 flex rounded-full bg-slate-900/5 p-1">
                {(['login', 'signup'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-testid={`auth-tab-${m}`}
                    onClick={() => switchAuthMode(m)}
                    className="relative flex-1 rounded-full py-2.5 text-[14px] font-bold"
                  >
                    {authMode === m && (
                      <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-full bg-white shadow-[0_4px_14px_-6px_rgba(15,23,42,0.3)]" />
                    )}
                    <span className={`relative ${authMode === m ? 'text-ink' : 'text-slate-500'}`}>{m === 'login' ? 'ログイン' : '新規登録'}</span>
                  </button>
                ))}
              </div>
            )}

            <AnimatePresence mode="wait" initial={false}>
              {authMode === 'reset' ? (
                <motion.form
                  key="reset"
                  onSubmit={handlePasswordReset}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  className="space-y-4"
                >
                  <h2 className="text-[18px] font-extrabold text-ink">パスワードの再設定</h2>
                  <div>
                    <FieldLabel htmlFor="reset-email">メールアドレス</FieldLabel>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        id="reset-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="glass-input h-13 pl-11 pr-4"
                      />
                    </div>
                  </div>
                  <Notice kind="error">{errorMessage}</Notice>
                  <Notice kind="success">{infoMessage}</Notice>
                  <Button type="submit" className="w-full" loading={authLoading} icon={<KeyRound className="h-4.5 w-4.5" />}>
                    再設定メールを送信
                  </Button>
                  <button type="button" onClick={() => switchAuthMode('login')} className="block w-full py-2 text-[14px] font-bold text-accent">
                    ログインに戻る
                  </button>
                </motion.form>
              ) : (
                <motion.form
                  key="auth"
                  onSubmit={handleAuth}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  className="space-y-4"
                >
                  <AnimatePresence initial={false}>
                    {isSignUp && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <FieldLabel htmlFor="auth-name">お名前</FieldLabel>
                        <div className="relative">
                          <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                          <input
                            id="auth-name"
                            data-testid="auth-name"
                            type="text"
                            required
                            autoComplete="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="glass-input h-13 pl-11 pr-4"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <FieldLabel htmlFor="auth-email">メールアドレス</FieldLabel>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        id="auth-email"
                        data-testid="auth-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="glass-input h-13 pl-11 pr-4"
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel htmlFor="auth-password">パスワード</FieldLabel>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        id="auth-password"
                        data-testid="auth-password"
                        type="password"
                        required
                        autoComplete={isSignUp ? 'new-password' : 'current-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="glass-input h-13 pl-11 pr-4"
                      />
                    </div>
                  </div>

                  <Notice kind="error" testId="auth-error">{errorMessage}</Notice>

                  <Button type="submit" className="w-full" loading={authLoading} data-testid="auth-submit">
                    {isSignUp ? '登録する' : 'ログイン'}
                  </Button>

                  {!isSignUp && (
                    <button type="button" onClick={() => switchAuthMode('reset')} className="block w-full py-1 text-[13px] font-bold text-slate-500">
                      パスワードをお忘れの方
                    </button>
                  )}
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.main>
      ) : (
        /* 認証後: 設定画面 */
        <motion.main
          key="settings"
          data-testid="settings-screen"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          className="min-h-dvh w-full max-w-md mx-auto px-4 pt-[max(12px,env(safe-area-inset-top))] pb-16"
        >
          <header className="mb-4 flex items-center gap-3 py-2">
            {group && (
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => router.push('/')}
                className="glass flex h-11 w-11 items-center justify-center rounded-full text-ink"
                aria-label="予約画面へ戻る"
                data-testid="back-home"
              >
                <ChevronLeft className="h-5 w-5" />
              </motion.button>
            )}
            <h1 className="text-[24px] font-extrabold tracking-tight text-ink">設定</h1>
          </header>

          <motion.div
            className="space-y-4"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
          >
            {/* ログインユーザー情報 */}
            <Section>
              <div className="flex items-center gap-3">
                <Avatar name={profile?.name || 'U'} seed={currentUser.uid} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-extrabold text-ink">{profile?.name || 'ユーザー'}</div>
                  <div className="truncate text-[13px] font-semibold text-slate-500">{profile?.email}</div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={handleLogout}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/5 text-slate-500 hover:text-rose-500"
                  aria-label="ログアウト"
                  data-testid="logout"
                >
                  <LogOut className="h-5 w-5" />
                </motion.button>
              </div>
            </Section>

            {!group ? (
              <>
                <Notice kind="error">{groupError}</Notice>

                <Section title="グループを作成" icon={<Plus className="h-4.5 w-4.5" />}>
                  <form onSubmit={handleCreateGroup} className="flex gap-2">
                    <input
                      type="text"
                      required
                      data-testid="group-name-input"
                      placeholder="例：田中家"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="glass-input h-12 px-4"
                    />
                    <Button type="submit" className="h-12 flex-shrink-0" loading={groupLoading} data-testid="create-group">
                      作成
                    </Button>
                  </form>
                </Section>

                <Section title="招待コードで参加" icon={<Users className="h-4.5 w-4.5" />}>
                  <form onSubmit={handleJoinGroup} className="flex gap-2">
                    <input
                      type="text"
                      required
                      data-testid="invite-code-input"
                      placeholder="ABCD12"
                      value={inviteCodeInput}
                      onChange={(e) => setInviteCodeInput(e.target.value)}
                      className="glass-input h-12 px-4 text-center font-extrabold uppercase tracking-[0.3em]"
                    />
                    <Button type="submit" variant="dark" className="h-12 flex-shrink-0" loading={groupLoading} data-testid="join-group">
                      参加
                    </Button>
                  </form>
                </Section>
              </>
            ) : (
              <>
                {/* 所属グループ */}
                <Section title={group.name} icon={<Users className="h-4.5 w-4.5" />}>
                  <div className="flex items-center justify-between rounded-2xl bg-white/60 px-4 py-3">
                    <div>
                      <div className="text-[11px] font-bold text-slate-400">招待コード</div>
                      <div className="text-[22px] font-extrabold tracking-[0.25em] text-ink" data-testid="invite-code">
                        {group.invite_code}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={inviteCopied ? 'dark' : 'secondary'}
                      onClick={copyInviteCode}
                      icon={inviteCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    >
                      {inviteCopied ? 'コピー済み' : 'コピー'}
                    </Button>
                  </div>
                </Section>

                {/* 車両 */}
                <Section title="車両" icon={<Car className="h-4.5 w-4.5" />}>
                  <motion.div layout className="space-y-2">
                    <AnimatePresence initial={false}>
                      {vehicles.map((v) => {
                        const c = vehicleColor(v.color);
                        return (
                          <motion.div
                            key={v.id}
                            layout
                            data-testid="vehicle-row"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0, x: -40 }}
                            className="overflow-hidden"
                          >
                            <div className="flex items-center justify-between rounded-2xl bg-white/60 px-4 py-3">
                              <span className="flex items-center gap-2.5 text-[15px] font-bold text-ink">
                                <span className={`h-3 w-3 rounded-full ${c.dot}`} />
                                {v.name}
                              </span>
                              <motion.button
                                whileTap={{ scale: 0.85 }}
                                onClick={() => handleDeleteVehicle(v.id)}
                                aria-label={`${v.name} を削除`}
                                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                              >
                                <Trash2 className="h-4.5 w-4.5" />
                              </motion.button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </motion.div>

                  <Notice kind="error">{vehicleError}</Notice>

                  <form onSubmit={handleAddVehicle} className="space-y-3 pt-1">
                    <input
                      type="text"
                      required
                      data-testid="vehicle-name-input"
                      placeholder="車両名（例：プリウス）"
                      value={newVehicleName}
                      onChange={(e) => setNewVehicleName(e.target.value)}
                      className="glass-input h-12 px-4"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-2" role="radiogroup" aria-label="カラー">
                        {colors.map((c) => (
                          <motion.button
                            key={c.value}
                            type="button"
                            role="radio"
                            aria-checked={newVehicleColor === c.value}
                            aria-label={c.label}
                            whileTap={{ scale: 0.85 }}
                            animate={{ scale: newVehicleColor === c.value ? 1.15 : 1 }}
                            onClick={() => setNewVehicleColor(c.value)}
                            className={`h-8 w-8 rounded-full ${vehicleColor(c.value).dot} ${
                              newVehicleColor === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-300' : ''
                            }`}
                          />
                        ))}
                      </div>
                      <Button type="submit" size="sm" loading={vehicleLoading} icon={<Plus className="h-4 w-4" />} data-testid="add-vehicle">
                        追加
                      </Button>
                    </div>
                  </form>
                </Section>

                {/* LINE 公式アカウント連携 */}
                <LineSettings />

                {/* iCal 購読用連携 */}
                <Section title="カレンダー同期" icon={<Calendar className="h-4.5 w-4.5" />}>
                  {profile?.calendar_token ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        aria-label="カレンダー購読 URL"
                        value={origin ? `${origin}/api/calendar/ics?token=${profile.calendar_token}` : `.../api/calendar/ics?token=${profile.calendar_token}`}
                        className="glass-input h-11 truncate px-3 font-mono text-[12px]! text-slate-500"
                      />
                      <Button
                        size="sm"
                        variant={isCopied ? 'dark' : 'secondary'}
                        className="h-11 flex-shrink-0"
                        onClick={copyCalendarUrl}
                        aria-label="URLをコピー"
                        icon={isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      />
                    </div>
                  ) : (
                    <Button className="w-full" onClick={handleRegenerateToken}>
                      同期 URL を発行
                    </Button>
                  )}
                  <p className="text-[12px] font-semibold text-slate-400">Google / Apple カレンダーの「URL で購読」に貼り付け</p>
                </Section>

                {/* カレンダーテンプレート設定 */}
                <Section>
                  <button
                    type="button"
                    onClick={() => setShowTemplates((v) => !v)}
                    className="flex w-full items-center justify-between text-[15px] font-extrabold text-ink"
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="h-4.5 w-4.5 text-accent" />
                      カレンダーの表示形式
                    </span>
                    <motion.span animate={{ rotate: showTemplates ? 180 : 0 }}>
                      <ChevronDown className="h-5 w-5 text-slate-400" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {showTemplates && (
                      <motion.form
                        onSubmit={handleSaveCalendarSettings}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3 overflow-hidden pt-3"
                      >
                        <div>
                          <FieldLabel htmlFor="tpl-title">タイトル</FieldLabel>
                          <input
                            id="tpl-title"
                            type="text"
                            required
                            value={titleTemplate}
                            onChange={(e) => setTitleTemplate(e.target.value)}
                            className="glass-input h-12 px-4"
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor="tpl-desc">詳細</FieldLabel>
                          <textarea
                            id="tpl-desc"
                            required
                            rows={3}
                            value={descTemplate}
                            onChange={(e) => setDescTemplate(e.target.value)}
                            className="glass-input px-4 py-3"
                          />
                        </div>
                        <p className="text-[12px] font-semibold text-slate-400">
                          {'{vehicle_name} {user_name} {invited_emails} {destination} {purpose}'}
                        </p>
                        <Notice kind="success">{saveSuccess ? '保存しました' : null}</Notice>
                        <Button type="submit" variant="dark" className="w-full">
                          保存
                        </Button>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </Section>
              </>
            )}

            {/* アカウント: パスワード変更 */}
            <Section>
              <Button variant="secondary" className="w-full" onClick={handleSendResetForCurrentUser} icon={<KeyRound className="h-4.5 w-4.5" />}>
                パスワードを再設定
              </Button>
              <Notice kind="success">{accountMessage}</Notice>
            </Section>
          </motion.div>
        </motion.main>
      )}
    </AnimatePresence>
  );
}

function Section({ title, icon, children }: { title?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.section
      variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="glass space-y-3 rounded-[26px] p-5"
    >
      {title && (
        <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
          <span className="text-accent">{icon}</span>
          {title}
        </h2>
      )}
      {children}
    </motion.section>
  );
}
