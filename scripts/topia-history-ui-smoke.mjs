import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../phone/app/node_modules/playwright-core/index.mjs";
import { installTopiaCommandMock } from "./topia-command-mock.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const world = JSON.parse(
  await readFile(
    path.join(root, "phone/app/src-tauri/src/topia/mock_world.json"),
    "utf8",
  ),
);
const browser = await chromium.launch({
  executablePath:
    process.env.REALTOPIA_CHROME ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 754, height: 347 } });
  await installTopiaCommandMock(page, root, world);
  await page.addInitScript((world) => {
    if (localStorage.getItem("realtopia.topiaStudio.v2")) return;
    world.id = "history-current";
    const worlds = ["history-current", "history-other", "preset-test"].map(
      (id, index) => ({
        id,
        homeName: `测试世界 ${index + 1}`,
        archetype: "测试",
        generatedAt: `2026-10-0${3 - index}T00:00:00Z`,
        active: index === 0,
        source: index === 2 ? "mock" : "cloud",
      }),
    );
    localStorage.setItem("realtopia.topiaWorld.v1", JSON.stringify(world));
    localStorage.setItem(
      "realtopia.topiaStudio.v2",
      JSON.stringify({
        activeWorldId: world.id,
        worlds,
        needsOnboarding: false,
        lastProfile: {
          summary: "模拟真机保存的个人世界配置",
          traits: ["收藏故事的旅人"],
        },
        assets: {
          objects: { exterior: [], interior: [], garden: [] },
          landmarks: { exterior: [], interior: [], garden: [] },
          memories: [],
        },
      }),
    );
    localStorage.setItem("realtopia.migration.roster-20261002.v2", "done");
  }, world);
  await page.goto(
    process.env.REALTOPIA_PREVIEW_URL ?? "http://127.0.0.1:4173",
    { waitUntil: "networkidle" },
  );
  const openHistory = async () => {
    await page
      .getByRole("button", { name: "打开 Topia 工坊", exact: true })
      .click();
    await page.getByRole("button", { name: "从历史选择", exact: true }).click();
  };
  const card = (id) => page.locator(`[data-topia-history-id="${id}"]`);
  const hold = async (id, move = false) => {
    await card(id).scrollIntoViewIfNeeded();
    const box = await card(id).boundingBox();
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    if (move) await page.mouse.move(x + 20, y);
    await page.waitForTimeout(700);
    await page.mouse.up();
  };
  await openHistory();
  await hold("history-other", true);
  assert.equal(
    await page.getByRole("alertdialog").count(),
    0,
    "scroll gesture must cancel long press",
  );
  await hold("history-other");
  await page.getByRole("alertdialog").waitFor();
  assert.equal(
    await page.locator("[data-topia-world]").getAttribute("data-topia-world"),
    "history-current",
    "long press must not switch worlds",
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(
    await card("history-other").count(),
    1,
    "cancel must preserve world",
  );
  await hold("history-other");
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) =>
      command === "delete_topia_world" && window.failDelete
        ? Promise.reject(new Error("测试写入失败"))
        : invoke(command, args);
    window.failDelete = true;
  });
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "测试写入失败" }).waitFor();
  assert.equal(
    await card("history-other").count(),
    1,
    "failed deletion must preserve world",
  );
  await page.evaluate(() => {
    window.failDelete = false;
  });
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await card("history-other").waitFor({ state: "detached" });
  assert.equal(
    await page.locator(".topia-history-view").count(),
    1,
    "deleting a world must keep remaining history visible after profile refresh",
  );
  assert.equal(await card("history-current").count(), 1);
  await page.reload({ waitUntil: "networkidle" });
  await openHistory();
  assert.equal(
    await card("history-other").count(),
    0,
    "deleted world must stay absent after reload",
  );
  await hold("history-current");
  await page.screenshot({
    path: "/private/tmp/realtopia-topia-delete-confirm.png",
  });
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await card("history-current").waitFor({ state: "detached" });
  assert.equal(
    await page.locator(".topia-history-view").count(),
    1,
    "deleting the active world must keep remaining history visible",
  );
  assert.equal(
    await page.locator("[data-topia-world]").getAttribute("data-topia-world"),
    "preset-test",
    "deleting current world must select remaining world",
  );
  await hold("preset-test");
  assert.equal(
    await page.getByRole("button", { name: "删除", exact: true }).isDisabled(),
    true,
    "last world must be retained",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("alertdialog").waitFor({ state: "detached" });
  await page.evaluate(async () => {
    const payload = await window.__TAURI_INTERNALS__.invoke(
      "load_topia_world",
      {
        context: {},
      },
    );
    payload.studio.worlds = [];
    window.dispatchEvent(
      new CustomEvent("realtopia:topia-world", { detail: payload }),
    );
  });
  await page.locator(".topia-entry-choice").waitFor();
  assert.equal(
    await page.locator(".topia-history-view").count(),
    0,
    "empty history must return to the entry choices",
  );
  console.log(
    "Topia history UI passed: long press, scroll cancellation, cancel, failure, deletion stays in history, reload, current-world switch, last-world guard, empty-history return.",
  );
} finally {
  await browser.close();
}
