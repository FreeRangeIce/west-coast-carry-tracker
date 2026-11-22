#!/usr/bin/env node
/**
 * Focused checks for the 3x3 chip grid and first-load scroll fix.
 * Run from the repo root: node tests/check.cjs
 *
 * Optional env:
 *   PLAYWRIGHT_CORE  path to playwright-core (default: /workspace/pw-tools/node_modules/playwright-core)
 *   CHROME_PATH      chrome executable (default: /usr/bin/google-chrome)
 *   PORT             local static server port (default: 8860)
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { pathToFileURL } = require("url");

const root = path.resolve(__dirname, "..");
const pwPath =
  process.env.PLAYWRIGHT_CORE ||
  "/workspace/pw-tools/node_modules/playwright-core";
const chromePath = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const PORT = Number(process.env.PORT || 8860);

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? "PASS " : "FAIL ") + msg);
  if (!cond) fails++;
};

function sourceChecks() {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  ok(sw.includes('const CACHE = "carry-tracker-v21"'), "sw.js cache is carry-tracker-v21");
  ok(!sw.includes("carry-tracker-v20"), "sw.js no longer references v20");

  ok(
    /if \(fromUser\) \{\s*jumpToViewTop\(\);\s*revealTab\(activeTab\);\s*\}/.test(app),
    "revealTab and jumpToViewTop run only on fromUser"
  );
  ok(
    /if \(!fromUser\) pinPageToTop\(\);/.test(app),
    "initial showView pins the page to the top"
  );
  ok(!/tab\.scrollIntoView\(/.test(app), "scrollIntoView is not used on tabs");
  ok(/history\.scrollRestoration = "manual"/.test(app), "scrollRestoration is manual on init");
  ok(/requestAnimationFrame\(\(\) => \{\s*pinPageToTop\(\);/.test(app), "rAF pin after first showView");

  ok(
    /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(css),
    "tabs use a 3-column grid"
  );
  ok(/min-height:\s*44px/.test(css), "chips are at least 44px tall");
  ok(/background:\s*#e8c547/.test(css) && /color:\s*#111/.test(css), "active chip is gold with dark text");
  ok(!/\.tabs\s*\{[^}]*overflow-x:\s*auto/.test(css), "tab bar is not a horizontal scroller");
  ok(!/flex-wrap:\s*nowrap/.test(css), "tabs no longer force a single non-wrapping row");

  const labels = ["Ask", "California", "Oregon", "Nevada", "Washington", "Arizona", "Compare", "Litigation", "Updates"];
  for (const label of labels) {
    ok(html.includes(`>${label}</button>`), `HTML has ${label} tab`);
  }
  ok(/role="tablist"/.test(html) && (html.match(/role="tab"/g) || []).length === 9, "tablist with nine role=tab buttons");
  ok(/aria-selected="true"/.test(html) && /aria-selected="false"/.test(html), "aria-selected present on tabs");
}

function startServer() {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
  };
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = urlPath === "/" ? "/index.html" : urlPath;
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("not found");
      }
      res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

function rgbOf(color) {
  const m = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isGold(color) {
  const rgb = rgbOf(color);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  return r > 200 && g > 160 && g < 230 && b < 100;
}

function isDarkText(color) {
  const rgb = rgbOf(color);
  if (!rgb) return false;
  return rgb[0] < 40 && rgb[1] < 40 && rgb[2] < 40;
}

async function metrics(page) {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll(".tab")];
    const bar = document.querySelector(".tabs");
    const header = document.querySelector(".site-header");
    const stamp = document.querySelector(".reviewed-stamp");
    const h1 = document.querySelector(".site-header h1");
    const disclaimer = document.querySelector(".disclaimer");
    const main = document.querySelector(".main");
    const active = document.querySelector(".tab.active");
    const cs = (el) => getComputedStyle(el);
    const vis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.left < innerWidth && r.right > 0;
    };
    const fits = (el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1;
    const grid = bar ? cs(bar).gridTemplateColumns : "";
    return {
      scrollY: window.scrollY,
      scrollX: window.scrollX,
      docOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      bodyOverflowX: document.body.scrollWidth > document.body.clientWidth + 1,
      barOverflowX: bar ? bar.scrollWidth > bar.clientWidth + 1 : true,
      barDisplay: bar ? cs(bar).display : "",
      gridColumns: grid,
      gridColCount: grid.trim() ? grid.split(" ").filter(Boolean).length : 0,
      tabCount: tabs.length,
      labels: tabs.map((t) => t.textContent.trim()),
      tabHeights: tabs.map((t) => Math.round(t.getBoundingClientRect().height)),
      tabFits: Object.fromEntries(tabs.map((t) => [t.textContent.trim(), fits(t)])),
      tabAria: tabs.map((t) => ({
        view: t.dataset.view,
        selected: t.getAttribute("aria-selected"),
        tabIndex: t.tabIndex,
        active: t.classList.contains("active"),
      })),
      activeLabel: active ? active.textContent.trim() : null,
      activeBg: active ? cs(active).backgroundColor : null,
      activeColor: active ? cs(active).color : null,
      activeBorder: active ? cs(active).borderTopColor : null,
      headerTop: header ? header.getBoundingClientRect().top : null,
      headerVisible: vis(header) && vis(h1),
      stampVisible: vis(stamp),
      disclaimerVisible: vis(disclaimer),
      disclaimerTop: disclaimer ? disclaimer.getBoundingClientRect().top : null,
      mainPaddingTop: main ? parseFloat(cs(main).paddingTop) : 0,
      hash: location.hash,
      titleText: h1 ? h1.textContent.trim() : "",
      heading: document.querySelector(".state-hero h2, .ask-heading, .updates-heading, #view-litigation h2, .view h2")
        ? document.querySelector(".state-hero h2, .ask-heading, .updates-heading, #view-litigation h2, .view h2").textContent.trim()
        : (document.querySelector("main h2") || {}).textContent || "",
    };
  });
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector("#global-reviewed");
    return el && el.textContent && el.textContent.trim() !== "—";
  }, { timeout: 15000 });
  await page.waitForTimeout(80);
}

async function runBrowser() {
  const { chromium } = require(pwPath);
  const origin = `http://127.0.0.1:${PORT}`;
  const browser = await chromium.launch({ executablePath: chromePath });

  async function load(width, hash) {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      deviceScaleFactor: 2,
    });
    await page.goto(origin + (hash || "/"), { waitUntil: "networkidle" });
    await waitReady(page);
    // Give the second rAF pin a beat to settle
    await page.waitForTimeout(60);
    return page;
  }

  for (const width of [344, 411]) {
    // First load, no hash
    let page = await load(width, "/");
    let m = await metrics(page);
    ok(m.scrollY === 0, `${width} no-hash first load scrollY is 0 (got ${m.scrollY})`);
    ok(m.headerVisible, `${width} title is visible on first load`);
    ok(m.stampVisible, `${width} LAST REVIEWED stamp is visible on first load`);
    ok(m.headerTop !== null && m.headerTop >= -1 && m.headerTop < 8, `${width} header is at the top (top=${m.headerTop})`);
    ok(m.disclaimerTop > m.headerTop, `${width} disclaimer sits below the header, not at the very top`);
    ok(m.tabCount === 9, `${width} shows all nine chips`);
    ok(
      m.labels.join("|") === "Ask|California|Oregon|Nevada|Washington|Arizona|Compare|Litigation|Updates",
      `${width} chip labels in order`
    );
    ok(m.barDisplay === "grid" && m.gridColCount === 3, `${width} tab bar is a 3-column grid (${m.barDisplay}, ${m.gridColCount})`);
    ok(!m.docOverflowX && !m.bodyOverflowX && !m.barOverflowX, `${width} no horizontal overflow`);
    ok(m.tabHeights.every((h) => h >= 44), `${width} every chip is at least 44px tall (${m.tabHeights.join(",")})`);
    ok(m.tabFits.Washington, `${width} Washington fits inside its chip`);
    ok(m.tabFits.Litigation, `${width} Litigation fits inside its chip`);
    ok(Object.values(m.tabFits).every(Boolean), `${width} every chip label fits (${JSON.stringify(m.tabFits)})`);
    ok(isGold(m.activeBg) && isDarkText(m.activeColor), `${width} California chip is gold with dark text (bg=${m.activeBg}, color=${m.activeColor})`);
    ok(m.activeLabel === "California", `${width} default active chip is California`);
    ok(m.hash === "#ca", `${width} first load wrote #ca without scrolling`);
    ok(m.mainPaddingTop >= 16, `${width} clear space above content (padding-top=${m.mainPaddingTop})`);
    const outlined = await page.$$eval(".tab:not(.active)", (tabs) =>
      tabs.map((t) => {
        const cs = getComputedStyle(t);
        return { label: t.textContent.trim(), bg: cs.backgroundColor, border: cs.borderTopWidth, color: cs.color };
      })
    );
    ok(
      outlined.length === 8 && outlined.every((t) => parseFloat(t.border) >= 1 && !/rgb\(\s*232,\s*197,\s*71/.test(t.bg)),
      `${width} inactive chips are outlined, not filled gold`
    );
    await page.close();

    // First load with hashes
    for (const hash of ["#ca", "#wa", "#litigation"]) {
      page = await load(width, "/" + hash);
      m = await metrics(page);
      const expectLabel = { "#ca": "California", "#wa": "Washington", "#litigation": "Litigation" }[hash];
      ok(m.scrollY === 0, `${width} ${hash} first load scrollY is 0 (got ${m.scrollY})`);
      ok(m.headerVisible && m.stampVisible, `${width} ${hash} title and LAST REVIEWED stay on screen`);
      ok(m.activeLabel === expectLabel, `${width} ${hash} active chip is ${expectLabel} (got ${m.activeLabel})`);
      ok(isGold(m.activeBg) && isDarkText(m.activeColor), `${width} ${hash} active chip is gold with dark text`);
      await page.close();
    }

    // Tab change from a first load at the top
    page = await load(width, "/");
    await page.click("#tab-litigation");
    await page.waitForFunction(() => {
      const el = document.querySelector(".tab.active");
      if (!el || el.dataset.view !== "litigation") return false;
      const bg = getComputedStyle(el).backgroundColor;
      return /rgb\(\s*232,\s*197,\s*71\s*\)/.test(bg);
    });
    m = await metrics(page);
    ok(m.activeLabel === "Litigation", `${width} clicking Litigation selects it`);
    ok(m.hash === "#litigation", `${width} hash updates to #litigation`);
    ok(isGold(m.activeBg) && isDarkText(m.activeColor), `${width} Litigation chip is gold after click`);
    ok(m.scrollY === 0, `${width} tab change from the top does not scroll the page (scrollY=${m.scrollY})`);
    const selected = m.tabAria.filter((t) => t.selected === "true");
    const tabbable = m.tabAria.filter((t) => t.tabIndex === 0);
    ok(selected.length === 1 && selected[0].view === "litigation", `${width} only Litigation has aria-selected=true`);
    ok(tabbable.length === 1 && tabbable[0].view === "litigation", `${width} only the active chip is in the tab order`);

    // Keyboard: from Litigation (index 7), ArrowRight -> Updates; ArrowUp from Updates (8) -> Nevada (5)
    await page.locator("#tab-litigation").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".tab.active")?.dataset.view === "updates");
    m = await metrics(page);
    ok(m.activeLabel === "Updates", `${width} ArrowRight from Litigation goes to Updates`);
    await page.keyboard.press("ArrowUp");
    await page.waitForFunction(() => document.querySelector(".tab.active")?.dataset.view === "az");
    m = await metrics(page);
    ok(m.activeLabel === "Arizona", `${width} ArrowUp from Updates goes to Arizona`);
    await page.close();
  }

  await browser.close();
}

(async () => {
  sourceChecks();
  const server = await startServer();
  try {
    await runBrowser();
  } finally {
    server.close();
  }
  if (fails) {
    console.log(`\n${fails} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
