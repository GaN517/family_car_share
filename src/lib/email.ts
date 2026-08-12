import { Resend } from 'resend';
import ical from 'ical-generator';
import { formatJapaneseDate, formatTime } from './utils';

// Resend クライアントの初期化
const resend = new Resend(process.env.RESEND_API_KEY);

interface SendInviteEmailParams {
  invitedEmails: string[];
  vehicleName: string;
  userName: string;
  startTime: string;
  endTime: string;
  title: string;
  description: string;
}

/**
 * 招待されたユーザーに、カレンダーイベントファイル（.ics）を添付して日本語の招待メールを送信します。
 */
export async function sendInviteEmail({
  invitedEmails,
  vehicleName,
  userName,
  startTime,
  endTime,
  title,
  description,
}: SendInviteEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY が設定されていないため、メール送信をスキップします。');
    return { success: false, message: 'APIキーが設定されていません。' };
  }

  if (!invitedEmails || invitedEmails.length === 0) {
    return { success: true, message: '招待メールの宛先がありません。' };
  }

  try {
    const start = new Date(startTime);
    const end = new Date(endTime);

    // 1. iCal (.ics) ファイルの生成
    const cal = ical({ name: 'ファミリーカーシェア' });
    cal.createEvent({
      start,
      end,
      summary: title,
      description,
      location: vehicleName,
      timezone: 'Asia/Tokyo',
    });

    const icsString = cal.toString();

    // 日付と時間の日本語フォーマット
    const dateStr = formatJapaneseDate(start);
    const timeStr = `${formatTime(start)} 〜 ${formatTime(end)}`;

    // 2. メールの送信
    const mailTitle = `【車共有】${userName}さんから「${vehicleName}」の乗車予約に招待されました`;
    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">乗車予約への招待</h2>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          ${userName}さんが、以下の時間帯で「<strong>${vehicleName}</strong>」の乗車予約を作成し、あなたを同乗者として追加しました。
        </p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px 0; color: #4b5563; font-weight: bold; width: 80px;">車両:</td>
              <td style="padding: 5px 0; color: #111827;">${vehicleName}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #4b5563; font-weight: bold;">予約日:</td>
              <td style="padding: 5px 0; color: #111827;">${dateStr}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #4b5563; font-weight: bold;">時間:</td>
              <td style="padding: 5px 0; color: #111827;">${timeStr}</td>
            </tr>
          </table>
        </div>
        <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">
          カレンダーに追加する場合は、添付されている <code>reservation.ics</code> ファイルを開いてカレンダーアプリ（Google カレンダー、Apple カレンダーなど）に登録してください。
        </p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">
          Family Car Share - 家族の車共有をスムーズに
        </p>
      </div>
    `;

    // Resendの無料アカウントの場合は差出人が制限されるため、環境変数からカスタム送信元を取得できるようにするか、デフォルトで onboarding@resend.dev を使用します。
    const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';

    const response = await resend.emails.send({
      from: `Family Car Share <${fromEmail}>`,
      to: invitedEmails,
      subject: mailTitle,
      html: htmlContent,
      attachments: [
        {
          filename: 'reservation.ics',
          content: Buffer.from(icsString), // ical-generatorの文字列をBufferとして渡す
        },
      ],
    });

    if (response.error) {
      console.error('Resend 送信エラー:', response.error);
      return { success: false, error: response.error };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error('招待メール送信プロセスで例外が発生しました:', error);
    return { success: false, error };
  }
}
