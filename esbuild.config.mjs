import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const outdir = 'dist';
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await esbuild.build({
  entryPoints: {
    'service-worker': 'src/background/service-worker.js',
    'content-script': 'src/content/content-script.js',
    'library': 'src/library/library.js',
  },
  bundle: true,
  format: 'iife', // 打成自包含脚本,规避 content script 无法用 ES module 的限制
  target: 'chrome110',
  outdir,
});

await cp('manifest.json', `${outdir}/manifest.json`);
await cp('src/library/library.html', `${outdir}/library.html`);
await cp('src/library/library.css', `${outdir}/library.css`);
await cp('icons', `${outdir}/icons`, { recursive: true });

console.log('Built to dist/');
