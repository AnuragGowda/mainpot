import { expect, test, type Browser, type Page, type Request, type Route } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createDeviceContext } from "./device-context";

type ApiDiagnostic = {
  device: string;
  phase: string;
  method: string;
  path: string;
  status?: number;
  code?: string;
  message?: string;
  failure?: string;
};

const watchedApiPath = (pathname: string) =>
  (pathname.endsWith("/rpc/join_game_guarded") || pathname.endsWith("/rpc/set_settlement_payment_status_guarded") || /\/rpc\/.*cash_out/.test(pathname))
  || /^\/rest\/v1\/(games|players|buy_ins|cash_outs|early_cash_outs|game_events|settlement_payments)$/.test(pathname);

const sanitizeDiagnosticText = (value: string) => value
  .replace(/https?:\/\/\S+/gi, "[url]")
  .replace(/(access[_-]?token|refresh[_-]?token|authorization|apikey|password)(\s*[:=]\s*)[^\s,;]+/gi, "$1$2[redacted]");

function observeApi(page: Page, device: string, getPhase: () => string, diagnostics: ApiDiagnostic[], responseReads: Promise<void>[]) {
  const requests = new Map<Request, ApiDiagnostic>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!watchedApiPath(url.pathname)) return;
    const diagnostic: ApiDiagnostic = {
      device,
      phase: getPhase(),
      method: request.method(),
      path: url.pathname,
    };
    diagnostics.push(diagnostic);
    requests.set(request, diagnostic);
  });
  page.on("response", (response) => {
    const diagnostic = requests.get(response.request());
    if (!diagnostic) return;
    diagnostic.status = response.status();
    if (response.ok()) return;
    responseReads.push(response.json().then((body: unknown) => {
      if (!body || typeof body !== "object") return;
      const error = body as { code?: unknown; message?: unknown };
      if (typeof error.code === "string") diagnostic.code = error.code.slice(0, 80);
      if (typeof error.message === "string") diagnostic.message = sanitizeDiagnosticText(error.message).slice(0, 300);
    }).catch(() => {}));
  });
  page.on("requestfailed", (request) => {
    const diagnostic = requests.get(request);
    if (diagnostic) diagnostic.failure = sanitizeDiagnosticText(request.failure()?.errorText ?? "request failed").slice(0, 200);
  });
}

async function promptDiagnostics(page: Page, device: string) {
  const name = page.locator("#join-prompt-name");
  if (!(await name.count())) return { device, promptVisible: false, alertText: [] as string[] };
  return {
    device,
    title: await page.title().catch(() => ""),
    promptVisible: true,
    inputValue: await name.inputValue().catch(() => ""),
    invalid: await name.getAttribute("aria-invalid"),
    alertText: (await page.getByRole("dialog").getByRole("alert").allTextContents()).map(text => text.trim()).filter(Boolean),
  };
}

