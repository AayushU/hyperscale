// Builds the static part of the Cloudflare site into site/: a single-file index.html
// (engine, bots and client inlined, so the game loads in one request) plus the
// rules and card pages. worker/index.js serves it and runs the game tables.
//   node scripts/build-site.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, read, bundle } from './bundle.mjs';

const OUT = path.join(ROOT, 'site');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'shared'), { recursive: true });
const copy = (from, to = from) => fs.copyFileSync(path.join(ROOT, from), path.join(OUT, to));

for (const f of ['rules.html', 'cards.html', 'md.js', 'cardgallery.js']) copy(`public/${f}`, f);
copy('shared/content.js');
for (const f of ['RULES.md', 'CARDS.md', 'PLAYTEST.md']) copy(f);

let html = read('public/index.html');
const meta = `<meta name="description" content="Build the compute. Win the future. A board game about building AI data centers.">
  <meta property="og:title" content="HYPERSCALE">
  <meta property="og:description" content="A Catan-style board game about building AI data centers. 30–40 minute games with friends and bots.">
  <meta name="theme-color" content="#0b1020">`;
html = html
  .replace(/<meta name="description"[^>]*>/, meta)
  .replace('<link rel="stylesheet" href="/style.css">', () => `<style>${read('public/style.css')}</style>`)
  .replace('<script type="module" src="/app.js"></script>', () => `<script type="module">\n${bundle({ hosted: false, ws: true })}\n</script>`);
if (!html.includes('const __mods')) throw new Error('index.html: app script tag not found');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// Browsers may reuse pages for 5 minutes and keep showing a cached copy while
// they fetch a newer one; Cloudflare serves them from the edge either way.
fs.writeFileSync(path.join(OUT, '_headers'), `/*
  Cache-Control: public, max-age=300, stale-while-revalidate=86400
  X-Content-Type-Options: nosniff
`);
console.log(`wrote ${OUT} (index.html ${(html.length / 1024).toFixed(0)} KB)`);
