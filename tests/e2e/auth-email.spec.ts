import { expect, test, type APIRequestContext } from "@playwright/test";

// Mailpit belongs exclusively to mainpot-e2e. Never send test emails through
// the production provider or save one-time capabilities in test evidence.
async function emailLink(request: APIRequestContext, email: string, previous = new Set<string>()) {
  let messageId = "";
  await expect.poll(async () => {
    const response = await request.get(`http://127.0.0.1:55324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const body = await response.json() as { messages: { ID: string }[] };
    messageId = body.messages.find(message => !previous.has(message.ID))?.ID ?? "";
    return Boolean(messageId);
  }, { timeout: 20_000 }).toBe(true);
  previous.add(messageId);
  const response = await request.get(`http://127.0.0.1:55324/api/v1/message/${messageId}`);
  const body = await response.json() as { HTML: string; Text: string };
  const link = (body.HTML + "\n" + body.Text).match(/https?:\/\/(?:127\.0\.0\.1|localhost):55321\/auth\/v1\/verify[^\s"<>]+/)?.[0]?.replaceAll("&amp;", "&");
  if (!link) throw new Error("The local auth email did not contain a verification link.");
  return link;
}

test("confirms email, preserves guest ownership, signs in and recovers by email", async ({ page, request }) => {
  test.setTimeout(90_000);
  const email = `email-assurance-${crypto.randomUUID()}@example.com`;
  const password = `Email-${crypto.randomUUID()}`;
  const messages = new Set<string>();
  await page.goto("/create");
  await page.locator("#create-name").fill("Email Casey");
  await page.locator("#create-game-name").fill("Confirmed email recovery");
  await page.locator("#create-buy-in").fill("20");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await expect(page).toHaveURL(/\/game\/[A-HJ-NP-Z2-9]{6}$/);
  const gameUrl = page.url();
  const dashboardUrl = new URL("/dashboard", gameUrl).href;
  const homepageUrl = new URL("/", gameUrl).href;
  await page.goto("/signin");
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Email Casey");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await page.goto(await emailLink(request, email, messages));
  await expect(page).toHaveURL(dashboardUrl, { timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Your unfinished games" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("region", { name: "Your unfinished games" }).getByRole("button", { name: "Resume game" }).click();
  await expect(page).toHaveURL(gameUrl);
  await expect(page.getByRole("button", { name: "End game", exact: true })).toBeEnabled();
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(homepageUrl);
  await page.waitForLoadState("networkidle");
  await page.goto("/signin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("region", { name: "Your unfinished games" })).toContainText("Confirmed email recovery");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(homepageUrl);
  await page.waitForLoadState("networkidle");
  await page.goto("/signin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: /Get a sign-in link/ }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await page.goto(await emailLink(request, email, messages));
  await expect(page).toHaveURL(dashboardUrl, { timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Your unfinished games" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("region", { name: "Your unfinished games" }).getByRole("button", { name: "Resume game" }).click();
  await expect(page).toHaveURL(gameUrl);
  await expect(page.getByRole("region", { name: "At the table" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("Pot", { exact: true }).locator("..")).toContainText("$20.00");
});

test("handles invalid authentication callbacks without forwarding outside the app", async ({ page }) => {
  await page.goto("/auth/callback?next=https%3A%2F%2Fexample.com");
  await expect(page).toHaveURL(/\/signin\?error=missing_code$/);
  await page.goto("/auth/callback?code=invalid-one-time-code&next=https%3A%2F%2Fexample.com");
  await expect(page).toHaveURL(/\/signin\?error=/);
  await expect(page.getByRole("alert").filter({ hasText: "Sign-in could not be completed" })).toBeVisible();
});
