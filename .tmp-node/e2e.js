const { chromium, request } = require("playwright");

const baseURL = "http://127.0.0.1:8001";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function createUserAndSeed(page) {
  const api = await request.newContext({ baseURL });
  const email = `e2e_${Date.now()}@test.com`;
  const password = "StrongPass1!";

  const signup = await api.post("/api/auth/signup/", {
    data: { email, password, password2: password },
  });
  assert(signup.ok(), "Signup failed");
  const signupData = await signup.json();

  const pref = await api.post("/api/auth/preferences/", {
    headers: { Authorization: `Bearer ${signupData.access}` },
    data: {
      interests: ["food", "culture"],
      budget_min: 0,
      budget_max: 120,
      preferred_language: "en",
    },
  });
  assert(pref.ok(), "Setting preferences failed");

  await page.goto(`${baseURL}/login/`);
  await page.evaluate(
    ({ access, refresh }) => {
      localStorage.setItem("access", access);
      localStorage.setItem("refresh", refresh);
    },
    { access: signupData.access, refresh: signupData.refresh },
  );
}

async function setInvalidTokens(page) {
  await page.goto(`${baseURL}/login/`);
  await page.evaluate(() => {
    localStorage.setItem("access", "expired-access-token");
    localStorage.setItem("refresh", "expired-refresh-token");
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // T011 + T042
    await createUserAndSeed(page);

    await page.goto(`${baseURL}/events/page/`);
    await page.waitForSelector("#eventsGrid .event-card", { timeout: 20000 });
    const cards = await page.locator("#eventsGrid .event-card").count();
    assert(cards > 0, "No event cards loaded in events page");

    await page.locator("#eventsGrid .event-card .fav-btn").first().click();
    await page.waitForFunction(
      () => {
        const icon = document.querySelector(
          "#eventsGrid .event-card .fav-icon",
        );
        return icon && icon.textContent.trim() === "♥";
      },
      { timeout: 10000 },
    );

    await page.goto(`${baseURL}/daily-plan/`);
    await page.locator("#generate-btn").click();
    await page.waitForFunction(
      () => {
        const container = document.getElementById("plan-container");
        if (!container) return false;
        return (
          container.querySelectorAll("div.bg-white.border.rounded-2xl").length >
          0
        );
      },
      { timeout: 30000 },
    );

    const firstLoadCount = await page.evaluate(
      () =>
        document.querySelectorAll(
          "#plan-container div.bg-white.border.rounded-2xl",
        ).length,
    );
    assert(firstLoadCount > 0, "Generated plan cards not shown");

    const mapPointCount = await page.evaluate(() =>
      Array.isArray(window.__TZ_DP_PENDING_POINTS)
        ? window.__TZ_DP_PENDING_POINTS.length
        : 0,
    );
    assert(mapPointCount > 0, "No map points prepared after plan generation");

    await page.goto(`${baseURL}/daily-plan/`);
    await page.waitForFunction(
      () => {
        const container = document.getElementById("plan-container");
        if (!container) return false;
        return (
          container.querySelectorAll("div.bg-white.border.rounded-2xl").length >
          0
        );
      },
      { timeout: 30000 },
    );

    const revisitCount = await page.evaluate(
      () =>
        document.querySelectorAll(
          "#plan-container div.bg-white.border.rounded-2xl",
        ).length,
    );
    assert(revisitCount > 0, "Revisit did not load saved daily plan");

    await page.goto(`${baseURL}/profile/`);
    await page.waitForFunction(
      () => {
        const plans = document.getElementById("statPlans")?.textContent?.trim();
        return plans && plans !== "—";
      },
      { timeout: 20000 },
    );

    const statPlans = Number.parseInt(
      (await page.locator("#statPlans").innerText()).trim(),
      10,
    );
    const statFavs = Number.parseInt(
      (await page.locator("#statFavs").innerText()).trim(),
      10,
    );
    assert(
      Number.isFinite(statPlans) && statPlans > 0,
      "Profile plans stat did not update",
    );
    assert(
      Number.isFinite(statFavs) && statFavs > 0,
      "Profile favorites stat did not update",
    );

    console.log("PASS T011/T042");

    // T043
    for (const path of [
      "/daily-plan/",
      "/events/page/",
      "/profile/",
      "/settings/",
    ]) {
      await setInvalidTokens(page);
      await page.goto(`${baseURL}${path}`);
      await page.waitForURL("**/login/", { timeout: 20000 });
      assert(
        /\/login\/?$/.test(page.url()),
        `Expected redirect to login for ${path}, got ${page.url()}`,
      );
    }
    console.log("PASS T043");

    // T044
    await createUserAndSeed(page);
    await page.goto(`${baseURL}/events/page/`);
    await page.waitForSelector("#eventsMap", { timeout: 20000 });

    const missingScriptFallback = await page.evaluate(() => {
      const previousGoogle = window.google;
      try {
        window.google = undefined;
        window.TZMap.initMap("eventsMap", { zoom: 11 });
        const text = document.getElementById("eventsMap")?.textContent || "";
        return /map unavailable/i.test(text) && /failed to load/i.test(text);
      } finally {
        window.google = previousGoogle;
      }
    });
    assert(missingScriptFallback, "Missing-script map fallback was not shown");

    const authFallback = await page.evaluate(() => {
      window.gm_authFailure();
      const text = document.getElementById("eventsMap")?.textContent || "";
      return /authorization failed/i.test(text);
    });
    assert(authFallback, "Auth-failure map fallback was not shown");

    console.log("PASS T044");
    console.log("ALL_REMAINING_TASK_CHECKS_PASSED");

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error("E2E CHECK FAILED:", err.message);
    await browser.close();
    process.exit(1);
  }
})();
