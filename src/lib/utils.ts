import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

/**
 * 二つの時間枠が重複しているかどうかを判定します。
 * 境界値（一方が終了した瞬間に他方が開始する場合）は重複とみなしません。
 */
export const areRangesOverlapping = (
  start1: Date | string,
  end1: Date | string,
  start2: Date | string,
  end2: Date | string
): boolean => {
  const s1 = new Date(start1).getTime();
  const e1 = new Date(end1).getTime();
  const s2 = new Date(start2).getTime();
  const e2 = new Date(end2).getTime();

  return !(s1 >= e2 || e1 <= s2);
};

/**
 * 日付を日本語表記（例: "8月13日(水)"）にフォーマットします。
 */
export const formatJapaneseDate = (date: Date | string | number): string => {
  const d = new Date(date);
  return format(d, 'M月d日(E)', { locale: ja });
};

/**
 * 時間を日本語表記（例: "14:30"）にフォーマットします。
 */
export const formatTime = (date: Date | string | number): string => {
  const d = new Date(date);
  return format(d, 'HH:mm');
};

/**
 * テンプレート文字列のプレースホルダーを実際の値に置換します。
 * {vehicle_name}, {user_name}, {invited_emails}, {destination}, {purpose} を置換します。
 */
export const formatCalendarTemplate = (
  template: string,
  data: {
    vehicle_name: string;
    user_name: string;
    invited_emails: string;
    destination?: string;
    purpose?: string;
  }
): string => {
  return template
    .replace(/{vehicle_name}/g, data.vehicle_name)
    .replace(/{user_name}/g, data.user_name)
    .replace(/{invited_emails}/g, data.invited_emails)
    .replace(/{destination}/g, data.destination || '未指定')
    .replace(/{purpose}/g, data.purpose || '未指定');
};

/**
 * 日時文字列を Google カレンダー用の日付フォーマット（YYYYMMDDTHHMMSSZ）に変換します。
 * UTC時間で出力します。
 */
export const formatToGoogleCalendarTime = (date: Date | string): string => {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
};

/**
 * Google カレンダーの登録用 URL を生成します。
 */
export const generateGoogleCalendarUrl = (params: {
  title: string;
  description: string;
  location?: string;
  startTime: string | Date;
  endTime: string | Date;
}): string => {
  const text = encodeURIComponent(params.title);
  const details = encodeURIComponent(params.description);
  const location = params.location ? encodeURIComponent(params.location) : '';
  const dates = `${formatToGoogleCalendarTime(params.startTime)}/${formatToGoogleCalendarTime(params.endTime)}`;
  
  let url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&ctz=Asia/Tokyo&sf=true&output=xml`;
  if (location) {
    url += `&location=${location}`;
  }
  return url;
};
