// Builds public/index.html and public/privacy.html from src/*.html, content/content.json and content/site.json.
// Plain Node, no packages, no network. Usage:
//   node build.mjs            write the pages into public/
//   node build.mjs --check    exit 1 if public/ is not what the sources produce (the tests run this)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const PAGES = ['index.html', 'privacy.html'];

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

export function legalLine(site) {
  const c = site.company ?? {};
  const values = [c.legal_name, c.company_number, c.registered_office].map((v) => String(v ?? '').trim());
  if (values.some((v) => v === '')) return '';
  const [name, number, office] = values;
  return `DataFixer is a trading name of ${name}, company number ${number}, registered office ${office}.`;
}

export function footerHtml(site, page) {
  const links = ['<a href="privacy.html">Privacy</a>'];
  if (site.terms?.enabled) links.push(`<a href="${escapeHtml(site.terms.path ?? 'terms.html')}">Terms</a>`);
  if (String(site.contact_email ?? '').trim() !== '') links.push(`<a href="mailto:${escapeHtml(site.contact_email)}">Contact</a>`);
  const line = page === 'privacy.html' ? legalLine(site) : '';
  const legal = line === '' ? '' : `\n    <p class="legal">${escapeHtml(line)}</p>`;
  if (page === 'privacy.html') {
    return `<footer class="site-footer">\n    <p>&copy; ${escapeHtml(site.copyright_year)} ${escapeHtml(site.brand)} &middot; ${links.join(' &middot; ')}</p>${legal}\n  </footer>`;
  }
  return `<footer>&copy; ${escapeHtml(site.copyright_year)} ${escapeHtml(site.brand)} &middot; ${links.join(' &middot; ')}</footer>`;
}

export function computed(content, site, page) {
  const promises = (content.promises ?? []).map((p) => `            <li>${escapeHtml(p)}</li>`).join('\n');
  const different = content.different
    ? `      <section class="different" aria-labelledby="different-h">\n        <h2 id="different-h">${escapeHtml(content.different.heading)}</h2>\n        <ul class="different-list">\n`
      + content.different.items.map((i) => `          <li><h3>${escapeHtml(i.title)}</h3><p>${escapeHtml(i.text)}</p></li>`).join('\n')
      + `\n        </ul>\n        <p class="next">${escapeHtml(content.coming_soon)}</p>\n      </section>\n\n`
    : '';
  const privacy = content.privacy_aside
    ? `          <p class="privacy-aside"><strong>${escapeHtml(content.privacy_aside.title)}</strong> ${escapeHtml(content.privacy_aside.text)}</p>\n`
    : '';
  return {
    promises,
    different,
    privacy_aside: privacy,
    footer: footerHtml(site, page),
    contact_email_js: JSON.stringify(String(site.contact_email ?? '')),
  };
}

export function render(template, content, site, page) {
  const extra = computed(content, site, page);
  const out = template
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, key) => {
      if (!(key in extra)) throw new Error(`Unknown raw placeholder {{{${key}}}} in ${page}`);
      return extra[key];
    })
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const value = key.split('.').reduce((o, k) => (o == null ? o : o[k]), content);
      if (value === undefined || typeof value === 'object') throw new Error(`No text for {{${key}}} in ${page}`);
      return escapeHtml(value);
    });
  return out;
}

export function buildAll(dir = root) {
  const content = JSON.parse(readFileSync(join(dir, 'content/content.json'), 'utf8'));
  const site = JSON.parse(readFileSync(join(dir, 'content/site.json'), 'utf8'));
  if (site.terms?.enabled && !existsSync(join(dir, 'public', site.terms.path ?? 'terms.html'))) {
    throw new Error('site.json says the Terms page exists, but public/' + (site.terms.path ?? 'terms.html') + ' is missing.');
  }
  const pages = {};
  for (const page of PAGES) pages[page] = render(readFileSync(join(dir, 'src', page), 'utf8'), content, site, page);
  return pages;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pages = buildAll();
  if (process.argv.includes('--check')) {
    const stale = Object.entries(pages).filter(([name, html]) => !existsSync(join(root, 'public', name)) || readFileSync(join(root, 'public', name), 'utf8') !== html).map(([n]) => n);
    if (stale.length) { console.error('Out of date (run: node build.mjs): ' + stale.join(', ')); process.exit(1); }
    console.log('public/ matches the sources.');
  } else {
    for (const [name, html] of Object.entries(pages)) { writeFileSync(join(root, 'public', name), html); console.log('wrote public/' + name); }
  }
}
