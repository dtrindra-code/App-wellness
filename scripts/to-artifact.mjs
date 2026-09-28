// Turns the Vite single-file build into an Artifact page body:
// the Artifact publisher adds its own doctype/head/body skeleton, so we keep
// only <title>, font links, <style>, the app root and the inline script.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);
const title = pick(/<title>[\s\S]*?<\/title>/g);
const links = pick(/<link rel="(?:stylesheet|preconnect)"[^>]*>/g);
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g);
const scripts = pick(/<script[^>]*>[\s\S]*?<\/script>/g).map((s) =>
  s.replace(/<script[^>]*>/, '<script type="module">'),
);
const out = [...title, ...links, ...styles, '<div id="app"></div>', ...scripts].join('\n');
writeFileSync('dist/artifact.html', out);
console.log(`dist/artifact.html written (${(out.length / 1024).toFixed(1)} KiB)`);
