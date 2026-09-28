// Renders scripts/icon.svg to the PNG icons in public/icons/ with Playwright's Chromium.
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/make-icons.mjs
// (needs `npm i -D playwright --no-save` once; the PNGs are committed, so this is rarely needed)
import { readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');
const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

// rx in the 512 viewBox: iOS and maskable icons are full-bleed (the OS rounds them).
const ICONS = [
  { file: 'apple-touch-icon.png', size: 180, rx: 0 },
  { file: 'icon-192.png', size: 192, rx: 112 },
  { file: 'icon-512.png', size: 512, rx: 112 },
  { file: 'maskable-512.png', size: 512, rx: 0 },
];

// Use a preinstalled Chromium if the bundled revision is missing (CHROME_PATH overrides).
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const d of readdirSync(root).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
    const exe = `${root}/${d}/chrome-linux/chrome`;
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

const browser = await chromium.launch({ executablePath: findChrome() });
try {
  for (const { file, size, rx } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const body = svg.replace('{{RX}}', String(rx)).replace('<svg ', `<svg width="${size}" height="${size}" `);
    await page.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`);
    await page.locator('svg').screenshot({ path: new URL(file, out).pathname, omitBackground: true });
    await page.close();
    console.log(`public/icons/${file} (${size}px)`);
  }
} finally {
  await browser.close();
}
