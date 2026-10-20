/**
 * LINE で配信するリリースノート
 * 本番デプロイ完了後に GitHub Actions (.github/workflows/line-release-notes.yml) から
 * /api/line/release-notes が呼ばれ、LINE 連携済みのユーザーへ一度だけ配信されます。
 * 新しいリリースを配信するときは version を変更してください（同じ version は二重配信されません）。
 */
export interface ReleaseNote {
  version: string;
  title: string;
  items: string[];
}

export const LATEST_RELEASE: ReleaseNote = {
  version: '2026.10.20-ui',
  title: 'デザインを一新しました',
  items: [
    '開いてすぐ「次の予約は誰が何時か」「自分の次の予約」が分かるホーム画面に',
    'いま使用中かどうか・開始までの残り時間をリアルタイム表示',
    '日付は横スクロールで選択、タイムラインは左右スワイプで前後の日へ',
    '予約画面に「1時間」「2時間」などのワンタップ時間指定を追加',
    '白基調のガラス風デザインとアニメーション、読み込み中のスケルトン表示',
  ],
};

export const formatReleaseNote = (note: ReleaseNote, appUrl: string): string =>
  [`🚗 ${note.title}`, '', ...note.items.map((item) => `・${item}`), ...(appUrl ? ['', appUrl] : [])].join('\n');
