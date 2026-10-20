import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * 家族2人（太郎・花子）で実際にブラウザを操作するシナリオテスト。
 * Firebase エミュレータ上で動作し、テストごとにデータは引き継がれます（serial）。
 */
test.describe.configure({ mode: 'serial' });

const PROJECT_ID = 'demo-fcs';
const FIRESTORE = `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const RUN = Date.now().toString(36);
const TARO = { name: '太郎', email: `taro-${RUN}@example.com`, password: 'password123' };
const HANAKO = { name: '花子', email: `hanako-${RUN}@example.com`, password: 'password123' };

// ---- 日付ユーティリティ（JST） ----
const jstYmd = (offsetDays = 0) => {
  const d = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
};
const TOMORROW = jstYmd(1);

/** E2E_SCREENSHOTS=<dir> を指定すると主要画面のスクリーンショットを保存します */
async function snap(page: Page, name: string) {
  const dir = process.env.E2E_SCREENSHOTS;
  if (!dir) return;
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

let taroPage: Page;
let hanakoPage: Page;
let inviteCode = '';

async function newMobilePage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  return page;
}

async function signUp(page: Page, user: typeof TARO) {
  await page.goto('/login');
  await expect(page.getByTestId('auth-screen')).toBeVisible();
  await page.getByTestId('auth-tab-signup').click();
  await page.getByTestId('auth-name').fill(user.name);
  await page.getByTestId('auth-email').fill(user.email);
  await page.getByTestId('auth-password').fill(user.password);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
}

async function openCreateSheet(page: Page) {
  await page.getByTestId('fab-create').click();
  const sheet = page.getByTestId('reservation-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
}

async function createReservation(page: Page, date: string, start: string, end: string) {
  const sheet = await openCreateSheet(page);
  await sheet.getByTestId('res-date').fill(date);
  await sheet.getByTestId('res-start').fill(start);
  await sheet.getByTestId('res-end').fill(end);
  await expect(sheet.getByTestId('availability-ok')).toBeVisible();
  await snap(page, `04-sheet-${start.replace(':', '')}`);
  await sheet.getByTestId('submit-reservation').click();
  await expect(sheet.getByTestId('reservation-success')).toBeVisible();
  await sheet.getByRole('button', { name: '閉じる' }).last().click();
  await expect(sheet).toBeHidden();
}

/** Firestore エミュレータに管理者権限で直接クエリ */
async function runQuery(collection: string, field: string, value: string) {
  const res = await fetch(`${FIRESTORE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
      },
    }),
  });
  const rows = (await res.json()) as { document?: { name: string; fields: Record<string, { stringValue?: string }> } }[];
  return rows.filter((r) => r.document).map((r) => ({ id: r.document!.name.split('/').pop()!, fields: r.document!.fields }));
}

test('未ログインではログイン画面が表示され、キャッチコピーがない', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByTestId('auth-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Family Car Share' })).toBeVisible();
  await expect(page.getByText('予約の競合をなくす')).toHaveCount(0);
  await snap(page, '01-login');
});

test('新規登録 → グループ作成 → 車両登録', async ({ browser }) => {
  taroPage = await newMobilePage(browser);
  await signUp(taroPage, TARO);

  await taroPage.getByTestId('group-name-input').fill('テスト家');
  await taroPage.getByTestId('create-group').click();
  await expect(taroPage.getByTestId('invite-code')).toBeVisible();
  inviteCode = (await taroPage.getByTestId('invite-code').innerText()).trim();
  expect(inviteCode).toMatch(/^[A-Z0-9]{4,8}$/);

  await taroPage.getByTestId('vehicle-name-input').fill('プリウス');
  await taroPage.getByTestId('add-vehicle').click();
  await expect(taroPage.getByTestId('vehicle-row')).toHaveCount(1);
  await expect(taroPage.getByTestId('vehicle-row')).toContainText('プリウス');
  await snap(taroPage, '02-settings');
});

