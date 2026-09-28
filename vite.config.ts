import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two builds:
// - default (npm run build): one self-contained HTML file for the Artifact page.
// - PAGES=1 (npm run build:pages): multi-file PWA for GitHub Pages under /App-wellness/.
const pages = process.env.PAGES === '1';

export default defineConfig({
  base: pages ? '/App-wellness/' : './',
  plugins: pages ? [] : [viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: pages ? 'dist-pages' : 'dist',
    emptyOutDir: true,
  },
});
