'use client';

import { auth } from '@/lib/firebase';

export interface ApiResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  [key: string]: any;
}

/**
 * ログインユーザーの ID トークンを付けて API を呼び出します。
 * 空レスポンスや JSON 以外の応答も分かりやすいエラーメッセージに変換します。
 */
export async function apiFetch<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<ApiResult<T>> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    return { success: false, error: 'セッションの期限が切れました。ログインし直してください。' };
  }

  try {
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const rawText = await response.text();
    if (!rawText) {
      return { success: false, error: `サーバーから空のレスポンスが返されました (HTTP ${response.status})。` };
    }
    try {
      const json = JSON.parse(rawText);
      if (!response.ok && json.success === undefined) {
        return { ...json, success: false, error: json.error || `HTTP ${response.status}` };
      }
      return json;
    } catch {
      return { success: false, error: `サーバーからの応答が無効です (${response.status}): ${rawText.slice(0, 200)}` };
    }
  } catch (err: any) {
    return { success: false, error: `通信エラー: ${err?.message || '時間を置いて再度お試しください。'}` };
  }
}