test('ホーム: 予約がないときのヒーロー表示と、横スクロールが発生しないこと', async () => {
  await taroPage.getByTestId('back-home').click();
  await expect(taroPage.getByTestId('dashboard')).toBeVisible();
  await expect(taroPage.getByTestId('group-name')).toHaveText('テスト家');
  await expect(taroPage.getByTestId('next-up-empty')).toBeVisible();
  await expect(taroPage.getByTestId('my-next-empty')).toBeVisible();
  await expect(taroPage.getByTestId('now-status')).toContainText('いまは空いています');
  await expect(taroPage.getByTestId('timeline-empty')).toBeVisible();

  const overflow = await taroPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await snap(taroPage, '03-home-empty');
});

test('予約を作成すると、次の予約・自分の次の予約が即座に表示される', async () => {
  await createReservation(taroPage, TOMORROW, '10:00', '12:00');

  const nextUp = taroPage.getByTestId('next-up');
  await expect(nextUp.getByTestId('next-up-name')).toContainText('太郎');
  await expect(nextUp.getByTestId('next-up-time')).toHaveText('10:00–12:00');
  await expect(nextUp).toContainText('明日');
  await expect(nextUp.getByTestId('next-up-countdown')).toContainText('あと');
  await expect(taroPage.getByTestId('my-next-time')).toHaveText('明日 10:00–12:00');
});

test('ヒーローをタップすると該当日のタイムラインへ移動する', async () => {
  await taroPage.getByTestId('next-up').click();
  await expect(taroPage.getByTestId(`day-${TOMORROW}`)).toBeVisible();
  const card = taroPage.getByTestId('reservation-card').first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('reservation-time')).toContainText('10:00');
  await expect(card.getByTestId('reservation-user')).toHaveText('太郎');
});

test('重複する時間帯は予約できない', async () => {
  const sheet = await openCreateSheet(taroPage);
  await sheet.getByTestId('res-date').fill(TOMORROW);
  await sheet.getByTestId('res-start').fill('11:00');
  await sheet.getByTestId('res-end').fill('13:00');
  await expect(sheet.getByTestId('availability-conflict')).toBeVisible();
  await expect(sheet.getByTestId('submit-reservation')).toBeDisabled();
  await taroPage.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('ワンタップ時間指定で終了時刻が設定される', async () => {
  const sheet = await openCreateSheet(taroPage);
  await sheet.getByTestId('res-start').fill('09:00');
  await sheet.getByRole('button', { name: '3時間' }).click();
  await expect(sheet.getByTestId('res-end')).toHaveValue('12:00');
  await sheet.getByRole('button', { name: '閉じる' }).click();
  await expect(sheet).toBeHidden();
});

test('家族が招待コードで参加し、自分と相手の予約が区別して表示される', async ({ browser }) => {
  hanakoPage = await newMobilePage(browser);
  await signUp(hanakoPage, HANAKO);
  await hanakoPage.getByTestId('invite-code-input').fill(inviteCode);
  await hanakoPage.getByTestId('join-group').click();

  await expect(hanakoPage.getByTestId('dashboard')).toBeVisible();
  await expect(hanakoPage.getByTestId('next-up-name')).toContainText('太郎');
  await expect(hanakoPage.getByTestId('my-next-empty')).toBeVisible();

  await createReservation(hanakoPage, TOMORROW, '08:00', '09:00');
  await expect(hanakoPage.getByTestId('next-up-name')).toContainText('花子');
  await expect(hanakoPage.getByTestId('next-up-time')).toHaveText('08:00–09:00');
  await expect(hanakoPage.getByTestId('my-next-time')).toHaveText('明日 08:00–09:00');
});

test('他の家族の予約がリアルタイムで反映される', async () => {
  // 太郎の画面は再読み込みしなくても花子の予約が「次の予約」になる
  await expect(taroPage.getByTestId('next-up-name')).toContainText('花子');
  await expect(taroPage.getByTestId('next-up-time')).toHaveText('08:00–09:00');
  await expect(taroPage.getByTestId('my-next-time')).toHaveText('明日 10:00–12:00');
});

test('いま使用中の予約は「使用中」として表示される', async () => {
  const [taro] = await runQuery('profiles', 'email', TARO.email);
  const groupId = taro.fields.group_id.stringValue!;
  const [vehicle] = await runQuery('vehicles', 'group_id', groupId);
  const start = new Date(Date.now() - 30 * 60_000);
  const end = new Date(Date.now() + 90 * 60_000);
  const res = await fetch(`${FIRESTORE}/reservations`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        vehicle_id: { stringValue: vehicle.id },
        user_id: { stringValue: taro.id },
        start_time: { timestampValue: start.toISOString() },
        end_time: { timestampValue: end.toISOString() },
        invited_emails: { arrayValue: { values: [] } },
      },
    }),
  });
  expect(res.ok).toBeTruthy();

  await expect(hanakoPage.getByTestId('now-status')).toContainText('太郎が使用中');
  await expect(taroPage.getByTestId('my-next')).toContainText('使用中');
  // 花子の次の予約は変わらない（使用中の予約は「次の予約」ではなく状況欄に表示）
  await expect(hanakoPage.getByTestId('next-up-name')).toContainText('花子');
  await snap(hanakoPage, '05-home-ongoing');
  await hanakoPage.getByTestId(`day-${TOMORROW}`).click();
  await snap(hanakoPage, '06-home-tomorrow');
});

