// Checks for the website. Run: node --test tests/   (Node's own test runner; no packages, no network.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll, legalLine } from '../build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const content = JSON.parse(read('content/content.json'));
const site = JSON.parse(read('content/site.json'));
const index = read('public/index.html');
const privacy = read('public/privacy.html');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9x]+;/gi, ' ').replace(/\s+/g, ' ');

/** A temporary copy of the sources, with changes to site.json, to build against. */
function withSite(change, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dfsite-'));
  for (const d of ['src', 'content', 'public']) mkdirSync(join(dir, d), { recursive: true });
  cpSync(join(root, 'src'), join(dir, 'src'), { recursive: true });
  cpSync(join(root, 'content'), join(dir, 'content'), { recursive: true });
  const s = JSON.parse(JSON.stringify(site));
  change(s);
  writeFileSync(join(dir, 'content/site.json'), JSON.stringify(s));
  for (const [name, body] of Object.entries(extra)) writeFileSync(join(dir, 'public', name), body);

  return buildAll(dir);
}

test('public/ is exactly what the sources produce', () => {
  const built = buildAll();
  for (const [name, html] of Object.entries(built)) assert.equal(read(`public/${name}`), html, `${name} is out of date: run node build.mjs`);
});

test('the new copy is on the front page, in order: demo, what makes it different, founder note', () => {
  for (const item of content.different.items) {
    assert.ok(index.includes(`<h3>${item.title}</h3>`), item.title);
    assert.ok(index.includes(item.text), item.text);
  }
  assert.ok(index.includes('<h2 id="different-h">What makes it different</h2>'));
  assert.equal(content.different.items.length, 4);
  const demo = index.indexOf('id="demo"');
  const different = index.indexOf('class="different"');
  const founder = index.indexOf('class="why"');
  assert.ok(demo > 0 && demo < different && different < founder, 'section order');
  assert.ok(index.includes('Coming soon: one-click flows that clean, de-duplicate and export on their own; reports with charts; and an API.'));
  assert.ok(!index.includes('Coming next'));
  const next = content.coming_soon;
  assert.equal(next.split('. ').length, 1, 'one sentence');
  assert.doesNotMatch(next, /\b(20\d\d|january|february|march|april|may|june|july|august|september|october|november|december|q[1-4])\b/i, 'no dates');
  // kept as they were
  for (const kept of [content.headline, content.lead, content.formats, content.founder, ...content.promises]) assert.ok(index.includes(kept), kept);
  assert.ok(index.includes('Opening soon'));
});

test('the privacy aside sits near the form, and says nothing more than the owner\'s line', () => {
  assert.ok(index.includes('<p class="privacy-aside"><strong>Privacy assured.</strong> Every change is logged and visible to you.</p>'));
  assert.ok(index.indexOf('id="notify"') < index.indexOf('<p class="privacy-aside">') && index.indexOf('<p class="privacy-aside">') < index.indexOf('class="demo-frame"'));
});

test('nothing is claimed that is not built or not decided', () => {
  const text = visibleText(index).toLowerCase();
  for (const banned of ['gdpr', 'uk hosted', 'uk-hosted', 'hosted in', 'encrypt', 'certified', 'certification', 'iso 27001', 'soc 2', 'secure', 'delete', 'deletion', 'close your account', 'account closure', 'cancel', 'price', 'pricing', 'free trial', 'per user', '£', '$', 'region', 'data location']) {
    assert.ok(!text.includes(banned), `front page must not say "${banned}"`);
  }
});

test('the register-interest form, its consent wording, endpoint and handler are untouched', () => {
  const form = index.match(/<form class="notify"[\s\S]*?<\/form>/)[0];
  assert.equal(sha(form), '2b6ab8bb3be1f8f317a8232046007e98b20becdc309092dba98c3851d9f2e2cd', 'form markup changed');
  assert.ok(index.includes('var EARLY_ACCESS_ENDPOINT = "https://app.datafixer.tools/register-interest";'));
  assert.ok(index.includes("fetch(EARLY_ACCESS_ENDPOINT, { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json' } })"));
  assert.ok(index.includes('Thank you. Please check your email and click the link to confirm.'));
});

test('the privacy notice wording is unchanged: only a footer is added', () => {
  assert.equal(sha(privacy.match(/<main>[\s\S]*<\/main>/)[0]), '8524b19e29a9a5e28d10a39fae68b50dc10f5dbda0db283012e5e608567cdcb2');
  assert.ok(privacy.includes('<footer class="site-footer">'));
});

test('the footer: copyright, Privacy, Contact from config; Terms hidden until config says the page exists', () => {
  assert.ok(index.includes(`<footer>&copy; ${site.copyright_year} DataFixer &middot; <a href="privacy.html">Privacy</a> &middot; <a href="mailto:${site.contact_email}">Contact</a></footer>`));
  assert.equal(site.contact_email, 'support@datafixer.tools', 'the existing contact address');
  assert.doesNotMatch(index, />Terms</);
  assert.doesNotMatch(privacy, />Terms</);
  assert.throws(() => withSite((s) => { s.terms.enabled = true; }), /Terms page exists/, 'cannot switch Terms on without a page');
  const built = withSite((s) => { s.terms.enabled = true; }, { 'terms.html': '<p>terms</p>' });
  assert.match(built['index.html'], /<a href="terms.html">Terms<\/a>/);
  const noContact = withSite((s) => { s.contact_email = ''; });
  assert.doesNotMatch(noContact['index.html'], />Contact</);
});

