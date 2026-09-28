/**
 * 日本標準時 (JST, UTC+9) 固定の日時ユーティリティ。
 * サーバー (Vercel は UTC) とブラウザのどちらで実行しても同じ結果になるよう、
 * 実行環境のローカルタイムゾーンには依存しません。JST には夏時間がないため、
 * 固定オフセットの計算で正確に扱えます。
 */

export const JST_TIMEZONE = 'Asia/Tokyo';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

type DateInput = Date | string | number;

/** 任意の日時を「JST の壁時計の値を UTC フィールドに持つ Date」に変換します（内部用） */
const shiftToJst = (date: DateInput) => new Date(new Date(date).getTime() + JST_OFFSET_MS);

const pad = (n: number) => String(n).padStart(2, '0');

/** JST での日付を YYYY-MM-DD 形式で返します */
export const toJstYmd = (date: DateInput): string => {
  const d = shiftToJst(date);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** JST での時刻を HH:mm 形式で返します */
export const toJstHm = (date: DateInput): string => {
  const d = shiftToJst(date);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/** JST の日付 (YYYY-MM-DD) と時刻 (HH:mm) から Date を生成します */
export const jstToDate = (ymd: string, hm = '00:00'): Date => new Date(`${ymd}T${hm}:00+09:00`);

/** JST での今日の日付 (YYYY-MM-DD) */
export const todayJst = (): string => toJstYmd(new Date());

/** YYYY-MM-DD の日付に日数を加算します */
export const addDaysYmd = (ymd: string, days: number): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

/** YYYY-MM-DD の曜日 (0=日 〜 6=土) */
export const weekdayOfYmd = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** YYYY-MM-DD の日の部分 */
export const dayOfYmd = (ymd: string): number => Number(ymd.split('-')[2]);

/** JST のその日の 00:00 〜 翌日 00:00 の範囲 */
export const jstDayRange = (ymd: string): { start: Date; end: Date } => ({
  start: jstToDate(ymd, '00:00'),
  end: jstToDate(addDaysYmd(ymd, 1), '00:00'),
});

/** 曜日の日本語表記 */
export const weekdayLabel = (weekday: number): string => WEEKDAYS_JA[weekday];

/** 日付を日本語表記（例: "8月13日(水)"）にフォーマットします（JST） */
export const formatJstDate = (date: DateInput): string => {
  const ymd = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toJstYmd(date);
  const [, m, d] = ymd.split('-').map(Number);
  return `${m}月${d}日(${WEEKDAYS_JA[weekdayOfYmd(ymd)]})`;
};

/** 予約の時間帯を "9月28日(月) 10:00〜12:00" の形式で表記します（日付をまたぐ場合は終了日も表示） */
export const formatJstRange = (start: DateInput, end: DateInput): string => {
  const sameDay = toJstYmd(start) === toJstYmd(end);
  return sameDay
    ? `${formatJstDate(start)} ${toJstHm(start)}〜${toJstHm(end)}`
    : `${formatJstDate(start)} ${toJstHm(start)}〜${formatJstDate(end)} ${toJstHm(end)}`;
};