test('予約枠の譲渡: 依頼 → 承諾で名義が切り替わる', async () => {
  // 花子が明日の太郎の予約を「譲ってほしい」と依頼
  await hanakoPage.getByTestId(`day-${TOMORROW}`).click();
  const taroCard = hanakoPage.getByTestId('reservation-card').filter({ hasText: '太郎' });
  await expect(taroCard).toHaveCount(1);
  await taroCard.getByRole('button', { name: '譲ってほしい' }).click();
  const transferSheet = hanakoPage.getByTestId('transfer-sheet');
  await transferSheet.getByLabel('メッセージ').fill('病院の送迎で使いたいです');
  await transferSheet.getByTestId('submit-transfer').click();
  await expect(transferSheet.getByTestId('transfer-done')).toBeVisible();
  await transferSheet.getByRole('button', { name: '閉じる' }).last().click();
  await expect(taroCard).toContainText('譲渡の交渉中');

  // 太郎が受信箱から承諾
  await taroPage.reload();
  await expect(taroPage.getByTestId('dashboard')).toBeVisible();
  await expect(taroPage.getByTestId('open-inbox')).toContainText('1');
  await taroPage.getByTestId('open-inbox').click();
  const inbox = taroPage.getByTestId('transfer-inbox');
  await expect(inbox).toContainText('病院の送迎で使いたいです');
  await snap(taroPage, '07-inbox');
  await inbox.getByRole('button', { name: '承諾' }).click();
  await expect(inbox).toContainText('成立');
  await taroPage.keyboard.press('Escape');

  // 太郎の「自分の次の予約」から明日10時が消え、花子のものになる
  await expect(hanakoPage.getByTestId('my-next-time')).toHaveText('明日 08:00–09:00');
  await hanakoPage.getByTestId(`day-${TOMORROW}`).click();
  await expect(hanakoPage.getByTestId('reservation-card').filter({ hasText: '太郎' })).toHaveCount(0);
  await expect(hanakoPage.getByTestId('reservation-card')).toHaveCount(2);
});

test('予約の編集と削除', async () => {
  await hanakoPage.getByTestId(`day-${TOMORROW}`).click();
  const card = hanakoPage.getByTestId('reservation-card').filter({ hasText: '10:00' });
  await card.getByRole('button', { name: '編集' }).click();
  const sheet = hanakoPage.getByTestId('reservation-sheet');
  await expect(sheet).toContainText('予約を編集');
  await sheet.getByTestId('res-end').fill('13:00');
  await expect(sheet.getByTestId('availability-ok')).toBeVisible();
  await sheet.getByTestId('submit-reservation').click();
  await expect(sheet).toBeHidden();
  await expect(hanakoPage.getByTestId('reservation-card').filter({ hasText: '13:00' })).toHaveCount(1);

  await hanakoPage.getByTestId('reservation-card').filter({ hasText: '13:00' }).getByRole('button', { name: '編集' }).click();
  await sheet.getByTestId('delete-reservation').click();
  await expect(sheet).toBeHidden();
  await expect(hanakoPage.getByTestId('reservation-card')).toHaveCount(1);
});

