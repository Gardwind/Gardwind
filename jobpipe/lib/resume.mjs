// CV and cover letter rendering (HTML -> PDF with headless Chromium) and an
// applicant-tracking-system (ATS) readability check on the finished PDF.
//
// Resume shape (master and tailored share it; see docs/data-model.md):
// { basics:{name,email,phone,location,nationality,links:[{label,url}]},
//   summary?:{text,src:[]},
//   education:[{id,institution,degree,location,start,end,grade,details:[{id,text}|{text,src}]}],
//   work:[{id,organization,position,location,start,end,highlights:[...]}],
//   activities:[{id,organization,role,location,start,end,highlights:[...]}],
//   skills:[{id,category,items:[]}], interests:[], meta:{order:[]} }
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { escapeHtml, norm } from './util.mjs';
import { launchBrowser } from './pw.mjs';
import { ensureTimesNewRoman } from './fonts.mjs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})/);
  if (m) return `${MONTHS[Number(m[2]) - 1] || ''} ${m[1]}`.trim();
  return String(s);
}

export function fmtRange(start, end) {
  const a = fmtDate(start);
  const b = fmtDate(end);
  if (a && b) return a === b ? a : `${a} – ${b}`;
  return a || b || '';
}

export const LIST_KEY = { education: 'details', work: 'highlights', activities: 'highlights' };

// Every bullet, including sub-bullets (`sub`), flattened.
export function allHighlights(r) {
  const out = [];
  for (const [sec, key] of Object.entries(LIST_KEY)) {
    for (const e of r?.[sec] || []) {
      for (const h of e[key] || []) {
        const obj = typeof h === 'string' ? { text: h } : h;
        out.push({ section: sec, entryId: e.id, ...obj });
        for (const s of obj.sub || []) out.push({ section: sec, entryId: e.id, parentId: obj.id, ...(typeof s === 'string' ? { text: s } : s) });
      }
    }
  }
  return out;
}

// Date text as the owner writes it ("July 2026 (2 months)"), else built from start/end.
export const entryWhen = (e) => e.when || fmtRange(e.start, e.end);

export function skillsList(r) {
  return (r?.skills || []).flatMap((s) => s.items || []);
}

// meta.font picks the CV typeface; each stack has fallbacks that exist on Linux.
const FONTS = {
  charter: "'Charter', 'Bitstream Charter', 'Caladea', 'Cambria', 'Georgia', 'Times New Roman', serif",
  times: "'Times New Roman', 'Liberation Serif', 'Tinos', 'Nimbus Roman', Times, serif",
  calibri: "'Calibri', 'Carlito', 'Segoe UI', Arial, sans-serif",
  garamond: "'EB Garamond', 'Garamond', 'Cormorant Garamond', 'Georgia', serif",
};

const SECTION_TITLES = { education: 'Education', work: 'Experience', activities: 'Leadership & Activities', skills: 'Skills & Interests' };

function bulletItem(h) {
  const text = typeof h === 'string' ? h : h.text || '';
  const sub = typeof h === 'object' && h.sub?.length
    ? `<ul class="subl">${h.sub.map((x) => `<li>${escapeHtml(typeof x === 'string' ? x : x.text)}</li>`).join('')}</ul>`
    : '';
  return `<li>${escapeHtml(text)}${sub}</li>`;
}

function bullets(list) {
  const items = (list || []).filter((h) => (typeof h === 'string' ? h : h.text || h.sub?.length));
  return items.length ? `<ul>${items.map(bulletItem).join('')}</ul>` : '';
}

function entry(head, where, sub, when, list) {
  return `<div class="entry">
  <div class="row"><span class="head">${escapeHtml(head)}</span><span class="right">${escapeHtml(where || '')}</span></div>
  ${sub || when ? `<div class="row"><span class="sub">${escapeHtml(sub || '')}</span><span class="right">${escapeHtml(when || '')}</span></div>` : ''}
  ${bullets(list)}
</div>`;
}

