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
  updateProfile
} from 'firebase/auth';
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
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { 
  Car, 
  User as UserIcon, 
  Lock, 
  Users, 
  Settings, 
  Calendar, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  LogOut, 
  ChevronRight,
  Info
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();

  // 認証関連ステート
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
      const profileSnap = await getDoc(profileRef);

      if (profileSnap.exists()) {
        const profData = profileSnap.data();
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

            // 3. 車両一覧の取得
            const vehiclesQuery = query(
              collection(db, 'vehicles'),
              where('group_id', '==', groupSnap.id),
              orderBy('created_at', 'asc')
            );
            const vehiclesSnap = await getDocs(vehiclesQuery);
            const vehList = vehiclesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setVehicles(vehList);
          } else {
            setGroup(null);
            setVehicles([]);
          }
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
        // ログイン
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error('認証エラー:', error);
      let msg = '認証に失敗しました。';
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        msg = 'メールアドレスまたはパスワードが正しくありません。';
      } else if (error.code === 'auth/email-already-in-use') {
        msg = 'このメールアドレスは既に登録されています。';
      } else if (error.code === 'auth/weak-password') {
        msg = 'パスワードは6文字以上で入力してください。';
      }
      setErrorMessage(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  // ログアウト処理
  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  // グループ新規作成
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName || !currentUser) return;

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

      // ユーザーのプロフィールを更新
      await updateDoc(doc(db, 'profiles', currentUser.uid), {
        group_id: groupId
      });

      await fetchUserData(currentUser.uid);
      setGroupName('');
    } catch (error: any) {
      console.error('グループ作成エラー:', error);
      alert('グループの作成に失敗しました。');
    }
  };

  // グループに参加
  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput || !currentUser) return;

    try {
      // 招待コードからグループを検索
      const groupQuery = query(
        collection(db, 'groups'),
        where('invite_code', '==', inviteCodeInput.trim().toUpperCase())
      );
      const querySnap = await getDocs(groupQuery);

      if (querySnap.empty) {
        alert('指定された招待コードのグループが見つかりません。');
        return;
      }

      const targetGroupId = querySnap.docs[0].id;

      // ユーザーのプロフィールを更新
      await updateDoc(doc(db, 'profiles', currentUser.uid), {
        group_id: targetGroupId
      });

      await fetchUserData(currentUser.uid);
      setInviteCodeInput('');
    } catch (error: any) {
      console.error('グループ参加エラー:', error);
      alert('グループへの参加に失敗しました。');
    }
  };

  // 車両の追加
  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehicleName || !group) return;

    try {
      const newVehicleRef = doc(collection(db, 'vehicles'));
      await setDoc(newVehicleRef, {
        group_id: group.id,
        name: newVehicleName,
        color: newVehicleColor,
        created_at: serverTimestamp()
      });

      setNewVehicleName('');
      await fetchUserData(currentUser.uid);
    } catch (error: any) {
      console.error('車両追加エラー:', error);
      alert('車両の追加に失敗しました。');
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

  // iCal 購読 URL コピー処理
  const copyCalendarUrl = () => {
    if (!profile?.calendar_token) return;
    const url = `${window.location.origin}/api/calendar/ics?token=${profile.calendar_token}`;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 flex flex-col justify-between">
      <main className="w-full max-w-md mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden flex-grow flex flex-col">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 p-6 text-white text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Car className="h-8 w-8 animate-pulse" />
            <h1 className="text-2xl font-bold tracking-tight">Family Car Share</h1>
          </div>
          <p className="text-indigo-100 text-xs">家族間の車両共有と予約の競合をなくすアプリ</p>
        </div>

        {/* 認証前画面 */}
        {!currentUser ? (
          <div className="p-6 flex-grow flex flex-col justify-center">
            <h2 className="text-xl font-bold text-slate-800 text-center mb-6">
              {isSignUp ? 'アカウントを作成' : 'ログイン'}
            </h2>

            <form onSubmit={handleAuth} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">お名前</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="例：山田 太郎"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">メールアドレス</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="example@family.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">パスワード</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm transition-all"
                  />
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all flex items-center justify-center disabled:opacity-50"
              >
                {authLoading ? '処理中...' : isSignUp ? '会員登録する' : 'ログインする'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
              >
                {isSignUp ? '既にアカウントをお持ちの方はこちら (ログイン)' : '新しいアカウントを作成する (新規登録)'}
              </button>
            </div>
          </div>
        ) : (
          /* 認証後画面 */
          <div className="p-6 space-y-6 flex-grow overflow-y-auto max-h-[80vh]">
            {/* ログインユーザー情報 */}
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                  {profile?.name?.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{profile?.name || 'ユーザー'}</h3>
                  <p className="text-xs text-slate-400">{profile?.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                title="ログアウト"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>

            {/* グループ未所属時 */}
            {!group ? (
              <div className="space-y-6">
                <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs flex gap-2">
                  <Info className="h-5 w-5 flex-shrink-0" />
                  <div>
                    まだ車共有グループに所属していません。
                    新規に家族のグループを作成するか、招待コードを入力して参加してください。
                  </div>
                </div>

                {/* 新規グループ作成 */}
                <form onSubmit={handleCreateGroup} className="space-y-3 bg-white p-4 border border-slate-100 rounded-2xl">
                  <div className="flex items-center gap-2 mb-1">
                    <Plus className="h-4 w-4 text-indigo-600" />
                    <h4 className="text-xs font-bold text-slate-700">新しくグループを作成する</h4>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="例：田中家"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs transition-all"
                  >
                    グループを作成する
                  </button>
                </form>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-200"></div>
                  <span className="flex-shrink mx-4 text-slate-400 text-xs font-medium">または</span>
                  <div className="flex-grow border-t border-slate-200"></div>
                </div>

                {/* 既存グループに参加 */}
                <form onSubmit={handleJoinGroup} className="space-y-3 bg-white p-4 border border-slate-100 rounded-2xl">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-indigo-600" />
                    <h4 className="text-xs font-bold text-slate-700">招待コードでグループに参加する</h4>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="例：ABCD12"
                    value={inviteCodeInput}
                    onChange={(e) => setInviteCodeInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase tracking-widest text-center font-semibold"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold text-xs transition-all"
                  >
                    グループに参加する
                  </button>
                </form>
              </div>
            ) : (
              /* グループ所属時 */
              <div className="space-y-6">
                {/* 所属グループ情報 */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100/50 p-5 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider">所属グループ</span>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">{group.name}</h3>
                  <div className="flex items-center justify-between bg-white p-3 border border-indigo-100 rounded-xl">
                    <div>
                      <span className="text-[9px] text-slate-400 block">招待コード（共有用）</span>
                      <span className="text-base font-bold text-slate-800 tracking-widest">{group.invite_code}</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(group.invite_code);
                        alert('招待コードをコピーしました。他の家族に教えて共有しましょう。');
                      }}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      コピー
                    </button>
                  </div>
                </div>

                {/* 共有車両の管理 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Car className="h-4 w-4 text-indigo-600" />
                      車両管理
                    </h4>
                    <span className="text-[10px] text-slate-400 font-medium">登録台数: {vehicles.length}台</span>
                  </div>

                  {/* 車両一覧 */}
                  {vehicles.length === 0 ? (
                    <p className="text-xs text-slate-400 bg-slate-50 p-4 rounded-2xl text-center">
                      まだ登録されている車両がありません。以下から追加してください。
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {vehicles.map((v) => {
                        const matchedColor = colors.find(c => c.value === v.color) || colors[0];
                        return (
                          <div
                            key={v.id}
                            className="flex items-center justify-between p-3 border border-slate-100 rounded-xl shadow-sm bg-white"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${matchedColor.bg}`}>
                                {v.name}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteVehicle(v.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-50 transition-all"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 車両追加フォーム */}
                  <form onSubmit={handleAddVehicle} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">車両名</label>
                        <input
                          type="text"
                          required
                          placeholder="プリウス, シエンタ 等"
                          value={newVehicleName}
                          onChange={(e) => setNewVehicleName(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">テーマカラー</label>
                        <select
                          value={newVehicleColor}
                          onChange={(e) => setNewVehicleColor(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                        >
                          {colors.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1 shadow-sm"
                    >
                      <Plus className="h-4 w-4" />
                      車両を追加する
                    </button>
                  </form>
                </div>

                {/* 管理画面：カレンダーテンプレート設定 */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Settings className="h-4 w-4 text-indigo-600" />
                    カレンダー連携テンプレート設定
                  </h4>

                  <form onSubmit={handleSaveCalendarSettings} className="p-4 border border-slate-100 rounded-2xl bg-white space-y-4 shadow-sm">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center justify-between">
                        <span>イベントタイトル テンプレート</span>
                        <span className="text-slate-400 font-normal">使用可能: {"{vehicle_name}"}, {"{user_name}"}</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={titleTemplate}
                        onChange={(e) => setTitleTemplate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        placeholder="例: [車共有] {vehicle_name}の予約 - {user_name}"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center justify-between">
                        <span>イベント詳細 テンプレート</span>
                        <span className="text-slate-400 font-normal">使用可能: {"{vehicle_name}"}, {"{user_name}"}, {"{invited_emails}"}</span>
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={descTemplate}
                        onChange={(e) => setDescTemplate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        placeholder="例: 予約者: {user_name}&#10;同乗者: {invited_emails}"
                      />
                    </div>

                    {saveSuccess && (
                      <div className="p-2 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-lg text-[10px] text-center font-semibold">
                        テンプレート設定を保存しました。
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold text-xs transition-all"
                    >
                      テンプレートを保存する
                    </button>
                  </form>
                </div>

                {/* iCal購読用連携 */}
                <div className="space-y-3 bg-indigo-50/30 p-4 border border-indigo-100/30 rounded-2xl">
                  <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1">
                    <Calendar className="h-4 w-4 text-indigo-600" />
                    カレンダー同期 (Apple / Google)
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    以下の URL を Google カレンダーや Apple カレンダーの「URLで購読」に設定することで、予約スケジュールがカレンダーアプリに自動同期されます。
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={profile?.calendar_token ? `${window.location.origin}/api/calendar/ics?token=${profile.calendar_token}` : 'トークン生成エラー'}
                      className="flex-grow bg-white border border-slate-200 text-[10px] px-2.5 py-1.5 rounded-lg text-slate-600 font-mono focus:outline-none truncate"
                    />
                    <button
                      onClick={copyCalendarUrl}
                      className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 hover:text-indigo-600 transition-all flex-shrink-0 shadow-sm"
                      title="URLをコピー"
                    >
                      {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* フッター */}
      <footer className="w-full max-w-md mx-auto mt-4 text-center">
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-full shadow-lg transition-all"
        >
          予約カレンダーへ戻る
          <ChevronRight className="h-4 w-4" />
        </button>
      </footer>
    </div>
  );
}