test('日付ストリップとスワイプで日付を切り替えられる', async () => {
  const today = jstYmd(0);
  await hanakoPage.getByRole('button', { name: '今日', exact: true }).click();
  const label = hanakoPage.getByTestId('selected-date-label');
  const todayLabel = await label.innerText();

  const timeline = hanakoPage.getByTestId('timeline').or(hanakoPage.getByTestId('timeline-empty'));
  const box = (await timeline.first().boundingBox())!;
  await hanakoPage.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await hanakoPage.mouse.down();
  await hanakoPage.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 12 });
  await hanakoPage.mouse.up();
  await expect(label).not.toHaveText(todayLabel);
  await expect(hanakoPage.getByTestId(`day-${jstYmd(1)}`)).toBeVisible();
  expect(today).not.toEqual(jstYmd(1));
});

test('読み込み中は全画面スケルトンが表示される', async () => {
  const cdp = await hanakoPage.context().newCDPSession(hanakoPage);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 1500,
    downloadThroughput: 200 * 1024,
    uploadThroughput: 200 * 1024,
  });
  await hanakoPage.goto('/', { waitUntil: 'commit' });
  await expect(hanakoPage.getByTestId('dashboard-skeleton')).toBeVisible({ timeout: 20_000 });
  await snap(hanakoPage, '08-skeleton');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await expect(hanakoPage.getByTestId('dashboard')).toBeVisible({ timeout: 30_000 });
  await expect(hanakoPage.getByTestId('dashboard-skeleton')).toHaveCount(0);
});

test('設定画面: LINE 連携欄・カレンダー同期が表示され、ログアウトできる', async () => {
  await hanakoPage.getByTestId('open-settings').click();
  await expect(hanakoPage.getByTestId('settings-screen')).toBeVisible();
  await expect(hanakoPage.getByTestId('line-settings')).toContainText('連携コードを発行');
  await expect(hanakoPage.getByLabel('カレンダー購読 URL')).toHaveValue(/\/api\/calendar\/ics\?token=/);
  await hanakoPage.getByTestId('logout').click();
  await expect(hanakoPage.getByTestId('auth-screen')).toBeVisible();
});

test('ログインすると予約画面へ移動する', async () => {
  await hanakoPage.getByTestId('auth-email').fill(HANAKO.email);
  await hanakoPage.getByTestId('auth-password').fill(HANAKO.password);
  await hanakoPage.getByTestId('auth-submit').click();
  await expect(hanakoPage.getByTestId('dashboard')).toBeVisible();
  await expect(hanakoPage.getByTestId('my-next-time')).toHaveText('明日 08:00–09:00');
});

test('リリースノート配信 API: 認証・ドライラン・二重配信防止', async ({ request }) => {
  const unauthorized = await request.post('/api/line/release-notes');
  expect(unauthorized.status()).toBe(401);

  const headers = { Authorization: 'Bearer e2e-cron-secret' };
  const dry = await request.post('/api/line/release-notes?dry_run=1', { headers });
  expect(dry.status()).toBe(200);
  const dryBody = await dry.json();
  expect(dryBody).toMatchObject({ success: true, dry_run: true, recipients: 0 });
  expect(dryBody.text).toContain('デザインを一新しました');

  const first = await (await request.post('/api/line/release-notes', { headers })).json();
  expect(first).toMatchObject({ success: true, recipients: 0 });
  const second = await (await request.post('/api/line/release-notes', { headers })).json();
  expect(second).toMatchObject({ success: true, skipped: true, reason: 'already_sent' });
});
