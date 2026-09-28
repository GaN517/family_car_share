import {
  addDaysYmd,
  dayOfYmd,
  jstToDate,
  toJstHm,
  toJstYmd,
  weekdayLabel,
  weekdayOfYmd,
  formatJstDate,
} from './datetime';

/**
 * 繰り返し予約のルール（サーバー・クライアント共通）
 * 日付の計算はすべて日本標準時で行います。
 */
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** 間隔（毎週=1, 隔週=2 など） */
  interval?: number;
  /** 毎週の場合の曜日 (0=日〜6=土)。未指定なら初回の曜日 */
  weekdays?: number[];
  /** 終了日 (YYYY-MM-DD, JST, この日を含む) */
  until: string;
}

export const MAX_OCCURRENCES = 100;
export const MAX_RECURRENCE_DAYS = 366;

export interface Occurrence {
  start: Date;
  end: Date;
}

/** 繰り返しルールの妥当性チェック。問題があればエラーメッセージを返します */
export function validateRecurrence(rule: RecurrenceRule, firstStart: Date): string | null {
  if (!['daily', 'weekly', 'monthly'].includes(rule.frequency)) return '繰り返しの種類が不正です。';
  const interval = rule.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 12) return '繰り返しの間隔が不正です。';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rule.until || '')) return '繰り返しの終了日を指定してください。';
  const firstYmd = toJstYmd(firstStart);
  if (rule.until < firstYmd) return '繰り返しの終了日は開始日以降に設定してください。';
  if (rule.until > addDaysYmd(firstYmd, MAX_RECURRENCE_DAYS)) return '繰り返し予約は最長1年先までです。';
  if (rule.weekdays && !rule.weekdays.every((w) => Number.isInteger(w) && w >= 0 && w <= 6)) {
    return '曜日の指定が不正です。';
  }
  return null;
}

/**
 * 繰り返しルールから各回の予約時間帯を生成します。
 * 初回の開始・終了時刻（JST の時刻）と所要時間を各回に適用します。
 */
export function generateOccurrences(firstStart: Date, firstEnd: Date, rule: RecurrenceRule): Occurrence[] {
  const duration = firstEnd.getTime() - firstStart.getTime();
  const firstYmd = toJstYmd(firstStart);
  const startHm = toJstHm(firstStart);
  const interval = rule.interval ?? 1;
  const weekdays = rule.weekdays?.length ? rule.weekdays : [weekdayOfYmd(firstYmd)];
  // 週の区切り（日曜始まり）を基準に隔週を判定
  const firstWeekStart = addDaysYmd(firstYmd, -weekdayOfYmd(firstYmd));

  const dates: string[] = [];
  let ymd = firstYmd;
  let dayIndex = 0;
  while (ymd <= rule.until && dates.length < MAX_OCCURRENCES) {
    let include = false;
    if (rule.frequency === 'daily') {
      include = dayIndex % interval === 0;
    } else if (rule.frequency === 'weekly') {
      const weekIndex = Math.floor(daysBetween(firstWeekStart, ymd) / 7);
      include = weekIndex % interval === 0 && weekdays.includes(weekdayOfYmd(ymd));
    } else {
      // 毎月: 同じ日付（その日が存在しない月はスキップ）
      const monthIndex = monthsBetween(firstYmd, ymd);
      include = dayOfYmd(ymd) === dayOfYmd(firstYmd) && monthIndex % interval === 0;
    }
    if (include) dates.push(ymd);
    ymd = addDaysYmd(ymd, 1);
    dayIndex++;
  }

  return dates.map((d) => {
    const start = jstToDate(d, startHm);
    return { start, end: new Date(start.getTime() + duration) };
  });
}

function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((jstToDate(toYmd).getTime() - jstToDate(fromYmd).getTime()) / 86400000);
}

function monthsBetween(fromYmd: string, toYmd: string): number {
  const [fy, fm] = fromYmd.split('-').map(Number);
  const [ty, tm] = toYmd.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** 繰り返しルールの日本語説明（例: "隔週 月・水曜日 (10月31日(土)まで)"） */
export function describeRecurrence(rule: RecurrenceRule, firstStart?: Date): string {
  const interval = rule.interval ?? 1;
  let base: string;
  if (rule.frequency === 'daily') {
    base = interval === 1 ? '毎日' : `${interval}日ごと`;
  } else if (rule.frequency === 'weekly') {
    const days = (rule.weekdays?.length ? rule.weekdays : firstStart ? [weekdayOfYmd(toJstYmd(firstStart))] : [])
      .slice()
      .sort((a, b) => a - b)
      .map(weekdayLabel)
      .join('・');
    const prefix = interval === 1 ? '毎週' : interval === 2 ? '隔週' : `${interval}週ごと`;
    base = days ? `${prefix} ${days}曜日` : prefix;
  } else {
    const day = firstStart ? `${dayOfYmd(toJstYmd(firstStart))}日` : '';
    base = `${interval === 1 ? '毎月' : `${interval}か月ごと`}${day ? ` ${day}` : ''}`;
  }
  return `${base} (${formatJstDate(rule.until)}まで)`;
}
