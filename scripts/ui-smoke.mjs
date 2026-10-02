import { chromium } from "../phone/app/node_modules/playwright-core/index.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { installTopiaCommandMock } from "./topia-command-mock.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.REALTOPIA_PREVIEW_URL ?? "http://127.0.0.1:4173";
const appDir = path.join(root, "phone/app");
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
  executablePath: "/usr/bin/google-chrome",
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
  await page.goto(`${base}/?screen=quests`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
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
  const initialTitle = await page.locator(".q-detail > h1").textContent();
  await page.locator(".q-item").nth(1).click();
  if ((await page.locator(".q-detail > h1").textContent()) === initialTitle)
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
  await page.locator(".step").nth(0).click();
  await page.locator(".step").nth(1).click();
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem("realtopia.gameEvents.v1") ?? "[]").some(
      (event) => event.type === "task_completed" && event.questId === "book",
    ),
  );
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
      title: size(".q-detail > h1"),
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
      quickActionHeight: actions.querySelector("button").getBoundingClientRect()
        .height,
      quickActionsOutsideToday: !panel.contains(actions),
      quickActionsAboveToday: actionsBox.bottom <= panelBox.top,
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
    };
  });
  if (
    !topiaAudit.panelFits ||
    topiaAudit.weatherIconCount ||
    topiaAudit.interactionPromptCount ||
    topiaAudit.hasInteractionPrompt ||
    topiaAudit.quickActions !== 2 ||
    topiaAudit.quickActionHeight < 40 ||
    !topiaAudit.quickActionsOutsideToday ||
    !topiaAudit.quickActionsAboveToday ||
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
    !topiaAudit.focusProgress?.endsWith("%")
  )
    throw new Error(`Topia audit failed: ${JSON.stringify(topiaAudit)}`);
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
  }));
  await page.mouse.wheel(0, 650);
  await page.waitForTimeout(350);
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
    !anchorAudit.zoomedVisible ||
    anchorAudit.zoomedCollapsed ||
    anchorAudit.shrunkOpacity < 0.95 ||
    anchorAudit.shrunkPointerEvents !== "auto" ||
    anchorAudit.shrunkVisible ||
    !anchorAudit.shrunkCollapsed
  )
    throw new Error(
      `Topia zoom label audit failed: ${JSON.stringify(anchorAudit)}`,
    );
  await anchoredLabel.click();
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
  await page.locator('[data-topia-landmark="window-garden"]').click();
  await page.locator('.topia-drawer[role="dialog"]').waitFor();
  const interiorDrawerAudit = await page.evaluate(() => ({
    title: document.querySelector("#topia-landmark-title")?.textContent,
    task: document.querySelector('[data-related-task="garden"]')?.textContent,
    person: document.querySelector('[data-related-person="lin"]')?.textContent,
    inside: document
      .querySelector(".topia-drawer")
      ?.contains(document.querySelector(".topia-relations")),
  }));
  if (
    interiorDrawerAudit.title !== "窗边花圃" ||
    !interiorDrawerAudit.task?.includes("让阳台重新生长") ||
    !interiorDrawerAudit.person?.includes("林澄") ||
    !interiorDrawerAudit.inside
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
  const gardenAudit = await page.evaluate(() => ({
    crops: document.querySelectorAll('[data-topia-landmark^="crop-"]').length,
    active:
      document.querySelector('[data-topia-location="garden"].active') !== null,
    canvasLabel: document
      .querySelector("#topia-canvas")
      ?.getAttribute("aria-label"),
    progressLabels: [
      ...document.querySelectorAll('[data-topia-landmark^="crop-"]'),
    ].map((item) => item.textContent),
  }));
  if (
    gardenAudit.crops !== 5 ||
    !gardenAudit.active ||
    gardenAudit.canvasLabel !== "菜地三维场景" ||
    !gardenAudit.progressLabels.some((value) => value?.includes("68%"))
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
  await page.locator('[data-topia-landmark="crop-app"]').click();
  await page.locator('[data-related-task="app"]').waitFor();
  await page.locator(".topia-drawer [data-close-topia-drawer]").click();
  await page.locator('[data-topia-location="exterior"]').click();
  await page
    .locator(".world.webgl-ready.location-exterior")
    .waitFor({ timeout: 10000 });
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
    !peopleAudit.enrollAtBottom
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
  const intelligenceAudit = await page.evaluate(() => ({
    stats: document.querySelectorAll(".setting-view .stats").length,
    decorativeSummary: /<1 MB|规则规划器|响应速度|可用状态/.test(
      document.body.innerText,
    ),
    forbiddenPrompt:
      /任务拆分|云端失败|端侧任务回退|prompt|提示词|物理按钮即时拍摄|自动提炼/i.test(
        document.body.innerText,
      ),
    passiveNotes: document.querySelectorAll(
      ".model-download-note,.setting-view .row",
    ).length,
    modelRowsWithoutAction: [
      ...document.querySelectorAll(".model-download"),
    ].filter((row) => !row.querySelector("button")).length,
    placeholderCount: document.querySelectorAll("input[placeholder]").length,
    contentBackground: getComputedStyle(document.querySelector(".s-content"))
      .backgroundColor,
    modelIconFilter: getComputedStyle(
      document.querySelector(".model-icon.cloud-model"),
    ).filter,
  }));
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
    const gaps = [...document.querySelectorAll(".s-card")].map((card) => {
      const title = card.querySelector("h3"),
        content = title?.nextElementSibling;
      return title && content
        ? content.getBoundingClientRect().top -
            title.getBoundingClientRect().bottom
        : 999;
    });
    return {
      stats: document.querySelectorAll(".settings .stats").length,
      cardSummaries: document.querySelectorAll(".settings .s-card > p").length,
      headerSummaries: document.querySelectorAll(".settings .setting-head > p")
        .length,
      navSummaries: document.querySelectorAll(".settings .s-nav nav small")
        .length,
      passiveNotes: document.querySelectorAll(
        ".settings .model-download-note,.settings .row",
      ).length,
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
    dynamicWorldAudit.objects !== 1 ||
    !dynamicWorldAudit.customTag?.includes("只属于测试用户的灯塔") ||
    dynamicWorldAudit.promptVisible
  )
    throw new Error(
      `dynamic Topia world audit failed: ${JSON.stringify(dynamicWorldAudit)}`,
    );
  await page.evaluate(() => localStorage.removeItem("realtopia.topiaWorld.v1"));
  if (consoleErrors.length || httpErrors.length)
    throw new Error(
      `browser errors: ${[...consoleErrors, ...httpErrors].join(" | ")}`,
    );
  process.stdout.write(
    `${JSON.stringify({ ok: true, gameplayAudit, visualAudit, topiaAudit, anchorAudit, interiorDrawerAudit, gardenAudit, quickListeningAudit, quickProcessingAudit, quickSuccessAudit, quickErrorAudit, moodEffectAudit, filterAudit, peopleAudit, intelligenceAudit, settingsDecorationAudit, memoryPaginationAudit, memoryDrawerAudit, promptAudit, dynamicWorldAudit })}\n`,
  );
} finally {
  await browser.close();
  preview?.kill("SIGTERM");
}
