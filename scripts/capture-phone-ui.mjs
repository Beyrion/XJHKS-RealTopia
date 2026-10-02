import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "../phone/app/node_modules/playwright-core/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "phone/app");
const baseUrl = process.env.REALTOPIA_PREVIEW_URL ?? "http://127.0.0.1:4173";
const outputDir = path.resolve(
  root,
  process.env.REALTOPIA_SCREENSHOT_DIR ?? "artifacts/ui-baseline",
);

async function isReachable() {
  try {
    return (await fetch(baseUrl)).ok;
  } catch {
    return false;
  }
}

let preview;
if (!(await isReachable())) {
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

  let startupOutput = "";
  preview.stdout.on("data", (chunk) => (startupOutput += chunk.toString()));
  preview.stderr.on("data", (chunk) => (startupOutput += chunk.toString()));

  for (let attempt = 0; attempt < 80 && !(await isReachable()); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!(await isReachable())) {
    preview.kill("SIGTERM");
    throw new Error(`preview server did not start: ${startupOutput.trim()}`);
  }
}

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 800, height: 361 },
  deviceScaleFactor: 1,
});

async function open(screen) {
  await page.goto(`${baseUrl}/?screen=${screen}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
}

async function capture(name) {
  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    fullPage: true,
  });
}

try {
  await open("topia");
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".world.webgl-ready").waitFor({ timeout: 10_000 });
  await capture("topia");

  await page.evaluate(() => {
    const previous = window.__TAURI_INTERNALS__;
    window.__TAURI_INTERNALS__ = {
      ...previous,
      invoke: (command, args) => {
        if (command === "listen_mood") return new Promise(() => undefined);
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
  });
  await page.locator("#record-mood").click();
  await page.locator("#record-mood.is-listening").waitFor();
  await capture("topia-mood-listening");
  await page.locator("#record-mood").click();
  await page.locator("#record-mood.is-processing").waitFor();
  await capture("topia-mood-processing");

  for (const screen of [
    "quests",
    "people",
    "glasses",
    "intelligence",
    "testing",
  ]) {
    await open(screen);
    await capture(
      screen === "glasses"
        ? "settings-glasses"
        : screen === "intelligence"
          ? "settings-intelligence"
          : screen === "testing"
            ? "settings-testing"
            : screen,
    );
  }

  await page.evaluate(() => {
    localStorage.setItem(
      "realtopia.memories",
      JSON.stringify(
        Array.from({ length: 45 }, (_, index) => ({
          id: `baseline-${index}`,
          time: `08.${String(index + 1).padStart(2, "0")}`,
          title:
            index === 0
              ? "青苔书店的下午"
              : `记忆条目 ${String(index + 1).padStart(2, "0")}`,
          meta: `人物与任务关联 · 第 ${index + 1} 条`,
          kind: index % 4 === 0 ? "mood" : "recording",
          summary: "用于重构前后视觉回归的固定记忆摘要。",
          transcript: "这是自动化截图使用的固定对话文本。",
        })),
      ),
    );
  });
  await open("memory");
  await capture("settings-memory");
  await page.locator(".mem-list button").first().click();
  await page.locator(".memory-drawer").waitFor();
  await capture("settings-memory-drawer");

  console.log(`Captured phone UI reference images in ${outputDir}`);
} finally {
  await browser.close();
  preview?.kill("SIGTERM");
}
