// Publishes the quotes as public/quotes.json so the iPhone widget (Scriptable)
// can show the same quote of the day as the app. Quotes are generic, no user data.
import { buildSync } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';

const out = buildSync({ entryPoints: ['src/data/quotes.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
mkdirSync('public', { recursive: true });
writeFileSync('public/quotes.json', JSON.stringify({ quotes: mod.QUOTES.map((q) => ({ text: q.text, author: q.author ?? null })) }));
console.log(`public/quotes.json: ${mod.QUOTES.length} citations`);
