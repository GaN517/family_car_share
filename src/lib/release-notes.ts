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
  version: '2026.10.21-overnight',
  title: '予約がもっと簡単になりました',
  items: [
    '開始時刻が「いまの次の00分」に自動で入ります',
    '夜から翌朝までなど、日をまたぐ予約ができるように（終了を開始より前にすると自動で翌日に）',
    '「12時間」「24時間」のワンタップ指定を追加',
    'アプリのアイコンを設定しました',
  ],
};

export const formatReleaseNote = (note: ReleaseNote, appUrl: string): string =>
  [`🚗 ${note.title}`, '', ...note.items.map((item) => `・${item}`), ...(appUrl ? ['', appUrl] : [])].join('\n');