export function resumeHTML(r, { fontPt = 10.5 } = {}) {
  const b = r.basics || {};
  const contact = [b.location, b.phone, b.email, ...(b.links || []).map((l) => l.label || l.url), b.nationality ? `Nationality: ${b.nationality}` : null]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' &nbsp;|&nbsp; ');
  const order = r.meta?.order || ['education', 'work', 'activities', 'skills'];
  const title = (sec) => escapeHtml(r.meta?.titles?.[sec] || SECTION_TITLES[sec]);
  const parts = [];
  if (r.summary?.text) parts.push(`<p class="summary">${escapeHtml(r.summary.text)}</p>`);
  for (const sec of order) {
    if (sec === 'education' && r.education?.length) {
      parts.push(`<h2>${title('education')}</h2>` + r.education.map((e) => entry(e.institution, e.location, [e.degree, e.grade].filter(Boolean).join(' – '), entryWhen(e), e.details)).join(''));
    } else if (sec === 'work' && r.work?.length) {
      parts.push(`<h2>${title('work')}</h2>` + r.work.map((e) => entry(e.organization, e.location, e.position, entryWhen(e), e.highlights)).join(''));
    } else if (sec === 'activities' && r.activities?.length) {
      parts.push(`<h2>${title('activities')}</h2>` + r.activities.map((e) => entry(e.organization, e.location, e.role, entryWhen(e), e.highlights)).join(''));
    } else if (sec === 'skills' && (r.skills?.length || r.interests?.length)) {
      const rows = (r.skills || []).filter((s) => s.items?.length).map((s) => `<p><b>${escapeHtml(s.category)}:</b> ${escapeHtml(s.items.join(', '))}</p>`);
      if (r.interests?.length) rows.push(`<p><b>Interests:</b> ${escapeHtml(r.interests.join(', '))}</p>`);
      parts.push(`<h2>${title('skills')}</h2><div class="skills">${rows.join('')}</div>`);
    }
  }
  const fs1 = fontPt;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(b.name || 'CV')}</title><style>
@page { size: A4; margin: 11mm 13mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #111; font-family: ${FONTS[r.meta?.font] || FONTS.charter};
  font-size: ${fs1}pt; line-height: 1.24; font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0; }
h1 { font-size: ${(fs1 * 1.75).toFixed(1)}pt; margin: 0 0 2pt; text-align: center; letter-spacing: .4pt; }
.contact { text-align: center; font-size: ${(fs1 * 0.93).toFixed(1)}pt; margin: 0 0 5pt; }
.summary { margin: 0 0 4pt; }
h2 { font-size: ${(fs1 * 1.02).toFixed(1)}pt; text-transform: uppercase; letter-spacing: 1.1pt; margin: 7pt 0 3pt; padding-bottom: 1pt; border-bottom: .8pt solid #111; }
.entry { margin: 0 0 4pt; break-inside: avoid; }
.row { display: flex; justify-content: space-between; gap: 10pt; }
.head { font-weight: bold; }
.sub { font-style: italic; }
.right { white-space: nowrap; text-align: right; }
ul { margin: 1pt 0 0; padding-left: 13pt; }
ul.subl { margin: 0; padding-left: 14pt; list-style-type: "- "; }
li { margin: 0 0 1pt; }
.skills p { margin: 0 0 1.5pt; }
</style></head><body>
<h1>${escapeHtml(b.name || '')}</h1>
<p class="contact">${contact}</p>
${parts.join('\n')}
</body></html>`;
}

// Cover letter in the owner's own format. There is no header: the letter is attached to the
// application, so name, contact details, date, address and subject line are left out. It opens
// with the salutation and ends with the closing and the name, in Times New Roman with 1-inch
// margins and the spacing of the owner's Word letter (15.85 pt lines at 12 pt, 14.65 pt after
// each paragraph). letter: {salutation, paragraphs: [], closing}; any other field is ignored.
export function letterHTML(letter, basics = {}, { fontPt = 12 } = {}) {
  const k = fontPt / 12;
  const blocks = [letter.salutation || 'Dear Hiring Team,', ...(letter.paragraphs || []), letter.closing || 'Sincerely,', basics.name || '']
    .filter((p) => String(p).trim());
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cover letter</title><style>
@page { size: A4; margin: 25.4mm; }
html, body { margin: 0; }
body { color: #000; font-family: 'Times New Roman', 'Liberation Serif', 'Tinos', Times, serif; font-size: ${fontPt}pt; line-height: ${(15.85 * k).toFixed(2)}pt; font-variant-ligatures: none; }
p { margin: 0 0 ${(14.65 * k).toFixed(2)}pt; }
</style></head><body>
${blocks.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}
</body></html>`;
}

