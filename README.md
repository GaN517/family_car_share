# Family Car Share

家族間で車を共有・予約するためのモバイルファーストな Web アプリです（Next.js + Firebase）。

## 主な機能

- 車両ごとの予約タイムライン（日付はすべて日本標準時で扱います）
- 予約の作成・編集・削除、重複チェック
- **繰り返し予約**（毎日 / 毎週・曜日指定 / 隔週 / 毎月、最長1年・100回まで）
  - 既存予約と重複する日程があれば一覧表示し、重複分を除いて予約することも可能
  - 繰り返し予約の削除は「この回のみ / この回以降 / すべて」から選択
- **予約枠の譲渡（交渉）**
  - 他の人の予約に「譲ってほしい」と依頼、または自分の予約を特定のメンバーへ「譲る」と申し出
  - メッセージ付きで依頼し、受け取った側は承諾・お断り（返信メッセージ付き）で回答
  - 承諾すると予約の名義が切り替わり、同じ予約への他の依頼は自動で取り消し
- **LINE 公式アカウント連携**
  - 新規予約の通知、予約リマインド（前日夜 + 開始1〜2時間前）、譲渡依頼の通知
  - LINE のボタンから譲渡の承諾・お断りの手続きが可能、譲渡完了も通知
  - トークで「予約」→今後の予約一覧、「譲渡」→回答待ちの依頼一覧
- **パスワードのリセット**（ログイン画面の「パスワードをお忘れの方」/ 設定画面から再設定メール送信）
- iCal (.ics) カレンダー購読・同乗者への招待メール（いずれも Asia/Tokyo で出力）

## 環境変数

| 変数 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase クライアント設定（API_KEY, AUTH_DOMAIN, PROJECT_ID, STORAGE_BUCKET, MESSAGING_SENDER_ID, APP_ID） |
| `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Firebase Admin（サービスアカウント） |
| `RESEND_API_KEY` / `EMAIL_FROM` | 招待メール送信（任意） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API のチャネルアクセストークン（長期） |
| `LINE_CHANNEL_SECRET` | LINE Webhook の署名検証用チャネルシークレット |
| `LINE_FRIEND_URL` | 公式アカウントの友だち追加 URL（例: `https://lin.ee/xxxx`、任意） |
| `APP_URL` | アプリの公開 URL（LINE のボタンからアプリを開くため。未設定時は Vercel の本番 URL を使用） |
| `CRON_SECRET` | リマインド API の認証用シークレット（任意の長いランダム文字列） |
| `REMINDER_LEAD_MINUTES` | 開始前リマインドの対象時間（分、既定 120） |

## LINE 公式アカウントの設定

1. [LINE Developers](https://developers.line.biz/) で Messaging API チャネルを作成し、チャネルシークレットとチャネルアクセストークン（長期）を発行して環境変数に設定します。
2. Webhook URL に `https://<アプリのドメイン>/api/line/webhook` を設定し、「Webhook の利用」をオンにします。
3. LINE Official Account Manager の応答設定で「応答メッセージ」をオフにします（Webhook の返信と重複しないように）。
4. 各ユーザーはアプリの「設定・管理」→「LINE 連携」で連携コードを発行し、公式アカウントのトークでその6桁のコードを送信すると連携されます。

> 無料のコミュニケーションプランはプッシュメッセージ数に月間上限があります。通知が多い場合は各ユーザーが設定画面で通知の種類をオフにできます。

## 予約リマインド（定期実行）

- **前日リマインド**: `vercel.json` の Cron で毎日 20:00 (JST) に `/api/cron/reminders?mode=daily` を実行します。Vercel の環境変数に `CRON_SECRET` を設定してください（Vercel Cron が自動で認証ヘッダーを付与します）。
- **開始前リマインド**: Vercel Hobby プランの Cron は1日1回までのため、`.github/workflows/line-reminders.yml` が1時間ごとに `/api/cron/reminders?mode=upcoming` を呼び出します。GitHub リポジトリの Actions シークレットに `APP_URL` と `CRON_SECRET` を登録すると有効になります（未登録なら何もしません）。

## パスワードリセット

Firebase Authentication の `sendPasswordResetEmail` を使用します。メールの文面は Firebase コンソールの「Authentication → テンプレート → パスワードの再設定」で日本語に変更できます。再設定後にアプリへ戻るリンクを表示するには、アプリのドメインを「Authentication → 設定 → 承認済みドメイン」に追加してください。

## Firestore のデータ

| コレクション | 内容 |
| --- | --- |
| `reservations` | 予約。繰り返し予約は各回を個別ドキュメントとして保存し `series_id` で紐付け |
| `transfer_requests` | 譲渡依頼（`type`: request / offer、`status`: pending / accepted / declined / cancelled） |
| `line_link_codes` | LINE 連携用の一時コード（15分で失効） |
| `profiles` | `line_user_id`、`line_notifications`（通知設定）を追加 |

`transfer_requests` と `line_link_codes` はサーバー（Admin SDK）経由でのみ読み書きするため、クライアント向けのセキュリティルールでは許可不要です。

## 開発

```bash
npm install
npm run dev
```
