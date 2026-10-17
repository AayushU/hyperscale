// Builds the hosted (claude.ai artifact) version: one self-contained HTML page with
// the engine, bots, table logic and client inlined.
//   node scripts/build-artifact.mjs [out.html]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, read, bundle } from './bundle.mjs';

const out = process.argv[2] || path.join(ROOT, 'dist', 'hyperscale.html');

let html = read('public/index.html');
const css = read('public/style.css');
// The artifact skeleton supplies doctype/html/head/body; keep only our title, style and body content.
const title = '<title>HYPERSCALE</title>';
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')).replace(/<script type="module" src="\/app.js"><\/script>/, '');
const hostedCss = `
:root { color-scheme: dark; }
html, body { height: 100%; background: var(--bg); }
@media (min-width: 901px) { body.hosted #game { height: 100%; } }
`;
html = `${title}
<meta name="description" content="Build the compute. Win the future. A board game about building AI data centers.">
<style>${css}${hostedCss}</style>
${body.trim()}
<script type="module">
${bundle({ hosted: true })}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