export function pdfPages(p) {
  try {
    const out = execFileSync('pdfinfo', [p], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(/Pages:\s+(\d+)/);
    if (m) return Number(m[1]);
  } catch { /* pdfinfo missing: fall back to counting page objects */ }
  const raw = fs.readFileSync(p, 'latin1');
  return (raw.match(/\/Type\s*\/Page(?![s\w])/g) || []).length || 1;
}

export function pdfText(p) {
  try {
    return execFileSync('pdftotext', ['-layout', p, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

// Render a resume to PDF, shrinking the font a little at a time until it fits.
export async function renderResumePdf(resume, outPath, { maxPages = 1, htmlOut } = {}) {
  const sizes = [10.5, 10.2, 9.9, 9.6, 9.3, 9.0];
  const { browser, context } = await launchBrowser();
  let used = sizes[0];
  let pages = 0;
  try {
    const page = await context.newPage();
    for (const size of sizes) {
      const html = resumeHTML(resume, { fontPt: size });
      await page.setContent(html, { waitUntil: 'load' });
      await page.pdf({ path: outPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
      pages = pdfPages(outPath);
      used = size;
      if (htmlOut) fs.writeFileSync(htmlOut, html);
      if (pages <= maxPages) break;
    }
  } finally {
    await browser.close();
  }
  return { path: outPath, pages, fontPt: used, fits: pages <= maxPages };
}

// 12 pt, or 11 pt when 12 does not fit on one page (the owner accepts either size).
export async function renderLetterPdf(letter, basics, outPath, { maxPages = 1 } = {}) {
  const font = ensureTimesNewRoman();
  const { browser, context } = await launchBrowser();
  let pages = 0;
  let used = 12;
  try {
    const page = await context.newPage();
    for (const size of [12, 11]) {
      await page.setContent(letterHTML(letter, basics, { fontPt: size }), { waitUntil: 'load' });
      await page.pdf({ path: outPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
      pages = pdfPages(outPath);
      used = size;
      if (pages <= maxPages) break;
    }
  } finally {
    await browser.close();
  }
  return { path: outPath, pages, fits: pages <= maxPages, fontPt: used, font: font.font, ...(font.note ? { note: font.note } : {}) };
}

// Can a parser read the PDF back? Checks contact details and that each bullet
// survives text extraction.
export function atsCheck(pdfPath, resume) {
  const text = pdfText(pdfPath);
  if (text === null) return { ok: true, skipped: 'pdftotext is not installed, check skipped' };
  const T = ` ${norm(text)} `;
  const digits = text.replace(/\D/g, '');
  const b = resume.basics || {};
  const missing = [];
  if (b.name && !T.includes(` ${norm(b.name)} `)) missing.push('name');
  if (b.email && !text.toLowerCase().includes(String(b.email).toLowerCase())) missing.push('email');
  if (b.phone && !digits.includes(String(b.phone).replace(/\D/g, ''))) missing.push('phone');
  let total = 0;
  let found = 0;
  const lost = [];
  for (const h of allHighlights(resume)) {
    const words = norm(h.text).split(' ').filter((w) => w.length > 3);
    if (!words.length) continue;
    total++;
    const ok = words.filter((w) => T.includes(` ${w} `) || T.includes(w)).length >= Math.ceil(words.length * 0.85);
    if (ok) found++;
    else lost.push(h.text.slice(0, 80));
  }
  const coverage = total ? found / total : 1;
  const warnings = [];
  if (/[ﬀ-ﬆ]/.test(text)) warnings.push('PDF text contains ligature characters (ﬁ/ﬂ) that some parsers misread');
  if (coverage < 0.95) warnings.push(`${lost.length} bullet(s) did not extract cleanly`);
  return { ok: missing.length === 0 && coverage >= 0.9, coverage: Math.round(coverage * 100), missing, lost: lost.slice(0, 5), warnings, chars: text.length };
}