/** A non-host bank must see both collection and payout instructions. */
export async function runBankPlanFlow(browser: Browser, baseURL: string, evidencePrefix: string) {
  const contexts = await Promise.all([0, 1, 2].map(() => createDeviceContext(browser, { baseURL, reducedMotion: "reduce" })));
  const [host, winner, banker] = await Promise.all(contexts.map(context => context.newPage()));
  const pages = [host, winner, banker];
  const labels = ["host", "winner", "banker"];
  const apiDiagnostics: ApiDiagnostic[] = [];
  const responseReads: Promise<void>[] = [];
  let phase = "setup";
  let primaryError: unknown;
  for (const [index, page] of pages.entries()) {
    observeApi(page, labels[index], () => phase, apiDiagnostics, responseReads);
    if (process.env.PLAYWRIGHT_INPUT_DIAGNOSTICS === "1") {
      page.on("console", message => {
        if (message.text().startsWith("[amount-event]")) console.debug(labels[index], message.text());
      });
    }
  }
  try {
    phase = "create game";
    await host.goto("/create");
    await host.locator("#create-name").fill("Casey");
    await host.locator("#create-game-name").fill("Shared bank regression");
    await host.locator("#create-buy-in").fill("20");
    await host.getByRole("button", { name: "Create game", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Shared bank regression" })).toBeVisible();
    for (const [page, name, device] of [[winner, "Jordan", "winner"], [banker, "Taylor", "banker"]] as const) {
      phase = `${device} join`;
      await page.goto(host.url());
      await page.locator("#join-prompt-name").fill(name);
      await page.getByRole("button", { name: "Join", exact: true }).click();
      await expect(page.locator("#join-prompt-name")).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByRole("heading", { name: "Shared bank regression" })).toBeVisible();
    }
    phase = "approve join buy-ins";
    await host.getByRole("region", { name: "Needs approval" }).getByRole("button", { name: "Approve all" }).click();
    phase = "add host player";
    await host.getByRole("button", { name: "Add player", exact: true }).click();
    const add = host.getByRole("dialog", { name: "Add a player" });
    await add.getByRole("textbox", { name: "Player name" }).fill("Riley");
    await add.getByRole("button", { name: "Add player", exact: true }).click();
    await expect(add).toHaveCount(0);
    phase = "finalize game";
    await host.getByRole("button", { name: "End game", exact: true }).click();
    await host.getByRole("button", { name: "Start cash-outs" }).click();
    for (const [name, amount] of [["Casey", "0"], ["Jordan", "40"], ["Taylor", "0"], ["Riley", "40"]]) {
      const input = host.getByRole("spinbutton", { name: `Cash-out amount for ${name}` });
      await input.fill(amount);
      await expect(input).toHaveValue(amount);
      await input.blur();
    }
    await expect(host.getByText("Totals match", { exact: true })).toBeVisible();
    await host.getByRole("button", { name: "Review settlement" }).click();
    await host.getByRole("radio", { name: /Payments through one player/ }).check();
    await host.locator("#final-bank-player-select").click();
    await host.getByRole("option", { name: "Taylor", exact: true }).click();
    await host.getByRole("button", { name: "Lock settlement", exact: true }).click();
    await host.getByRole("alertdialog").getByRole("button", { name: "Lock settlement" }).click();

    phase = "verify bank plan";
    const personal = banker.locator('section[aria-labelledby="your-settlement-heading"]');
    await expect(personal.getByRole("heading")).toHaveText("Send $40.00 · collect $20.00.");
    await expect(personal).toContainText("From Casey");
    await expect(personal).toContainText("Jordan");
    await expect(personal).toContainText("Riley");
    await expect(winner.locator('section[aria-labelledby="your-settlement-heading"]')).toContainText("From Taylor");
    expect(await banker.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(banker.viewportSize()!.width);
    await expect(banker.getByRole("status").filter({ hasText: "Final settlement is ready to review." })).toHaveCount(0);
    await banker.screenshot({ path: `${evidencePrefix}-${banker.viewportSize()!.width}.png`, fullPage: true });
    phase = "retain payment controls during reconciliation";
    const jordanPayment = personal.getByRole("checkbox", { name: "Mark sent: $20.00 from Taylor to Jordan", exact: true });
    const rileyPayment = personal.getByRole("checkbox", { name: "Mark sent: $20.00 from Taylor to Riley", exact: true });
    let heldReads = 0;
    let holdReads = true;
    let releaseReads!: () => void;
    const readGate = new Promise<void>(resolve => { releaseReads = resolve; });
    const heldHandlers: Promise<void>[] = [];
    const holdStatusRead = (route: Route) => {
      if (route.request().method() !== "GET" || !holdReads) return route.continue();
      const pending = (async () => {
        const response = await route.fetch();
        heldReads += 1;
        await readGate;
        await route.fulfill({ response });
      })();
      heldHandlers.push(pending);
      return pending;
    };
    let successfulWrites = 0;
    const observeWrite = (response: import("@playwright/test").Response) => {
      if (new URL(response.url()).pathname.endsWith("/rpc/set_settlement_payment_status_guarded")
        && response.request().method() === "POST" && response.ok()) successfulWrites += 1;
    };
    banker.on("response", observeWrite);
    await banker.route("**/rest/v1/settlement_payments*", holdStatusRead);
    try {
      await jordanPayment.locator("..").click();
      await expect.poll(() => successfulWrites).toBe(1);
      await expect.poll(() => heldReads).toBeGreaterThan(0);
      await expect(rileyPayment.locator("..")).toBeVisible();
      await expect(rileyPayment).toBeEnabled();
      await rileyPayment.locator("..").click();
      await expect.poll(() => successfulWrites).toBe(2);
    } finally {
      holdReads = false;
      releaseReads();
      // Removing a route does not wait for its held fulfill operation.
      await Promise.all(heldHandlers);
      banker.off("response", observeWrite);
      await banker.unroute("**/rest/v1/settlement_payments*", holdStatusRead);
    }
    await expect(personal.getByRole("heading")).toHaveText("$20.00 coming to you.");
    await expect(personal).toContainText("From Casey");
    await banker.reload();
    await expect(personal.getByRole("heading")).toHaveText("$20.00 coming to you.");
    await expect(banker.locator('[data-testid="payment-ledger"]')).toContainText("2 of 3 payments marked sent");
    await host.locator('section[aria-labelledby="your-settlement-heading"]').getByTitle("Mark sent").click();
    await expect(personal.getByRole("heading")).toHaveText("All your payments are marked sent.");
    await winner.reload();
    await expect(winner.locator('section[aria-labelledby="your-settlement-heading"]')).toContainText("All payments to you are marked sent.");
    await expect(winner.locator('[data-testid="payment-ledger"]')).toContainText("3 of 3 payments marked sent");
  } catch (error) {
    primaryError = error;
    let responseTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled(responseReads),
      new Promise<void>(resolve => { responseTimer = setTimeout(resolve, 1_000); }),
    ]);
    if (responseTimer) clearTimeout(responseTimer);
    const prompts = await Promise.all(pages.map((page, index) => promptDiagnostics(page, labels[index]).catch(() => ({ device: labels[index], promptVisible: null, alertText: [] }))));
    const diagnostics = {
      phase,
      failure: sanitizeDiagnosticText(error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 1000),
      prompts,
      api: apiDiagnostics,
    };
    console.error("Bank-plan flow failure diagnostics:", JSON.stringify(diagnostics));
    try {
      await writeFile(test.info().outputPath("bank-diagnostics.json"), JSON.stringify(diagnostics, null, 2));
    } catch {
      // Keep diagnostics best-effort so the triggering assertion remains primary.
    }
    await Promise.all(pages.map(async (page, index) => {
      try {
        await page.screenshot({ path: test.info().outputPath(`bank-failure-${labels[index]}.png`), fullPage: true, timeout: 5_000 });
      } catch {
        // A browser that has already timed out may no longer be able to capture a screenshot.
      }
    }));
    throw error;
  } finally {
    const closeErrors: string[] = [];
    await Promise.all(contexts.map(async (context, index) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          context.close(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Bank-flow context ${index} did not close within 10 seconds.`)), 10_000);
          }),
        ]);
      } catch (error) {
        closeErrors.push(error instanceof Error ? error.message : String(error));
      } finally {
        if (timer) clearTimeout(timer);
      }
    }));
    if (!primaryError && closeErrors.length) {
      throw new Error(`Bank-flow context teardown failed: ${closeErrors.join("; ")}`);
    }
  }
}