test('the trading-name line is hidden until every company value is filled in, and only on the legal pages', () => {
  assert.equal(legalLine(site), '');
  assert.doesNotMatch(privacy, /trading name/);
  assert.deepEqual([site.company.legal_name, site.company.company_number, site.company.registered_office], ['', '', ''], 'values stay empty until the owner has them');
  const partial = withSite((s) => { s.company.legal_name = 'Example Ltd'; s.company.company_number = '01234567'; });
  assert.doesNotMatch(partial['privacy.html'], /trading name/, 'one value missing: still hidden');
  const full = withSite((s) => { Object.assign(s.company, { legal_name: 'Example Ltd', company_number: '01234567', registered_office: '1 High Street, Leeds LS1 1AA' }); });
  assert.match(full['privacy.html'], /DataFixer is a trading name of Example Ltd, company number 01234567, registered office 1 High Street, Leeds LS1 1AA\./);
  assert.doesNotMatch(full['index.html'], /trading name/);
});

test('no new requests, libraries, cookies or analytics', () => {
  for (const html of [index, privacy]) {
    assert.doesNotMatch(html, /<script[^>]+src=/i);
    assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/i);
    assert.doesNotMatch(html, /document\.cookie|localStorage|sessionStorage|gtag|analytics\.js|googletagmanager|plausible|matomo/i);
  }
  // the only absolute URLs are the existing metadata and the form's endpoint
  const urls = [...index.matchAll(/https?:\/\/[^\s"')<]+/g)].map((m) => m[0]);
  for (const u of urls) assert.match(u, /^https:\/\/(www\.datafixer\.tools|app\.datafixer\.tools|schema\.org|www\.w3\.org)/, u);
});

test('British English in the visible copy', () => {
  const text = visibleText(index + privacy).toLowerCase();
  for (const us of ['color', 'center', 'organization', 'optimiz', 'normaliz', 'standardiz', 'program ', 'license ', 'catalog ', 'analyze', 'behavior', 'favorite', 'cancelled']) {
    assert.ok(!text.includes(us), `US spelling "${us}"`);
  }
  assert.match(index, /<html lang="en-GB">/);
});

/** WCAG contrast of the text colours the new elements use, on the page background. */
function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('contrast: every text colour on the new elements reaches WCAG AA (4.5:1) on the page background', () => {
  const css = index.match(/<style>[\s\S]*?<\/style>/)[0];
  const colour = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))[1];
  const paper = colour('paper');
  for (const name of ['ink', 'muted', 'fix']) assert.ok(ratio(colour(name), paper) >= 4.5, `${name} on paper: ${ratio(colour(name), paper).toFixed(2)}`);
  assert.ok(ratio('#4A5A6A', '#EEF1EC') >= 4.5, 'privacy page footer text');
  // the footer's links are the link colour on the same background
  assert.ok(ratio(colour('fix'), paper) >= 4.5);
});

test('accessibility and layout: focus visible, reduced motion kept, headings in order, phone layout, nothing new that moves', () => {
  assert.match(index, /:focus-visible \{ outline: 3px solid/);
  assert.match(privacy, /:focus-visible \{ outline: 3px solid/);
  assert.match(index, /@media \(prefers-reduced-motion: reduce\)/);
  const headings = [...index.matchAll(/<h([1-3])[ >]/g)].map((m) => Number(m[1]));
  assert.equal(headings.filter((h) => h === 1).length, 1, 'one h1');
  for (let i = 1; i < headings.length; i++) assert.ok(headings[i] - headings[i - 1] <= 1, 'no skipped heading level');
  assert.match(index, /@media \(max-width: 40rem\) \{\s*\.different-list \{ grid-template-columns: minmax\(0, 1fr\); \}/, 'one column on a phone');
  const added = index.match(/\/\* what makes it different \*\/[\s\S]*?\.sr-only/)[0];
  assert.doesNotMatch(added, /animation|transition|@keyframes|position:\s*(absolute|fixed)|float:/, 'static layout: no layout shift');
});

test('page weight has not grown noticeably (baseline: index 19,894 B raw / 6,127 B gzip; privacy 3,023 B / 1,525 B)', () => {
  const size = (html) => [Buffer.byteLength(html), gzipSync(html).length];
  const [raw, gz] = size(index);
  const [rawP, gzP] = size(privacy);
  assert.ok(raw < 19894 * 1.15 && gz < 6127 * 1.15, `index ${raw} / ${gz}`);
  assert.ok(rawP < 3023 * 1.2 && gzP < 1525 * 1.2, `privacy ${rawP} / ${gzP}`);
});

test('metadata is unchanged', () => {
  for (const kept of ['<title>DataFixer: fix your data without the risk</title>', 'og:image" content="https://www.datafixer.tools/og-image.png"', '<meta name="description" content="DataFixer finds what is wrong in your data files, shows you every change before it happens, and lets you undo it afterwards. Opening soon.">']) {
    assert.ok(index.includes(kept), kept);
  }
});

test('the demo is labelled as an illustration, and the fourth item is the activity record', () => {
  assert.ok(index.includes('<caption>An illustration of how DataFixer shows changes</caption>'));
  assert.ok(!index.includes('A messy file, as DataFixer would show it'));
  assert.ok(index.includes('<p class="aside">Five made-up rows. Yours will have more.</p>'), 'the existing line is kept');
  assert.ok(index.includes('<p class="aside" id="demo-note">For illustration only: your files, results and screens will differ.</p>'));
  assert.ok(index.indexOf('id="demo-note"') > index.indexOf('id="demo"') && index.indexOf('id="demo-note"') < index.indexOf('class="different"'), 'beside the demo table');
  assert.equal(content.different.items[3].title, 'A record of every change');
  assert.ok(index.includes('<h3>A record of every change</h3><p>See who did what, and when, in an activity log your team can check.</p>'));
  assert.ok(!index.includes('<h3>Every change is logged</h3>'));
});
