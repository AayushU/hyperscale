// Inlines the client's ES modules into one script, for single-file builds
// (the claude.ai artifact and the Cloudflare site).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Module order matters: each module may only import from modules above it.
const MODULES = [
  'shared/content.js', 'shared/engine.js', 'shared/bots.js', 'shared/rooms.js',
  'public/transport-server.js', 'public/transport-artifact.js', 'public/md.js', 'public/cardgallery.js', 'public/app.js',
];
const key = spec => path.basename(spec, '.js');

function transform(file) {
  let src = read(file);
  const name = key(file);
  // imports -> destructure from the module registry
  src = src.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/gm, (m, names, spec) => {
    const list = names.split(',').map(n => n.trim()).filter(Boolean).map(n => n.replace(/\s+as\s+/, ': '));
    return `const { ${list.join(', ')} } = __mods[${JSON.stringify(key(spec))}];`;
  });
  if (/^import\s/m.test(src)) throw new Error(`${file}: unsupported import form`);
  const exported = [];
  src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (m, kind, id) => { exported.push(id); return `${kind} ${id}`; });
  if (/^export\s/m.test(src)) throw new Error(`${file}: unsupported export form`);
  return `// ---- ${file}\n__mods[${JSON.stringify(name)}] = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`;
}

// hosted: true uses claude.ai shared storage; false talks to a game server.
// ws: true takes updates over a WebSocket (Cloudflare) instead of Server-Sent Events (Node).
export function bundle({ hosted, ws = false }) {
  return `globalThis.HYPERSCALE_HOSTED = ${hosted};\nglobalThis.HYPERSCALE_WS = ${ws};\nconst __mods = {};\n${MODULES.map(transform).join('\n')}`;
}
