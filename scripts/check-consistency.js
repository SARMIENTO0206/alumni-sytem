// Static consistency check for the modularized SPA.
// 1) Every onclick/onsubmit handler used in index.html must be defined in the js/ modules.
// 2) Every getElementById(...) target in the modules must exist as an id in index.html.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const jsFiles = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'));
const allJs = jsFiles.map(f => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n');

const missing = [];

// ---- 1) Handler existence ----
const handlers = new Set();
const onclickRe = /on(?:click|submit|change|input|keyup|keydown|blur)="([A-Za-z_$][\w$]*)\s*\(/g;
let m;
while ((m = onclickRe.exec(html))) handlers.add(m[1]);

const defined = new Set();
const fnRe = /(?:function\s+)([A-Za-z_$][\w$]*)\s*\(/g;
while ((m = fnRe.exec(allJs))) defined.add(m[1]);
while ((m = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|\w+)\s*=>/g.exec(allJs))) defined.add(m[1]);

for (const h of handlers) {
  if (!defined.has(h)) missing.push(`HANDLER NOT DEFINED: ${h}`);
}

// ---- 2) getElementById target existence ----
const idsInHtml = new Set();
const idRe = /\bid="([^"]+)"/g;
while ((m = idRe.exec(html))) idsInHtml.add(m[1]);

const idLookups = new Set();
const lookupRe = /getElementById\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
while ((m = lookupRe.exec(allJs))) idLookups.add(m[1]);

for (const id of idLookups) {
  if (!idsInHtml.has(id)) {
    // ids may be created dynamically via innerHTML template strings (e.g. table rows)
    missing.push(`getElementById target missing static id: "${id}" (may be dynamic - review)`);
  }
}

if (missing.length === 0) {
  console.log(`OK  ${handlers.size} handlers defined; ${idLookups.size} DOM lookups all resolved.`);
} else {
  console.log(`CHECKED ${handlers.size} handlers, ${idLookups.size} DOM lookups`);
  for (const line of missing) console.log('  ' + line);
}