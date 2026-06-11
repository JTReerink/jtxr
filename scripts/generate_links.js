const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');

function findSubpages() {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const pages = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.')) continue;
    const candidate = path.join(root, e.name, 'index.html');
    if (fs.existsSync(candidate)) {
      pages.push({ name: e.name, href: `${e.name.replace(/\\/g,'/')}/index.html` });
    }
  }
  return pages;
}

function renderLinks(pages) {
  if (pages.length === 0) return '<div id="generated-pages" class="hidden"><p>No subpages found.</p></div>';
  const items = pages.map(p => `  <p><a class="subpage" href="${p.href}">${p.name}</a></p>`).join('\n');
  return `<div id="generated-pages" class="hidden">\n${items}\n</div>`;
}

function replaceInIndex(newHtml) {
  const content = fs.readFileSync(indexPath, 'utf8');
  const start = '<!-- AUTO_LINKS_START -->';
  const end = '<!-- AUTO_LINKS_END -->';
  const sIdx = content.indexOf(start);
  const eIdx = content.indexOf(end);
  if (sIdx === -1 || eIdx === -1) {
    console.error('Markers not found in index.html. Add <!-- AUTO_LINKS_START --> and <!-- AUTO_LINKS_END -->.');
    process.exit(1);
  }
  const before = content.slice(0, sIdx + start.length);
  const after = content.slice(eIdx);
  const updated = before + '\n' + newHtml + '\n' + after;
  fs.writeFileSync(indexPath, updated, 'utf8');
  console.log('index.html updated with', (newHtml.match(/<a class="subpage"/g) || []).length, 'links');
}

function main() {
  const pages = findSubpages();
  const html = renderLinks(pages);
  replaceInIndex(html);
}

if (require.main === module) main();
