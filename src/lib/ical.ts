import ical, { type ICalCalendar, type ICalEventData } from 'ical-generator';
import { TZDate } from '@date-fns/tz';
import { JST_TIMEZONE } from './datetime';

/**
 * Asia/Tokyo の VTIMEZONE 定義（JST は夏時間がないため固定 +0900）。
 * これをカレンダーに含めることで、各カレンダーアプリが TZID=Asia/Tokyo を確実に解釈できます。
 */
const JST_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${JST_TIMEZONE}`,
  `X-LIC-LOCATION:${JST_TIMEZONE}`,
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0900',
  'TZOFFSETTO:+0900',
  'TZNAME:JST',
  'DTSTART:19700101T000000',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n');

/**
 * Date を JST のタイムゾーン情報付き日時に変換します。
 * ical-generator は通常の Date を「実行環境のローカル時刻」として TZID を付けて出力するため、
 * UTC で動作するサーバーでは 9 時間ずれてしまいます。TZDate を渡すことで常に JST の時刻で出力されます。
 */
export const toJstTZDate = (date: Date | string | number) => new TZDate(new Date(date), JST_TIMEZONE);

/** 日本標準時で出力される iCal カレンダーを作成します */
export function createJstCalendar(name: string): ICalCalendar {
  const cal = ical({
    name,
    timezone: { name: JST_TIMEZONE, generator: () => JST_VTIMEZONE },
  });
  return cal;
}

/** JST 固定でイベントを追加します */
export function addJstEvent(
  cal: ICalCalendar,
  event: Omit<ICalEventData, 'start' | 'end' | 'timezone'> & { start: Date; end: Date }
) {
  return cal.createEvent({
    ...event,
    start: toJstTZDate(event.start),
    end: toJstTZDate(event.end),
    stamp: toJstTZDate(new Date()),
    timezone: JST_TIMEZONE,
  });
}
