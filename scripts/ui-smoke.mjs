import { chromium } from "../phone/app/node_modules/playwright-core/index.mjs";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { installTopiaCommandMock } from "./topia-command-mock.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.REALTOPIA_PREVIEW_URL ?? "http://127.0.0.1:4173";
const appDir = path.join(root, "phone/app");
const uiFixture = JSON.parse(
  await readFile(path.join(root, "scripts/fixtures/ui-app-state.json"), "utf8"),
);
const topiaFixture = JSON.parse(await readFile(
  path.join(root, "phone/app/src-tauri/src/topia/mock_world.json"), "utf8",
));
let preview = null;
async function reachable() {
  try {
    const response = await fetch(base);
    return response.ok;
  } catch {
    return false;
  }
}
if (!(await reachable())) {
  preview = spawn(
    process.execPath,
    [
      path.join(appDir, "node_modules/vite/bin/vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "4173",
      "--strictPort",
    ],
    { cwd: appDir, stdio: ["ignore", "pipe", "pipe"] },
  );
  let startupError = "";
  preview.stdout.on("data", (chunk) => {
    startupError += chunk.toString();
  });
  preview.stderr.on("data", (chunk) => {
    startupError += chunk.toString();
  });
  for (let attempt = 0; attempt < 80 && !(await reachable()); attempt++)
    await new Promise((resolve) => setTimeout(resolve, 250));
  if (!(await reachable())) {
    preview.kill("SIGTERM");
    throw new Error(`preview server did not start: ${startupError.trim()}`);
  }
}
const browser = await chromium.launch({
  executablePath: process.env.REALTOPIA_CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
await installTopiaCommandMock(page, root);
const consoleErrors = [],
  httpErrors = [];
page.on("console", (message) => {
  if (
    message.type() === "error" &&
    !message.text().startsWith("Failed to load resource")
  )
    consoleErrors.push(message.text());
});
page.on("response", (response) => {
  if (response.status() >= 400 && !response.url().endsWith("/favicon.ico"))
    httpErrors.push(`${response.status()} ${response.url()}`);
});
try {
  await page.goto(`${base}/?screen=topia`, {
    waitUntil: "networkidle",
  });
  await page.locator(".topia-studio-dialog").waitFor();
  const onboardingAudit = await page.evaluate(() => ({
    open: Boolean(document.querySelector(".topia-studio-dialog")),
    title: document.querySelector("#topia-studio-title")?.textContent,
    subtitle: document.querySelector(".topia-studio-dialog > header p")
      ?.textContent,
    mode: document.querySelector(".topia-entry-choice")?.dataset
      .topiaStudioMode,
    choices: [...document.querySelectorAll(".topia-entry-cards button b")].map(
      (element) => element.textContent,
    ),
    scrollable: (() => {
      const dialog = document.querySelector(".topia-studio-dialog");
      return dialog.scrollHeight > dialog.clientHeight + 1;
    })(),
    cardsFullyVisible: (() => {
      const dialog = document
        .querySelector(".topia-studio-dialog")
        ?.getBoundingClientRect();
      const cards = [
        ...document.querySelectorAll(".topia-entry-cards button"),
      ].map((element) => element.getBoundingClientRect());
      return (
        Boolean(dialog) &&
        cards.length === 2 &&
        cards.every(
          (card) => card.top >= dialog.top && card.bottom <= dialog.bottom,
        )
      );
    })(),
  }));
  if (
    !onboardingAudit.open ||
    onboardingAudit.title !== "让每个人都成为自己人生开放世界中的主角。" ||
    onboardingAudit.subtitle !== "开始创建你的 Topia" ||
    onboardingAudit.mode !== "onboarding" ||
    onboardingAudit.choices.join("|") !== "使用默认|自己定制" ||
    onboardingAudit.scrollable ||
    !onboardingAudit.cardsFullyVisible
  )
    throw new Error(
      `Topia first-run onboarding audit failed: ${JSON.stringify(onboardingAudit)}`,
    );
  await page.locator(".topia-entry-cards button").first().click();
  await page.locator(".topia-studio-dialog").waitFor({ state: "detached" });
  await page.reload({ waitUntil: "networkidle" });
  if (await page.locator(".topia-studio-dialog").count())
    throw new Error(
      "Topia onboarding reopened after user data was established",
    );
  await page.goto(`${base}/?screen=quests`, { waitUntil: "networkidle" });
  await page.evaluate((fixture) => {
    localStorage.clear();
    localStorage.setItem("realtopia.migration.roster-20261002.v2", "done");
    localStorage.setItem("realtopia.quests", JSON.stringify(fixture.quests));
    localStorage.setItem("realtopia.people", JSON.stringify(fixture.people));
    localStorage.setItem("realtopia.souvenirs.v1", JSON.stringify(fixture.souvenirs));
    localStorage.setItem(
      "realtopia.memories",
      JSON.stringify(fixture.memories),
    );
  }, uiFixture);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".q-list-head h1").waitFor();
  if (await page.locator(".voice, #voice-input, #plan-goal").count())
    throw new Error("task prompt bar still exists");
  const filterAudit = await page.evaluate(() => {
    const title = document
        .querySelector(".q-list-head h1")
        .getBoundingClientRect(),
      filters = document
        .querySelector(".quest-filters")
        .getBoundingClientRect();
    return {
      rightOfTitle: filters.left >= title.right - 1,
      sameRow:
        Math.abs(
          filters.top + filters.height / 2 - (title.top + title.height / 2),
        ) < 12,
    };
  });
  if (!filterAudit.rightOfTitle || !filterAudit.sameRow)
    throw new Error(
      `quest filters are not beside the title: ${JSON.stringify(filterAudit)}`,
    );
  await page.locator('[data-quest-filter="all"]').click();
  if ((await page.locator(".q-item").count()) < 5)
    throw new Error("all quest filter did not expose every task");
  await page.locator('[data-quest-filter="active"]').click();
  const initialTitle = await page.locator(".q-title-row h1").textContent();
  await page.locator(".q-item").nth(1).click();
  if ((await page.locator(".q-title-row h1").textContent()) === initialTitle)
    throw new Error("quest selection did not update the detail view");
  await page.locator(".step").first().click();
  await page.locator('[data-quest="book"]').click();
  const affinityBefore = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("realtopia.people") ?? "[]").find(
        (person) => person.id === "zhou",
      )?.affinity ?? 64,
  );
  await page.locator('[data-focus-quest="book"]').click();
  const focusControlAudit = await page.evaluate(() => {
    const row = document.querySelector(".q-title-row");
    const title = row?.querySelector("h1")?.getBoundingClientRect();
    const button = row
      ?.querySelector(".focus-quest-button")
      ?.getBoundingClientRect();
    return {
      label: row?.querySelector(".focus-quest-button")?.textContent?.trim(),
      insideTitleRow: Boolean(
        row && row.contains(row.querySelector(".focus-quest-button")),
      ),
      afterTitle: Boolean(title && button && button.left >= title.right - 1),
    };
  });
  if (
    focusControlAudit.label !== "已追踪" ||
    !focusControlAudit.insideTitleRow ||
    !focusControlAudit.afterTitle
  )
    throw new Error(
      `quest tracking control misplaced: ${JSON.stringify(focusControlAudit)}`,
    );
  await page.locator(".step").nth(0).click();
  await page.locator(".step").nth(1).click();
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem("realtopia.gameEvents.v1") ?? "[]").some(
      (event) => event.type === "task_completed" && event.questId === "book",
    ),
  );
  await page.locator(".souvenir-unlock").waitFor();
  const souvenirAudit = await page.evaluate(() => {
    const souvenirs = JSON.parse(
      localStorage.getItem("realtopia.souvenirs.v1") ?? "[]",
    );
    return {
      title: document.querySelector("#souvenir-unlock-title")?.textContent,
      name: document.querySelector(".souvenir-unlock h3")?.textContent,
      persisted: souvenirs.some((item) => item.questId === "book"),
      unlockEvents: JSON.parse(
        localStorage.getItem("realtopia.gameEvents.v1") ?? "[]",
      ).filter(
        (event) =>
          event.type === "souvenir_unlocked" && event.questId === "book",
      ).length,
    };
  });
  if (
    souvenirAudit.title !== "获得新纪念品" ||
    souvenirAudit.name !== "书页星标" ||
    !souvenirAudit.persisted ||
    souvenirAudit.unlockEvents !== 1
  )
    throw new Error(`souvenir unlock failed: ${JSON.stringify(souvenirAudit)}`);
  await page.getByRole("button", { name: "收入我的 Topia" }).click();
  await page.locator('header.top [data-tab="quests"]').click();
  const gameplayAudit = await page.evaluate((before) => {
    const events = JSON.parse(
        localStorage.getItem("realtopia.gameEvents.v1") ?? "[]",
      ),
      quests = JSON.parse(localStorage.getItem("realtopia.quests") ?? "[]"),
      people = JSON.parse(localStorage.getItem("realtopia.people") ?? "[]"),
      memories = JSON.parse(localStorage.getItem("realtopia.memories") ?? "[]");
    return {
      activeQuestId: localStorage.getItem("realtopia.activeQuestId"),
      bookStatus: quests.find((item) => item.id === "book")?.status,
      bookProgress: quests.find((item) => item.id === "book")?.progress,
      affinityBefore: before,
      affinityAfter: people.find((person) => person.id === "zhou")?.affinity,
      completedEvents: events.filter(
        (event) => event.type === "task_completed" && event.questId === "book",
      ).length,
      affinityEvents: events.filter(
        (event) =>
          event.type === "affinity_changed" && event.questId === "book",
      ).length,
      vitalityDelta: events.find(
        (event) => event.type === "task_completed" && event.questId === "book",
      )?.vitalityDelta,
      completionMemory: memories.some(
        (memory) => memory.id === "complete-book",
      ),
    };
  }, affinityBefore);
  if (
    gameplayAudit.bookStatus !== "done" ||
    gameplayAudit.bookProgress !== 100 ||
    gameplayAudit.affinityAfter !== gameplayAudit.affinityBefore + 3 ||
    gameplayAudit.completedEvents !== 1 ||
    gameplayAudit.affinityEvents !== 1 ||
    gameplayAudit.vitalityDelta !== 7 ||
    !gameplayAudit.completionMemory ||
    gameplayAudit.activeQuestId === "book"
  )
    throw new Error(
      `gameplay reward audit failed: ${JSON.stringify(gameplayAudit)}`,
    );
  const completedSelectionAudit = await page.evaluate(() => ({
    filter: document
      .querySelector("[data-quest-filter].active")
      ?.getAttribute("data-quest-filter"),
    visibleIds: [...document.querySelectorAll(".q-item")].map((item) =>
      item.getAttribute("data-quest"),
    ),
    selectedId: document
      .querySelector(".q-item.active")
      ?.getAttribute("data-quest"),
    detailTitle: document.querySelector(".q-title-row h1")?.textContent,
  }));
  if (
    completedSelectionAudit.filter !== "active" ||
    completedSelectionAudit.visibleIds.includes("book") ||
    completedSelectionAudit.selectedId === "book" ||
    completedSelectionAudit.detailTitle === "把书还给周野"
  )
    throw new Error(
      `completed quest remained selected outside its filter: ${JSON.stringify(completedSelectionAudit)}`,
    );
  const rememberedQuestId = completedSelectionAudit.selectedId;
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-quests-linked.png"),
  });
  await page.locator('[data-tab="people"]').click();
  await page.locator('[data-person="lin"]').click();
  await page.locator('[data-person-panel="memories"]').click();
  if (
    !(await page
      .locator(".p-tabs button.active")
      .textContent()
      .then((value) => value?.startsWith("共同记忆")))
  )
    throw new Error("person memory panel did not activate");
  await page.locator('[data-person-panel="profile"]').click();
  await page.locator(".profile-grid").waitFor();
  await page.locator('header.top [data-tab="quests"]').click();
  await page.locator(".quests").waitFor();
  const questReturnAudit = await page.evaluate(() => ({
    filter: document
      .querySelector("[data-quest-filter].active")
      ?.getAttribute("data-quest-filter"),
    selectedId: document
      .querySelector(".q-item.active")
      ?.getAttribute("data-quest"),
  }));
  if (
    questReturnAudit.filter !== "active" ||
    questReturnAudit.selectedId !== rememberedQuestId
  )
    throw new Error(
      `quest page state was not restored: ${JSON.stringify(questReturnAudit)}`,
    );
  await page.locator('[data-tab="people"]').click();
  await page.locator(".people").waitFor();
  const peopleReturnAudit = await page.evaluate(() => ({
    selectedId: document
      .querySelector(".p-card.active")
      ?.getAttribute("data-person"),
    panel: document
      .querySelector("[data-person-panel].active")
      ?.getAttribute("data-person-panel"),
    profileVisible: Boolean(document.querySelector(".profile-grid")),
  }));
  if (
    peopleReturnAudit.selectedId !== "lin" ||
    peopleReturnAudit.panel !== "profile" ||
    !peopleReturnAudit.profileVisible
  )
    throw new Error(
      `people page state was not restored: ${JSON.stringify(peopleReturnAudit)}`,
    );
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-people-current.png"),
  });
  await page.goto(`${base}/?screen=memory`, { waitUntil: "networkidle" });
  await page.evaluate(() =>
    localStorage.setItem(
      "realtopia.memories",
      JSON.stringify(
        Array.from({ length: 45 }, (_, index) => ({
          id: `pagination-${index}`,
          time: `08.${String(index + 1).padStart(2, "0")}`,
          title:
            index === 0
              ? "青苔书店的下午"
              : `记忆条目 ${String(index + 1).padStart(2, "0")}`,
          meta: `人物与任务关联 · 第 ${index + 1} 条`,
          kind: index % 4 === 0 ? "mood" : "recording",
        })),
      ),
    ),
  );
  await page.reload({ waitUntil: "networkidle" });
  const memoryPaginationAudit = await page.evaluate(() => {
    const list = document.querySelector(".mem-list"),
      entry = list.querySelector("button"),
      toolbar = document
        .querySelector(".memory-toolbar")
        .getBoundingClientRect(),
      listBox = list.getBoundingClientRect();
    return {
      pageButtons: document.querySelectorAll("[data-memory-page]").length,
      entries: document.querySelectorAll(".mem-list button").length,
      columns: getComputedStyle(list).gridTemplateColumns.split(" ").length,
      toolbarAboveList: toolbar.bottom <= listBox.top + 1,
      fullyExpanded: list.scrollHeight <= list.clientHeight + 1,
      entryNarrow: entry.getBoundingClientRect().width < listBox.width * 0.55,
    };
  });
  if (
    memoryPaginationAudit.pageButtons !== 3 ||
    memoryPaginationAudit.entries !== 20 ||
    memoryPaginationAudit.columns !== 2 ||
    !memoryPaginationAudit.toolbarAboveList ||
    !memoryPaginationAudit.fullyExpanded ||
    !memoryPaginationAudit.entryNarrow
  )
    throw new Error(
      `memory pagination audit failed: ${JSON.stringify(memoryPaginationAudit)}`,
    );
  await page.locator('[data-memory-page="2"]').click();
  if (
    (await page.locator(".mem-list button").count()) !== 5 ||
    (await page.locator(".memory-pages button.active").textContent()) !== "3"
  )
    throw new Error("memory last page did not show the final five entries");
  await page.locator("#memory-search").fill("青苔");
  await page.locator(".memory-manager .mem-list button").waitFor();
  if (
    (await page.locator("[data-memory-page]").count()) !== 1 ||
    (await page.locator(".mem-list button").count()) !== 1
  )
    throw new Error("memory search did not reset pagination");
  await page.locator('[data-setting="intelligence"]').click();
  await page.getByRole("heading", { name: "智能", exact: true }).waitFor();
  await page.locator('[data-setting="memory"]').click();
  await page.getByRole("heading", { name: "记忆", exact: true }).waitFor();
  const genericKeepAliveAudit = await page.evaluate(() => ({
    query: document.querySelector("#memory-search")?.value,
    resultCount: document.querySelectorAll(".mem-list button").length,
    cachedTopRoutes: document.querySelectorAll("[data-route-cache]").length,
    activeTopRoutes: document.querySelectorAll(
      '.route-cache-page[data-route-active="true"]',
    ).length,
    cachedSettingsRoutes: document.querySelectorAll(
      ".settings-route-cache[data-route-cache]",
    ).length,
    activeSettingsRoutes: document.querySelectorAll(
      '.settings-route-cache[data-route-active="true"]',
    ).length,
  }));
  if (
    genericKeepAliveAudit.query !== "青苔" ||
    genericKeepAliveAudit.resultCount !== 1 ||
    genericKeepAliveAudit.cachedTopRoutes < 3 ||
    genericKeepAliveAudit.activeTopRoutes !== 1 ||
    genericKeepAliveAudit.cachedSettingsRoutes < 2 ||
    genericKeepAliveAudit.activeSettingsRoutes !== 1
  )
    throw new Error(
      `generic route state was not preserved: ${JSON.stringify(genericKeepAliveAudit)}`,
    );
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-memory-current.png"),
  });
  await page.locator("#memory-search").fill("");
  await page.setViewportSize({ width: 800, height: 361 });
  await page.goto(`${base}/?screen=quests`, { waitUntil: "networkidle" });
  const visualAudit = await page.evaluate(() => {
    const size = (selector) =>
      parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    const height = (selector) =>
      document.querySelector(selector).getBoundingClientRect().height;
    const text = document.body.innerText;
    return {
      header: height(".top"),
      nav: size(".top nav button"),
      title: size(".q-title-row h1"),
      item: size(".q-item span b"),
      caption: size(".q-item span small"),
      navTarget: height(".top nav button"),
      itemTarget: height(".q-item"),
      promptCount: document.querySelectorAll(".voice, #voice-input, #plan-goal")
        .length,
      mysteryEnglish:
        /CONFIGURATION|QUEST ARCHIVE|ENCOUNTERS|BOND RECORD|TODAY|DEVICE & PERCEPTION|Prototype/.test(
          text,
        ),
      rawIconCount: document.querySelectorAll("i[data-lucide]").length,
      svgIconCount: document.querySelectorAll("svg[data-lucide]").length,
    };
  });
  if (
    visualAudit.header > 60 ||
    visualAudit.nav > 15 ||
    visualAudit.title > 28 ||
    visualAudit.item > 13 ||
    visualAudit.caption > 12 ||
    visualAudit.navTarget > 42 ||
    visualAudit.itemTarget > 60 ||
    visualAudit.promptCount ||
    visualAudit.mysteryEnglish ||
    visualAudit.rawIconCount !== 0 ||
    visualAudit.svgIconCount < 8
  )
    throw new Error(
      `compact visual audit failed: ${JSON.stringify(visualAudit)}`,
    );
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-quests-device-viewport.png"),
  });
  await page.goto(`${base}/?screen=topia`, { waitUntil: "networkidle" });
  await page.locator(".world.webgl-ready").waitFor({ timeout: 10000 });
  const collectSceneSouvenirIds = async () => {
    const ids=[];
    for(const location of ['exterior','interior','garden']) {
      await page.locator(`[data-topia-location="${location}"]`).click();
      await page.locator(`.world.webgl-ready.location-${location}`).waitFor();
      ids.push(...await page.locator('[data-topia-souvenir]').evaluateAll(elements=>elements.map(e=>e.getAttribute('data-topia-souvenir'))));
    }
    await page.locator('[data-topia-location="exterior"]').click();
    await page.locator('.world.webgl-ready.location-exterior').waitFor();
    return ids.sort();
  };
  const originalSceneSouvenirIds=await collectSceneSouvenirIds();
  const topiaAudit = await page.evaluate(() => {
    const panel = document.querySelector(".today"),
      actions = document.querySelector(".quick-actions"),
      text = document.body.innerText,
      panelBox = panel.getBoundingClientRect(),
      actionsBox = actions.getBoundingClientRect(),
      world = document.querySelector(".world"),
      focus = document.querySelector("[data-active-quest]"),
      portal = document.querySelector('[data-topia-portal="garden"]'),
      portalOuter = getComputedStyle(portal, "::before"),
      portalInner = getComputedStyle(portal, "::after");
    return {
      panelFits: panel.scrollHeight <= panel.clientHeight + 1,
      weatherIconCount: document.querySelectorAll(".today-head svg").length,
      hasWeather: /27°|天气/.test(text),
      interactionPromptCount: document.querySelectorAll(".explore").length,
      hasInteractionPrompt: /拖动查看|双指缩放/.test(text),
      quickActions: actions.querySelectorAll("button").length,
      quickActionLabels: [...actions.querySelectorAll("button")].map((button) =>
        button.textContent?.trim(),
      ),
      quickActionsSingleLine: [...actions.querySelectorAll("button")].every(
        (button) =>
          getComputedStyle(button).whiteSpace === "nowrap" &&
          button.scrollWidth <= button.clientWidth,
      ),
      quickActionWidths: [...actions.querySelectorAll("button")].map(
        (button) => button.getBoundingClientRect().width,
      ),
      quickActionHeight: actions.querySelector("button").getBoundingClientRect()
        .height,
      quickActionsOutsideToday: !panel.contains(actions),
      quickActionsAboveToday: actionsBox.bottom <= panelBox.top,
      journeyCards: [...panel.querySelectorAll(".today-item")].map((card) => {
        const outer = card.getBoundingClientRect();
        const icon = card.querySelector(".item-icon").getBoundingClientRect();
        const style = getComputedStyle(card);
        return {
          borderWidth: parseFloat(style.borderTopWidth),
          radius: parseFloat(style.borderRadius),
          iconGap: Math.min(
            icon.left - outer.left,
            outer.right - icon.right,
            icon.top - outer.top,
            outer.bottom - icon.bottom,
          ),
        };
      }),
      locationButtons: document.querySelectorAll("[data-topia-location]")
        .length,
      activeLocation: document
        .querySelector("[data-topia-location].active")
        ?.getAttribute("data-topia-location"),
      portalButtons: document.querySelectorAll("[data-topia-portal]").length,
      portalOuterSize: parseFloat(portalOuter.width),
      portalInnerSize: parseFloat(portalInner.width),
      portalRadius: portalOuter.borderRadius,
      portalAnimation: portalOuter.animationName,
      exteriorLandmarks: document.querySelectorAll("[data-topia-landmark]")
        .length,
      canvasLabel: document
        .querySelector("#topia-canvas")
        ?.getAttribute("aria-label"),
      focusParticles: document.querySelectorAll(".quest-focus-effect i").length,
      focusCategory: world?.getAttribute("data-focus-category"),
      activeQuest: focus?.getAttribute("data-active-quest"),
      storedActiveQuest: localStorage.getItem("realtopia.activeQuestId"),
      focusProgress: focus?.style.getPropertyValue("--focus-progress"),
      renderStyle: world?.getAttribute("data-topia-render-style"),
      canvasRenderStyle:
        document.querySelector("#topia-canvas")?.dataset.topiaRenderStyle,
      souvenirCount: Number(world?.getAttribute("data-topia-souvenir-count")),
      souvenirKinds: (world?.getAttribute("data-topia-souvenir-kinds") ?? "")
        .split(",")
        .filter(Boolean),
      souvenirModels: Number(
        document.querySelector("#topia-canvas")?.dataset
          .topiaSouvenirModelCount,
      ),
      minSouvenirMeshes: Number(
        document.querySelector("#topia-canvas")?.dataset
          .topiaSouvenirMinMeshCount,
      ),
    };
  });
  if (
    !topiaAudit.panelFits ||
    topiaAudit.weatherIconCount ||
    topiaAudit.interactionPromptCount ||
    topiaAudit.hasInteractionPrompt ||
    topiaAudit.quickActions !== 3 ||
    topiaAudit.quickActionLabels.join("|") !== "新任务|对话感知|记录心情" ||
    !topiaAudit.quickActionsSingleLine ||
    !(topiaAudit.quickActionWidths[0] < topiaAudit.quickActionWidths[1]) ||
    topiaAudit.quickActionHeight < 40 ||
    !topiaAudit.quickActionsOutsideToday ||
    !topiaAudit.quickActionsAboveToday ||
    topiaAudit.journeyCards.length !== 2 ||
    topiaAudit.journeyCards.some(
      (card) => card.borderWidth < 1 || card.radius < 8 || card.iconGap < 5,
    ) ||
    topiaAudit.locationButtons !== 3 ||
    topiaAudit.activeLocation !== "exterior" ||
    topiaAudit.portalButtons !== 2 ||
    topiaAudit.portalOuterSize <= topiaAudit.portalInnerSize ||
    topiaAudit.portalRadius !== "50%" ||
    topiaAudit.portalAnimation !== "topia-click-glow" ||
    topiaAudit.exteriorLandmarks < 2 ||
    topiaAudit.canvasLabel !== "屋外三维场景" ||
    topiaAudit.focusParticles !== 10 ||
    !topiaAudit.focusCategory ||
    topiaAudit.activeQuest !== topiaAudit.storedActiveQuest ||
    !topiaAudit.focusProgress?.endsWith("%") ||
    topiaAudit.renderStyle !== "storybook-ink" ||
    topiaAudit.canvasRenderStyle !== "storybook-ink" ||
    topiaAudit.souvenirCount < 5 ||
    new Set(topiaAudit.souvenirKinds).size < 5 ||
    topiaAudit.souvenirModels !== topiaAudit.souvenirCount ||
    topiaAudit.minSouvenirMeshes < 8
  )
    throw new Error(`Topia audit failed: ${JSON.stringify(topiaAudit)}`);
  const latestSouvenir = page.locator(".latest-souvenir");
  await latestSouvenir.waitFor();
  const latestSouvenirId = await latestSouvenir.getAttribute("data-souvenir");
  const latestSouvenirLocation = await latestSouvenir.getAttribute(
    "data-souvenir-location",
  );
  await latestSouvenir.click();
  await page.locator(".topia-drawer").waitFor();
  await page.waitForFunction((id) => document.querySelector(
    `[data-topia-souvenir="${id}"]`,
  )?.getAttribute("data-topia-anchor-bound") === "true", latestSouvenirId);
  const souvenirSceneAudit = await page.evaluate(
    ({ souvenirId, location }) => {
      const marker = document.querySelector(
        `[data-topia-souvenir="${souvenirId}"]`,
      );
      return {
        activeLocation: document
          .querySelector("[data-topia-location].active")
          ?.getAttribute("data-topia-location"),
        expectedLocation: location,
        title: document.querySelector("#topia-landmark-title")?.textContent,
        markerBound: marker?.getAttribute("data-topia-anchor-bound"),
        markerVisible: Boolean(marker),
        latestDismissed: !document.querySelector(".latest-souvenir"),
        viewedPersisted: Boolean(
          JSON.parse(
            localStorage.getItem("realtopia.souvenirs.v1") ?? "[]",
          ).find((item) => item.id === souvenirId)?.viewedAt,
        ),
      };
    },
    { souvenirId: latestSouvenirId, location: latestSouvenirLocation },
  );
  if (
    souvenirSceneAudit.activeLocation !== souvenirSceneAudit.expectedLocation ||
    souvenirSceneAudit.title !== "书页星标" ||
    !souvenirSceneAudit.markerVisible ||
    souvenirSceneAudit.markerBound !== "true" ||
    !souvenirSceneAudit.latestDismissed ||
    !souvenirSceneAudit.viewedPersisted
  )
    throw new Error(
      `souvenir scene navigation failed: ${JSON.stringify(souvenirSceneAudit)}`,
    );
  const souvenirPreview = page.locator(".souvenir-model-preview canvas");
  await souvenirPreview.waitFor();
  const souvenirPreviewBounds = await souvenirPreview.boundingBox();
  if (!souvenirPreviewBounds)
    throw new Error("souvenir detail preview has no bounds");
  await page.mouse.move(
    souvenirPreviewBounds.x + souvenirPreviewBounds.width / 2,
    souvenirPreviewBounds.y + souvenirPreviewBounds.height / 2,
  );
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(400);
  const souvenirPreviewAudit = await souvenirPreview.evaluate((canvas) => ({
    meshCount: Number(canvas.dataset.souvenirPreviewMeshCount),
    kind: canvas.dataset.souvenirPreviewKind,
    zoom: Number(canvas.dataset.souvenirPreviewZoom),
    label: canvas.getAttribute("aria-label"),
  }));
  if (
    souvenirPreviewAudit.meshCount < 8 ||
    souvenirPreviewAudit.kind !== "winged-book" ||
    souvenirPreviewAudit.zoom < 1.8 ||
    !souvenirPreviewAudit.label?.includes("可拖动旋转并捏合缩放")
  )
    throw new Error(
      `souvenir preview audit failed: ${JSON.stringify(souvenirPreviewAudit)}`,
    );
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-topia-souvenir-drawer.png"),
  });
  await page.locator(".topia-drawer [data-close-topia-drawer]").first().click();
  await page.locator("#world-mood").click();
  const moodPickerOpenAudit = await page.evaluate(() => ({
    expanded: document
      .querySelector("#world-mood")
      ?.getAttribute("aria-expanded"),
    choices: document.querySelectorAll("[data-mood-choice]").length,
    voiceDialogs: document.querySelectorAll('.mood-dialog[role="dialog"]')
      .length,
  }));
  if (
    moodPickerOpenAudit.expanded !== "true" ||
    moodPickerOpenAudit.choices !== 7 ||
    moodPickerOpenAudit.voiceDialogs
  )
    throw new Error(
      `direct mood picker failed to open: ${JSON.stringify(moodPickerOpenAudit)}`,
    );
  await page.locator('[data-mood-choice="joyful"]').click();
  await page.locator(".world.mood-joyful").waitFor();
  await page.locator("#today-mood").click();
  const moodPickerAudit = await page.evaluate(() => ({
    storedMood: JSON.parse(localStorage.getItem("realtopia.mood") ?? "null")
      ?.mood,
    summary: JSON.parse(localStorage.getItem("realtopia.mood") ?? "null")
      ?.summary,
    reopenedFromToday: Boolean(document.querySelector(".mood-picker-menu")),
    voiceDialogs: document.querySelectorAll('.mood-dialog[role="dialog"]')
      .length,
  }));
  if (
    moodPickerAudit.storedMood !== "joyful" ||
    moodPickerAudit.summary !== "此刻感到愉快" ||
    !moodPickerAudit.reopenedFromToday ||
    moodPickerAudit.voiceDialogs
  )
    throw new Error(
      `direct mood selection failed: ${JSON.stringify(moodPickerAudit)}`,
    );
  await page.keyboard.press("Escape");
  await page.locator(".topia-studio-trigger").click();
  await page.locator(".topia-studio-dialog").waitFor();
  const topiaStudioAudit = await page.evaluate(() => ({
    title: document.querySelector("#topia-studio-title")?.textContent,
    mode: document.querySelector(".topia-entry-choice")?.dataset
      .topiaStudioMode,
    entryCards: document.querySelectorAll(".topia-entry-cards button").length,
    firstChoice: document.querySelector(
      ".topia-entry-cards button:first-child b",
    )?.textContent,
    secondChoice: document.querySelector(
      ".topia-entry-cards button:last-child b",
    )?.textContent,
    blurred: getComputedStyle(document.querySelector(".topia-studio-overlay"))
      .backdropFilter,
    triggerEmoji: document.querySelector(".topia-studio-trigger")?.textContent,
    dialogWidth: document
      .querySelector(".topia-studio-dialog")
      ?.getBoundingClientRect().width,
    dialogHeight: document
      .querySelector(".topia-studio-dialog")
      ?.getBoundingClientRect().height,
    viewport: [innerWidth, innerHeight],
  }));
  if (
    topiaStudioAudit.title !== "让每个人都成为自己人生开放世界中的主角。" ||
    topiaStudioAudit.mode !== "manage" ||
    topiaStudioAudit.entryCards !== 2 ||
    topiaStudioAudit.firstChoice !== "自定义" ||
    topiaStudioAudit.secondChoice !== "从历史选择" ||
    !topiaStudioAudit.blurred.includes("blur") ||
    topiaStudioAudit.triggerEmoji?.trim() !== "🎨" ||
    topiaStudioAudit.dialogWidth > topiaStudioAudit.viewport[0] * 0.8 + 1 ||
    topiaStudioAudit.dialogHeight > topiaStudioAudit.viewport[1] * 0.8 + 1
  )
    throw new Error(
      `Topia studio audit failed: ${JSON.stringify(topiaStudioAudit)}`,
    );
  await page.locator(".topia-entry-cards button").last().click();
  const historyAudit = await page.evaluate(() => ({
    cards: document.querySelectorAll(".topia-history-grid > button").length,
    defaultLabel: document.querySelector(
      ".topia-history-grid > button:first-child em",
    )?.textContent,
    thumbnail: document
      .querySelector(".topia-history-thumbnail img")
      ?.getAttribute("src"),
  }));
  if (
    historyAudit.cards < 1 ||
    !["默认", "当前"].includes(historyAudit.defaultLabel ?? "") ||
    !historyAudit.thumbnail?.startsWith("data:image/jpeg;base64,")
  )
    throw new Error(
      `Topia history thumbnail audit failed: ${JSON.stringify(historyAudit)}`,
    );
  await page.locator(".topia-history-view + footer .secondary").click();
  await page.locator(".topia-entry-cards button").first().click();
  if (
    (await page.locator("#topia-studio-title").textContent()) !==
    "创建 Topia（第 1 / 4 步）"
  )
    throw new Error("Topia custom guide did not show the step in its title");
  const customGuideAudit = await page.evaluate(() => ({
    dimensions: document.querySelectorAll(".topia-imagery fieldset").length,
    selected: document.querySelectorAll(".topia-imagery button.selected")
      .length,
    pages: document.querySelectorAll(".topia-guide-progress i").length,
    emojiChoices: document.querySelectorAll(
      ".topia-imagery fieldset button > span",
    ).length,
    next: document.querySelector(".topia-guide-actions button:last-child")
      ?.textContent,
  }));
  if (
    customGuideAudit.dimensions !== 2 ||
    customGuideAudit.selected !== 2 ||
    customGuideAudit.pages !== 4 ||
    customGuideAudit.emojiChoices !== 12 ||
    !customGuideAudit.next?.includes("下一页")
  )
    throw new Error(
      `Topia custom guide audit failed: ${JSON.stringify(customGuideAudit)}`,
    );
  await page.evaluate(() => {
    const dialog = document.querySelector(".topia-studio-dialog");
    if (dialog) dialog.scrollTop = dialog.scrollHeight;
  });
  await page.locator(".topia-guide-actions button").last().click();
  await page.waitForTimeout(50);
  const nextPageTopAudit = await page.evaluate(() => ({
    title: document.querySelector("#topia-studio-title")?.textContent,
    scrollTop: document.querySelector(".topia-studio-dialog")?.scrollTop,
  }));
  if (
    nextPageTopAudit.title !== "创建 Topia（第 2 / 4 步）" ||
    nextPageTopAudit.scrollTop !== 0
  )
    throw new Error(
      `Topia page did not reset to top: ${JSON.stringify(nextPageTopAudit)}`,
    );
  for (let index = 0; index < 2; index++)
    await page.locator(".topia-guide-actions button").last().click();
  const topiaStudioFinalAudit = await page.evaluate(() => ({
    title: document.querySelector("#topia-studio-title")?.textContent,
    styleChoices: document.querySelectorAll(".topia-imagery fieldset button")
      .length,
    randomSelected: document.querySelector(".topia-imagery button.selected")
      ?.textContent,
    generate: document.querySelector(".topia-guide-actions button:last-child")
      ?.textContent,
  }));
  if (
    topiaStudioFinalAudit.title !== "创建 Topia（第 4 / 4 步）" ||
    topiaStudioFinalAudit.styleChoices !== 5 ||
    !topiaStudioFinalAudit.randomSelected?.includes("完全随机") ||
    !topiaStudioFinalAudit.generate?.includes("生成新的 Topia")
  )
    throw new Error(
      `Topia studio final page audit failed: ${JSON.stringify(topiaStudioFinalAudit)}`,
    );
  await page.locator(".topia-guide-actions button").last().click();
  await page.locator('[role="progressbar"]').waitFor();
  const topiaGenerationAudit = await page.evaluate(() => {
    const progress = document.querySelector('[role="progressbar"]');
    const bar = progress?.querySelector("i");
    const close = document.querySelector('[aria-label="关闭 Topia 工坊"]');
    return {
      title: document.querySelector("#topia-studio-title")?.textContent,
      message: document.querySelector(".topia-generation-wait h3")?.textContent,
      busy: document
        .querySelector(".topia-generation-wait")
        ?.getAttribute("aria-busy"),
      value: progress?.getAttribute("aria-valuenow"),
      width: bar?.style.width,
      animation: bar
        ? getComputedStyle(bar, "::after").animationName
        : undefined,
      closeDisabled: close instanceof HTMLButtonElement && close.disabled,
      dialogOverflow: getComputedStyle(
        document.querySelector(".topia-studio-dialog"),
      ).overflowY,
      overlayTouchAction: getComputedStyle(
        document.querySelector(".topia-studio-overlay"),
      ).touchAction,
      scrollable: (() => {
        const dialog = document.querySelector(".topia-studio-dialog");
        return dialog.scrollHeight > dialog.clientHeight + 1;
      })(),
    };
  });
  if (
    topiaGenerationAudit.title !== "正在创建 Topia" ||
    !["正在叫醒沉睡的小岛", "正在收集口袋里的灵感", "正在为远方留一扇门"].includes(topiaGenerationAudit.message) ||
    topiaGenerationAudit.busy !== "true" ||
    topiaGenerationAudit.value !== "2" ||
    topiaGenerationAudit.width !== "2%" ||
    topiaGenerationAudit.animation !== "topia-progress-shimmer" ||
    !topiaGenerationAudit.closeDisabled ||
    topiaGenerationAudit.dialogOverflow !== "hidden" ||
    topiaGenerationAudit.overlayTouchAction !== "none" ||
    topiaGenerationAudit.scrollable
  )
    throw new Error(
      `Topia generation progress audit failed: ${JSON.stringify(topiaGenerationAudit)}`,
    );
  await page.locator('[role="progressbar"]').waitFor({ state: "detached" });
  await page.locator('[aria-label="关闭 Topia 工坊"]').click();
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-topia-exterior.png"),
  });
  const anchoredLabel = page.locator('[data-topia-landmark="wind-chimes"]'),
    anchorBefore = await anchoredLabel.evaluate((element) => ({
      left: parseFloat(element.style.left),
      top: parseFloat(element.style.top),
      bound: element.dataset.topiaAnchorBound,
      opacity: parseFloat(getComputedStyle(element).opacity),
      pointerEvents: getComputedStyle(element).pointerEvents,
      transition: getComputedStyle(element).transition,
      collapsed: element.classList.contains("topia-anchor-collapsed"),
      glowOuter: parseFloat(getComputedStyle(element, "::before").width),
      glowInner: parseFloat(getComputedStyle(element, "::after").width),
    })),
    anchorCanvas = await page.locator("#topia-canvas").boundingBox();
  if (!anchorCanvas) throw new Error("Topia anchor canvas has no bounds");
  await page.mouse.move(
    anchorCanvas.x + anchorCanvas.width * 0.8,
    anchorCanvas.y + anchorCanvas.height * 0.82,
  );
  await page.mouse.down();
  await page.mouse.move(
    anchorCanvas.x + anchorCanvas.width * 0.58,
    anchorCanvas.y + anchorCanvas.height * 0.72,
    { steps: 10 },
  );
  await page.mouse.up();
  await page.waitForTimeout(650);
  const anchorAfterRotate = await anchoredLabel.evaluate((element) => ({
    left: parseFloat(element.style.left),
    top: parseFloat(element.style.top),
  }));
  await page.mouse.move(
    anchorCanvas.x + anchorCanvas.width * 0.8,
    anchorCanvas.y + anchorCanvas.height * 0.82,
  );
  await page.mouse.wheel(0, -650);
  await page.waitForTimeout(350);
  const anchorAfterZoom = await anchoredLabel.evaluate((element) => ({
    left: parseFloat(element.style.left),
    top: parseFloat(element.style.top),
    opacity: parseFloat(getComputedStyle(element).opacity),
    visible: element.classList.contains("topia-anchor-visible"),
    collapsed: element.classList.contains("topia-anchor-collapsed"),
    visibleCount: document.querySelectorAll('.topia-anchor-visible').length,
  }));
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(700);
  const anchorAfterShrink = await anchoredLabel.evaluate((element) => ({
      opacity: parseFloat(getComputedStyle(element).opacity),
      pointerEvents: getComputedStyle(element).pointerEvents,
      visible: element.classList.contains("topia-anchor-visible"),
      collapsed: element.classList.contains("topia-anchor-collapsed"),
    })),
    anchorDistance = (a, b) => Math.hypot(a.left - b.left, a.top - b.top),
    anchorAudit = {
      bound: anchorBefore.bound,
      defaultOpacity: anchorBefore.opacity,
      defaultPointerEvents: anchorBefore.pointerEvents,
      defaultCollapsed: anchorBefore.collapsed,
      doubleGlow: anchorBefore.glowOuter > anchorBefore.glowInner,
      hasOpacityAnimation: anchorBefore.transition.includes("opacity"),
      rotateDistance: anchorDistance(anchorBefore, anchorAfterRotate),
      zoomDistance: anchorDistance(anchorAfterRotate, anchorAfterZoom),
      zoomedOpacity: anchorAfterZoom.opacity,
      zoomedVisible: anchorAfterZoom.visible,
      zoomedCollapsed: anchorAfterZoom.collapsed,
      zoomedVisibleCount: anchorAfterZoom.visibleCount,
      shrunkOpacity: anchorAfterShrink.opacity,
      shrunkPointerEvents: anchorAfterShrink.pointerEvents,
      shrunkVisible: anchorAfterShrink.visible,
      shrunkCollapsed: anchorAfterShrink.collapsed,
    };
  if (
    anchorAudit.bound !== "true" ||
    anchorAudit.defaultOpacity < 0.95 ||
    anchorAudit.defaultPointerEvents !== "auto" ||
    !anchorAudit.defaultCollapsed ||
    !anchorAudit.doubleGlow ||
    !anchorAudit.hasOpacityAnimation ||
    anchorAudit.rotateDistance < 1 ||
    anchorAudit.zoomDistance < 0.35 ||
    anchorAudit.zoomedOpacity < 0.95 ||
    anchorAudit.zoomedVisibleCount < 1 ||
    anchorAudit.zoomedVisibleCount > 3 ||
    anchorAudit.shrunkOpacity < 0.95 ||
    anchorAudit.shrunkPointerEvents !== "auto" ||
    anchorAudit.shrunkVisible ||
    !anchorAudit.shrunkCollapsed
  )
    throw new Error(
      `Topia zoom label audit failed: ${JSON.stringify(anchorAudit)}`,
    );
  await page.mouse.wheel(0, -1800);
  await page.waitForTimeout(350);
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-topia-souvenir-detail.png"),
  });
  await page.mouse.wheel(0, 1800);
  await page.waitForTimeout(350);
  const clickZoom=Number(await page.locator('#topia-canvas').getAttribute('data-topia-zoom'));
  await page.mouse.wheel(0,-Math.log(1.3/clickZoom)/.0013);
  await page.waitForTimeout(350);
  // Rotation/camera fitting may move a particular landmark out of view; audit
  // a currently visible hit target rather than an off-screen, culled anchor.
  const hittableLandmark = await page.locator('.topia-landmark:not(.topia-anchor-hidden)').evaluateAll(elements=>elements.find(element=>{
    const bounds=element.getBoundingClientRect();
    const hit=document.elementFromPoint(bounds.left+bounds.width/2,bounds.top+bounds.height/2);
    return hit===element || element.contains(hit);
  })?.getAttribute('data-topia-landmark'));
  if(!hittableLandmark)throw new Error('no visible landmark has an unobstructed hit target');
  const visibleAnchoredLabel = page.locator(`[data-topia-landmark="${hittableLandmark}"]`);
  const anchoredLabelHitTarget = await visibleAnchoredLabel.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return hit === element || element.contains(hit);
  });
  if (!anchoredLabelHitTarget)
    throw new Error("landmark label is obstructed by another scene anchor");
  await visibleAnchoredLabel.click();
  await page.locator('.topia-drawer[role="dialog"]').waitFor();
  await page.locator(".topia-drawer [data-close-topia-drawer]").click();
  await page.locator('[data-topia-portal="garden"]').click();
  await page
    .locator(".world.webgl-ready.location-garden")
    .waitFor({ timeout: 10000 });
  if (
    (await page.locator('[data-topia-location="garden"].active').count()) !== 1
  )
    throw new Error("rear island portal did not enter the garden");
  await page.locator('[data-topia-location="exterior"]').click();
  await page
    .locator(".world.webgl-ready.location-exterior")
    .waitFor({ timeout: 10000 });
  await page.locator('[data-topia-portal="interior"]').click();
  await page
    .locator(".world.webgl-ready.location-interior")
    .waitFor({ timeout: 10000 });
  if (
    (await page.locator("[data-topia-landmark]").count()) < 3 ||
    (await page.locator('[data-topia-location="interior"].active').count()) !==
      1
  )
    throw new Error("interior scene did not expose its object landmarks");
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-topia-interior.png"),
  });
  const interiorCanvas = await page.locator("#topia-canvas").boundingBox();
  if (!interiorCanvas) throw new Error("interior canvas has no bounds");
  await page.mouse.move(
    interiorCanvas.x + interiorCanvas.width * 0.8,
    interiorCanvas.y + interiorCanvas.height * 0.82,
  );
  await page.mouse.wheel(0, -650);
  await page.waitForTimeout(350);
  await page.locator('[data-topia-landmark="window-garden"]').click({force:true});
  await page.locator('.topia-drawer[role="dialog"]').waitFor();
  const interiorDrawerAudit = await page.evaluate(() => ({
    title: document.querySelector("#topia-landmark-title")?.textContent,
    task: document.querySelector('[data-related-task="garden"]')?.textContent,
    person: document.querySelector('[data-related-person="lin"]')?.textContent,
    inside: document
      .querySelector(".topia-drawer")
      ?.contains(document.querySelector(".topia-relations")),
    souvenirCount: Number(
      document
        .querySelector(".world")
        ?.getAttribute("data-topia-souvenir-count"),
    ),
    minSouvenirMeshes: Number(
      document.querySelector("#topia-canvas")?.dataset
        .topiaSouvenirMinMeshCount,
    ),
  }));
  if (
    interiorDrawerAudit.title !== "窗边花圃" ||
    !interiorDrawerAudit.task?.includes("让阳台重新生长") ||
    !interiorDrawerAudit.person?.includes("林澄") ||
    !interiorDrawerAudit.inside ||
    interiorDrawerAudit.souvenirCount < 1 ||
    interiorDrawerAudit.souvenirCount > 3 ||
    interiorDrawerAudit.minSouvenirMeshes < 8
  )
    throw new Error(
      `Topia landmark drawer audit failed: ${JSON.stringify(interiorDrawerAudit)}`,
    );
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-topia-landmark-drawer.png"),
  });
  await page.locator(".topia-drawer [data-close-topia-drawer]").click();
  await page.locator('[data-topia-location="garden"]').click();
  await page
    .locator(".world.webgl-ready.location-garden")
    .waitFor({ timeout: 10000 });
  const gardenAudit = await page.evaluate((world) => ({
    crops: document.querySelectorAll('[data-topia-landmark^="crop-"]').length,
    expectedProgress: (() => {
      const quests = JSON.parse(localStorage.getItem("realtopia.quests") ?? "[]");
      return world.scenes.garden.objects.filter(o => o.prefab === "crop-plot")
        .flatMap(o => quests.filter(q => q.id === o.taskId).map(q => `${q.title}生长 ${q.progress}%`));
    })(),
    active:
      document.querySelector('[data-topia-location="garden"].active') !== null,
    canvasLabel: document
      .querySelector("#topia-canvas")
      ?.getAttribute("aria-label"),
    progressLabels: [
      ...document.querySelectorAll('[data-topia-landmark^="crop-"]'),
    ].map((item) => item.textContent),
    souvenirCount: Number(
      document
        .querySelector(".world")
        ?.getAttribute("data-topia-souvenir-count"),
    ),
    minSouvenirMeshes: Number(
      document.querySelector("#topia-canvas")?.dataset
        .topiaSouvenirMinMeshCount,
    ),
  }), topiaFixture);
  if (
    gardenAudit.crops !== gardenAudit.expectedProgress.length ||
    !gardenAudit.active ||
    gardenAudit.canvasLabel !== "菜地三维场景" ||
    !gardenAudit.expectedProgress.every((value) => gardenAudit.progressLabels.some(label => label?.includes(value))) ||
    gardenAudit.souvenirCount < 4 ||
    gardenAudit.minSouvenirMeshes < 8
  )
    throw new Error(
      `Topia garden audit failed: ${JSON.stringify(gardenAudit)}`,
    );
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-topia-garden.png"),
  });
  const gardenCanvas = await page.locator("#topia-canvas").boundingBox();
  if (!gardenCanvas) throw new Error("garden canvas has no bounds");
  await page.mouse.move(
    gardenCanvas.x + gardenCanvas.width * 0.82,
    gardenCanvas.y + gardenCanvas.height * 0.82,
  );
  await page.mouse.wheel(0, -650);
  await page.waitForTimeout(350);
  const firstCrop = page.locator('[data-topia-landmark^="crop-"]').first();
  const cropLandmarkId = await firstCrop.getAttribute('data-topia-landmark');
  const cropTaskId = topiaFixture.scenes.garden.landmarks.find(item => item.id === cropLandmarkId).taskIds[0];
  await firstCrop.click({force:true});
  await page.locator(`[data-related-task="${cropTaskId}"]`).waitFor();
  await page.locator(".topia-drawer [data-close-topia-drawer]").click();
  await page.locator('[data-topia-location="exterior"]').click();
  await page
    .locator(".world.webgl-ready.location-exterior")
    .waitFor({ timeout: 10000 });
  const souvenirRetentionAudit = await page.evaluate(() => ({
    count: Number(
      document
        .querySelector(".world")
        ?.getAttribute("data-topia-souvenir-count"),
    ),
    kinds: document
      .querySelector(".world")
      ?.getAttribute("data-topia-souvenir-kinds"),
    models: Number(
      document.querySelector("#topia-canvas")?.dataset.topiaSouvenirModelCount,
    ),
  }));
  if (
    souvenirRetentionAudit.count !== topiaAudit.souvenirCount ||
    souvenirRetentionAudit.kinds !== topiaAudit.souvenirKinds.join(",") ||
    souvenirRetentionAudit.models !== topiaAudit.souvenirModels
  )
    throw new Error(
      `souvenirs were not retained across scenes: ${JSON.stringify(souvenirRetentionAudit)}`,
    );
  await page.evaluate(() => {
    const previous = window.__TAURI_INTERNALS__;
    let finish;
    window.__TAURI_INTERNALS__ = {
      ...previous,
      invoke: (command, args) => {
        if (command === "listen_mood")
          return new Promise((resolve) => {
            finish = resolve;
          });
        if (
          command === "finish_mood_listen" ||
          command === "cancel_mood_listen"
        )
          return Promise.resolve();
        return (
          previous?.invoke?.(command, args) ??
          Promise.reject(new Error(`unmocked command: ${command}`))
        );
      },
    };
    window.__finishQuickVoiceTest = () =>
      finish?.({ transcript: "明天整理旅行照片" });
  });
  await page.locator("#record-conversation").click();
  await page.locator(".conversation-person-dialog").waitFor();
  const conversationPickerAudit = await page.evaluate(() => ({
    title: document.querySelector("#conversation-person-title")?.textContent,
    people: document.querySelectorAll(".conversation-person-list > button")
      .length,
    unknown: Boolean(document.querySelector(".conversation-unknown")),
    autoStarted: Boolean(
      document.querySelector("#record-conversation.is-listening"),
    ),
  }));
  if (
    conversationPickerAudit.title !== "你正在和谁对话？" ||
    conversationPickerAudit.people < 4 ||
    !conversationPickerAudit.unknown ||
    conversationPickerAudit.autoStarted
  )
    throw new Error(
      `conversation picker audit failed: ${JSON.stringify(conversationPickerAudit)}`,
    );
  await page.locator('[aria-label="关闭人物选择"]').click();
  await page.locator("#record-task").click();
  await page.locator("#record-task.is-listening").waitFor();
  const quickListeningAudit = await page.evaluate(() => ({
    dialogCount: document.querySelectorAll('.mood-dialog[role="dialog"]')
      .length,
    taskIcon: document
      .querySelector("#record-task svg")
      ?.getAttribute("data-lucide"),
    taskDisabled: document.querySelector("#record-task")?.disabled,
    moodDisabled: document.querySelector("#record-mood")?.disabled,
    toastVisible: document.querySelector(".toast")?.classList.contains("show"),
  }));
  if (
    quickListeningAudit.dialogCount ||
    quickListeningAudit.taskIcon !== "Square" ||
    quickListeningAudit.taskDisabled ||
    !quickListeningAudit.moodDisabled ||
    quickListeningAudit.toastVisible
  )
    throw new Error(
      `quick voice listening audit failed: ${JSON.stringify(quickListeningAudit)}`,
    );
  await page.locator("#record-task").click();
  await page.locator("#record-task.is-processing").waitFor();
  const quickProcessingAudit = await page.evaluate(() => ({
    taskIcon: document
      .querySelector("#record-task svg")
      ?.getAttribute("data-lucide"),
    taskDisabled: document.querySelector("#record-task")?.disabled,
    moodDisabled: document.querySelector("#record-mood")?.disabled,
    animation: getComputedStyle(document.querySelector("#record-task svg"))
      .animationName,
  }));
  if (
    quickProcessingAudit.taskIcon !== "LoaderCircle" ||
    !quickProcessingAudit.taskDisabled ||
    !quickProcessingAudit.moodDisabled ||
    quickProcessingAudit.animation === "none"
  )
    throw new Error(
      `quick voice processing audit failed: ${JSON.stringify(quickProcessingAudit)}`,
    );
  await page.evaluate(() => window.__finishQuickVoiceTest());
  await page.locator(".toast.show").waitFor();
  const quickSuccessAudit = await page.evaluate(() => ({
    message: document.querySelector(".toast.show")?.textContent,
    taskEnabled: !document.querySelector("#record-task")?.disabled,
    moodEnabled: !document.querySelector("#record-mood")?.disabled,
    dialogCount: document.querySelectorAll('.mood-dialog[role="dialog"]')
      .length,
  }));
  if (
    !quickSuccessAudit.message?.includes("已记录") ||
    !quickSuccessAudit.taskEnabled ||
    !quickSuccessAudit.moodEnabled ||
    quickSuccessAudit.dialogCount
  )
    throw new Error(
      `quick voice success audit failed: ${JSON.stringify(quickSuccessAudit)}`,
    );
  await page.evaluate(() => {
    const previousInvoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) =>
      command === "listen_mood"
        ? Promise.reject(new Error("麦克风不可用"))
        : previousInvoke(command, args);
  });
  await page.locator("#record-mood").click();
  await page.waitForFunction(() =>
    document
      .querySelector(".toast.show")
      ?.textContent?.includes("心情记录失败"),
  );
  const quickErrorAudit = await page.evaluate(() => ({
    message: document.querySelector(".toast.show")?.textContent,
    taskEnabled: !document.querySelector("#record-task")?.disabled,
    moodEnabled: !document.querySelector("#record-mood")?.disabled,
    dialogCount: document.querySelectorAll('.mood-dialog[role="dialog"]')
      .length,
  }));
  if (
    !quickErrorAudit.message?.includes("麦克风不可用") ||
    !quickErrorAudit.taskEnabled ||
    !quickErrorAudit.moodEnabled ||
    quickErrorAudit.dialogCount
  )
    throw new Error(
      `quick voice error audit failed: ${JSON.stringify(quickErrorAudit)}`,
    );
  await page.evaluate(() =>
    localStorage.setItem(
      "realtopia.mood",
      JSON.stringify({
        mood: "sad",
        intensity: 84,
        summary: "今天有一点失落",
        support: "先允许自己慢下来。",
        transcript: "测试心情",
        model: "test-model",
        analyzedAt: new Date().toISOString(),
      }),
    ),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".world.webgl-ready.mood-sad").waitFor({ timeout: 10000 });
  const moodEffectAudit = await page.evaluate(() => {
    const indicator = document.querySelector(".mood-indicator"),
      world = document.querySelector(".world");
    const box = indicator?.getBoundingClientRect(),
      worldBox = world?.getBoundingClientRect();
    return {
      rainDrops: document.querySelectorAll(".mood-weather.mood-sad i").length,
      emoji: indicator?.textContent ?? "",
      label: indicator?.getAttribute("aria-label") ?? "",
      topGap: box && worldBox ? box.top - worldBox.top : 999,
      rightGap: box && worldBox ? worldBox.right - box.right : 999,
      storedMood: JSON.parse(localStorage.getItem("realtopia.mood") ?? "null")
        ?.mood,
    };
  });
  if (
    moodEffectAudit.rainDrops < 20 ||
    moodEffectAudit.emoji !== "😢" ||
    !moodEffectAudit.label.includes("难过") ||
    moodEffectAudit.topGap > 20 ||
    moodEffectAudit.rightGap > 20 ||
    moodEffectAudit.storedMood !== "sad"
  )
    throw new Error(
      `mood effect audit failed: ${JSON.stringify(moodEffectAudit)}`,
    );
  const canvas = page.locator("#topia-canvas"),
    box = await canvas.boundingBox();
  if (!box) throw new Error("Topia canvas has no bounds");
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.62, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForTimeout(2100);
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-topia-device-viewport.png"),
  });
  await page.locator('.top [data-tab="people"]').click();
  await page.locator(".people").waitFor();
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-people-device-viewport.png"),
  });
  const peopleAudit = await page.evaluate(() => {
    const title = document
        .querySelector(".p-list-head h1")
        .getBoundingClientRect(),
      filters = document
        .querySelector(".p-list-head .chips")
        .getBoundingClientRect(),
      list = document.querySelector(".p-list").getBoundingClientRect(),
      grid = document.querySelector(".p-grid").getBoundingClientRect(),
      enroll = document.querySelector("#enroll-person").getBoundingClientRect();
    return {
      columns: getComputedStyle(
        document.querySelector(".people"),
      ).gridTemplateColumns.split(" ").length,
      detachedHero: document.querySelectorAll(".people > .p-hero").length,
      cardShadow: getComputedStyle(document.querySelector(".p-card")).boxShadow,
      filterRightOfTitle: filters.left >= title.right - 1,
      filterSameRow:
        Math.abs(
          filters.top + filters.height / 2 - (title.top + title.height / 2),
        ) < 12,
      heroPortraits: document.querySelectorAll(".p-hero .portrait.big").length,
      enrollOutsideGrid:
        document.querySelector("#enroll-person").parentElement ===
          document.querySelector(".p-list") && enroll.top >= grid.bottom,
      enrollAtBottom: list.bottom - enroll.bottom < 12,
      strangerInbox: (() => {
        const inbox = document.querySelector(".stranger-inbox");
        const box = inbox.getBoundingClientRect();
        return {
          title: inbox.querySelector("b")?.textContent,
          subtitle: inbox.querySelector("small")?.textContent?.trim(),
          tagCount: inbox.querySelectorAll("em").length,
          iconCount: inbox.querySelectorAll("svg").length,
          fits:
            inbox.scrollWidth <= inbox.clientWidth &&
            inbox.scrollHeight <= inbox.clientHeight,
          insideList: box.left >= list.left && box.right <= list.right,
        };
      })(),
    };
  });
  if (
    peopleAudit.columns !== 2 ||
    peopleAudit.detachedHero !== 0 ||
    peopleAudit.cardShadow !== "none" ||
    !peopleAudit.filterRightOfTitle ||
    !peopleAudit.filterSameRow ||
    peopleAudit.heroPortraits !== 1 ||
    !peopleAudit.enrollOutsideGrid ||
    !peopleAudit.enrollAtBottom ||
    peopleAudit.strangerInbox.title !== "最近陌生人" ||
    !/^\d+ 人待标记$/.test(peopleAudit.strangerInbox.subtitle ?? "") ||
    peopleAudit.strangerInbox.tagCount !== 0 ||
    peopleAudit.strangerInbox.iconCount !== 0 ||
    !peopleAudit.strangerInbox.fits ||
    !peopleAudit.strangerInbox.insideList
  )
    throw new Error(
      `people layout audit failed: ${JSON.stringify(peopleAudit)}`,
    );
  await page.locator('.top [data-tab="settings"]').click();
  await page.locator(".settings").waitFor();
  await page.screenshot({
    path: path.join(
      root,
      "artifacts/mockups/phone-settings-device-viewport.png",
    ),
  });
  await page.locator('[data-setting="intelligence"]').click();
  await page.getByRole("heading", { name: "智能", exact: true }).waitFor();
  const intelligenceAudit = await page.evaluate(() => {
    const active = document.querySelector(
      '.settings-route-cache[data-route-active="true"]',
    );
    return {
      stats: active.querySelectorAll(".setting-view .stats").length,
      decorativeSummary: /<1 MB|规则规划器|响应速度|可用状态/.test(
        active.innerText,
      ),
      forbiddenPrompt:
        /任务拆分|云端失败|端侧任务回退|prompt|提示词|物理按钮即时拍摄|自动提炼/i.test(
          active.innerText,
        ),
      passiveNotes: active.querySelectorAll(
        ".model-download-note,.setting-view .row",
      ).length,
      modelRowsWithoutAction: [
        ...active.querySelectorAll(".model-download"),
      ].filter((row) => !row.querySelector("button")).length,
      placeholderCount: active.querySelectorAll("input[placeholder]").length,
      contentBackground: getComputedStyle(document.querySelector(".s-content"))
        .backgroundColor,
      modelIconFilter: getComputedStyle(
        active.querySelector(".model-icon.cloud-model"),
      ).filter,
    };
  });
  if (
    intelligenceAudit.stats ||
    intelligenceAudit.decorativeSummary ||
    intelligenceAudit.forbiddenPrompt ||
    intelligenceAudit.passiveNotes ||
    intelligenceAudit.modelRowsWithoutAction ||
    intelligenceAudit.placeholderCount ||
    intelligenceAudit.contentBackground === "rgba(0, 0, 0, 0)" ||
    intelligenceAudit.modelIconFilter !== "none"
  )
    throw new Error(
      `intelligence page audit failed: ${JSON.stringify(intelligenceAudit)}`,
    );
  await page.screenshot({
    path: path.join(
      root,
      "artifacts/mockups/phone-intelligence-device-viewport.png",
    ),
  });
  await page.locator('[data-setting="memory"]').click();
  await page.getByRole("heading", { name: "记忆", exact: true }).waitFor();
  const settingsDecorationAudit = await page.evaluate(() => {
    const active = document.querySelector(
      '.settings-route-cache[data-route-active="true"]',
    );
    const gaps = [...active.querySelectorAll(".s-card")].map((card) => {
      const title = card.querySelector("h3"),
        content = title?.nextElementSibling;
      return title && content
        ? content.getBoundingClientRect().top -
            title.getBoundingClientRect().bottom
        : 999;
    });
    return {
      stats: active.querySelectorAll(".stats").length,
      cardSummaries: active.querySelectorAll(".s-card > p").length,
      headerSummaries: active.querySelectorAll(".setting-head > p").length,
      navSummaries: document.querySelectorAll(".settings .s-nav nav small")
        .length,
      passiveNotes: active.querySelectorAll(".model-download-note,.row").length,
      minTitleGap: Math.min(...gaps),
    };
  });
  if (
    settingsDecorationAudit.stats ||
    settingsDecorationAudit.cardSummaries ||
    settingsDecorationAudit.headerSummaries ||
    settingsDecorationAudit.navSummaries ||
    settingsDecorationAudit.passiveNotes ||
    settingsDecorationAudit.minTitleGap < 11
  )
    throw new Error(
      `settings still contain decorative summaries: ${JSON.stringify(settingsDecorationAudit)}`,
    );
  await page.screenshot({
    path: path.join(root, "artifacts/mockups/phone-memory-device-viewport.png"),
  });
  await page.locator(".mem-list button").first().click();
  await page.locator(".memory-drawer").waitFor();
  const memoryDrawerAudit = await page.evaluate(() => {
    const drawer = document
        .querySelector(".memory-drawer")
        .getBoundingClientRect(),
      header = document.querySelector(".top").getBoundingClientRect();
    return {
      inlineDetails: document.querySelectorAll(".memory-manager .memory-detail")
        .length,
      top: drawer.top,
      bottom: drawer.bottom,
      right: drawer.right,
      width: drawer.width,
      headerBottom: header.bottom,
      viewport: [innerWidth, innerHeight],
    };
  });
  if (
    memoryDrawerAudit.inlineDetails ||
    memoryDrawerAudit.top < memoryDrawerAudit.headerBottom - 1 ||
    memoryDrawerAudit.bottom > memoryDrawerAudit.viewport[1] + 1 ||
    memoryDrawerAudit.right > memoryDrawerAudit.viewport[0] + 1 ||
    memoryDrawerAudit.width >= memoryDrawerAudit.viewport[0]
  )
    throw new Error(
      `memory drawer exceeds viewport: ${JSON.stringify(memoryDrawerAudit)}`,
    );
  await page.screenshot({
    path: path.join(
      root,
      "artifacts/mockups/phone-memory-drawer-device-viewport.png",
    ),
  });
  await page.locator(".drawer-head [data-close-memory]").click();
  await page.locator('[data-setting="testing"]').click();
  await page.getByRole("heading", { name: "测试", exact: true }).waitFor();
  const deleteUserDataAudit = await page.evaluate(() => {
    const button = document.querySelector("#delete-user-data");
    return {
      count: document.querySelectorAll("#delete-user-data").length,
      label: button?.textContent?.trim(),
      enabled: button instanceof HTMLButtonElement && !button.disabled,
      danger: button?.classList.contains("danger"),
    };
  });
  if (
    deleteUserDataAudit.count !== 1 ||
    deleteUserDataAudit.label !== "删除用户数据" ||
    !deleteUserDataAudit.enabled ||
    !deleteUserDataAudit.danger
  )
    throw new Error(
      `delete user data control audit failed: ${JSON.stringify(deleteUserDataAudit)}`,
    );
  const promptAudit = [];
  for (const screen of [
    "topia",
    "quests",
    "people",
    "glasses",
    "intelligence",
    "memory",
    "testing",
  ]) {
    await page.goto(`${base}/?screen=${screen}`, { waitUntil: "networkidle" });
    promptAudit.push(
      await page.evaluate(
        (name) => ({
          screen: name,
          forbidden:
            /任务拆分|云端失败|端侧任务回退|拖动查看|双指缩放|prompt|提示词/i.test(
              document.body.innerText,
            ),
          controls: document.querySelectorAll(
            ".voice,#voice-input,#plan-goal,input[placeholder]",
          ).length,
        }),
        screen,
      ),
    );
  }
  if (promptAudit.some((item) => item.forbidden || item.controls))
    throw new Error(
      `visible prompt audit failed: ${JSON.stringify(promptAudit)}`,
    );
  await page.evaluate(() =>
    localStorage.setItem(
      "realtopia.topiaWorld.v1",
      JSON.stringify({
        schemaVersion: 1,
        id: "dynamic-world-smoke",
        ownerId: "smoke-user",
        revision: 7,
        generatedAt: "2026-08-10T00:00:00.000Z",
        source: "cloud",
        profile: {
          homeName: "测试灯塔",
          archetype: "自动化测试世界",
          traits: ["清晰"],
          experiences: ["动态加载"],
          accentColors: [7108863, 16745106, 6935715],
        },
        scenes: {
          exterior: {
            camera: { yaw: 0.2, pitch: 0.5 },
            objects: [
              {
                id: "custom-lighthouse",
                prefab: "block",
                position: [0, 1, 0],
                scale: [1, 2, 1],
                colors: [16745106],
                anchorId: "custom-memory-anchor",
              },
            ],
            landmarks: [
              {
                id: "custom-memory",
                anchorId: "custom-memory-anchor",
                location: "exterior",
                emoji: "🔆",
                label: "只属于测试用户的灯塔",
                eyebrow: "动态世界",
                description: "由持久化配置替换默认房屋。",
                fallbackPlacement: { left: "50%", top: "40%" },
                memoryIds: [],
                taskIds: [],
                personIds: [],
              },
            ],
          },
          interior: {
            camera: { yaw: 0.3, pitch: 0.5 },
            objects: [
              { id: "custom-room", prefab: "room-shell", position: [0, 0, 0] },
            ],
            landmarks: [],
          },
          garden: {
            camera: { yaw: 0.4, pitch: 0.6 },
            objects: [
              {
                id: "custom-garden",
                prefab: "floating-island",
                position: [0, 0, 0],
                params: { radius: 2, depth: 1 },
              },
            ],
            landmarks: [],
          },
        },
        generation: {
          provider: "smoke-provider",
          model: "smoke-model",
          promptVersion: "topia-world-v1",
        },
      }),
    ),
  );
  await page.goto(`${base}/?screen=topia`, { waitUntil: "networkidle" });
  await page
    .locator('.world.webgl-ready[data-topia-world="dynamic-world-smoke"]')
    .waitFor({ timeout: 10000 });
  const dynamicWorldAudit = await page.evaluate(() => {
    const world = document.querySelector(".world");
    return {
      id: world?.getAttribute("data-topia-world"),
      source: world?.getAttribute("data-topia-world-source"),
      objects: Number(world?.getAttribute("data-topia-object-count")),
      souvenirCount: Number(world?.getAttribute("data-topia-souvenir-count")),
      souvenirKinds: world?.getAttribute("data-topia-souvenir-kinds"),
      souvenirModels: Number(
        document.querySelector("#topia-canvas")?.dataset
          .topiaSouvenirModelCount,
      ),
      customTag: document.querySelector('[data-topia-landmark="custom-memory"]')
        ?.textContent,
      promptVisible:
        /<user_profile>|Generate a distinct world|Required JSON shape/.test(
          document.body.innerText,
        ),
    };
  });
  if (
    dynamicWorldAudit.id !== "dynamic-world-smoke" ||
    dynamicWorldAudit.source !== "cloud" ||
    dynamicWorldAudit.objects !== 1 + dynamicWorldAudit.souvenirCount ||
    dynamicWorldAudit.souvenirCount < 1 ||
    dynamicWorldAudit.souvenirModels !== dynamicWorldAudit.souvenirCount ||
    !dynamicWorldAudit.customTag?.includes("只属于测试用户的灯塔") ||
    dynamicWorldAudit.promptVisible
  )
    throw new Error(
      `dynamic Topia world audit failed: ${JSON.stringify(dynamicWorldAudit)}`,
    );
  const dynamicSceneSouvenirIds=await collectSceneSouvenirIds();
  if(JSON.stringify(dynamicSceneSouvenirIds)!==JSON.stringify(originalSceneSouvenirIds))throw new Error('world switch must preserve the entire collection across all scenes, not necessarily the same display slots');
  await page.evaluate(() => localStorage.removeItem("realtopia.topiaWorld.v1"));
  if (consoleErrors.length || httpErrors.length)
    throw new Error(
      `browser errors: ${[...consoleErrors, ...httpErrors].join(" | ")}`,
    );
  process.stdout.write(
    `${JSON.stringify({ ok: true, gameplayAudit, souvenirAudit, souvenirSceneAudit, souvenirPreviewAudit, souvenirRetentionAudit, visualAudit, topiaAudit, moodPickerAudit, topiaStudioAudit, anchorAudit, interiorDrawerAudit, gardenAudit, conversationPickerAudit, quickListeningAudit, quickProcessingAudit, quickSuccessAudit, quickErrorAudit, moodEffectAudit, filterAudit, peopleAudit, intelligenceAudit, settingsDecorationAudit, memoryPaginationAudit, memoryDrawerAudit, promptAudit, dynamicWorldAudit })}\n`,
  );
} finally {
  await browser.close();
  preview?.kill("SIGTERM");
}
