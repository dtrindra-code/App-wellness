// Renders the crumpled-paper tile used behind the Today hero and the quote band
// (src/assets/paper.jpg: a light map, white = flat paper, grey = folds; multiplied over the surface).
// Seamless: a heightfield of Worley creases at three scales, lit from the top-left
// (same idea as feTurbulence + feDiffuseLighting, but tileable and pre-rendered). Computed in a Chromium canvas and saved as JPEG.
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/make-paper.mjs
// (the JPEG is committed, so this is rarely needed)
import { writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

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

const SIZE = 384;

const browser = await chromium.launch({ executablePath: findChrome() });
const page = await browser.newPage();
const dataUrl = await page.evaluate((N) => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Worley layer (wraps around): F2 − F1 is 0 on cell borders, so its inverse is a crease ridge;
  // F1 adds a gentle dome inside every facet.
  function worley(count) {
    const pts = Array.from({ length: count }, () => ({ x: rnd() * N, y: rnd() * N }));
    const cell = N / Math.sqrt(count);
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let d1 = Infinity, d2 = Infinity;
      for (const p of pts) {
        let dx = Math.abs(x - p.x); if (dx > N / 2) dx = N - dx;
        let dy = Math.abs(y - p.y); if (dy > N / 2) dy = N - dy;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const f1 = Math.sqrt(d1) / cell, f2 = Math.sqrt(d2) / cell;
      out[y * N + x] = -(f2 - f1) * 0.9 - f1 * 0.35;
    }
    return out;
  }

  function blur(src, r) {
    const tmp = new Float32Array(N * N), out = new Float32Array(N * N);
    const w = 2 * r + 1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0; for (let k = -r; k <= r; k++) s += src[y * N + ((x + k + N) % N)];
      tmp[y * N + x] = s / w;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0; for (let k = -r; k <= r; k++) s += tmp[((y + k + N) % N) * N + x];
      out[y * N + x] = s / w;
    }
    return out;
  }

  const L1 = blur(worley(9), 4), L2 = blur(worley(40), 1), L3 = worley(160);
  const hgt = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) hgt[i] = L1[i] * 34 + L2[i] * 14 + L3[i] * 5;

  // Diffuse light from the top-left, like feDiffuseLighting + feDistantLight.
  const lx = -0.5, ly = -0.55, lz = 0.67;
  const v = new Float32Array(N * N);
  const at = (x, y) => hgt[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const nx = -(at(x + 1, y) - at(x - 1, y)) / 2;
    const ny = -(at(x, y + 1) - at(x, y - 1)) / 2;
    const len = Math.hypot(nx, ny, 1);
    v[y * N + x] = (nx * lx + ny * ly + lz) / len + (rnd() - 0.5) * 0.02;
  }
  // Light map: highlights at 255 (the surface colour shows through under multiply),
  // folds down to ~185. Mean around 228.
  let max = -Infinity; for (const x of v) if (x > max) max = x;
  let mean = 0; for (const x of v) mean += x; mean /= v.length;
  let sd = 0; for (const x of v) sd += (x - mean) ** 2; sd = Math.sqrt(sd / v.length);
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const g = Math.max(150, Math.min(255, 232 + ((v[i] - mean) / sd) * 16));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/jpeg', 0.75);
}, SIZE);
await browser.close();

const out = new URL('../src/assets/', import.meta.url);
mkdirSync(out, { recursive: true });
const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
writeFileSync(new URL('paper.jpg', out), buf);
console.log(`src/assets/paper.jpg written (${(buf.length / 1024).toFixed(1)} KiB)`);
