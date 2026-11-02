// Small shared helpers. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function readJSON(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Cannot read JSON file ${p}: ${e.message}`);
  }
}

export function writeJSON(p, data) {
  fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•', middot: '·',
  eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô',
  ouml: 'ö', uuml: 'ü', ugrave: 'ù', ucirc: 'û', auml: 'ä', iuml: 'ï', icirc: 'î', szlig: 'ß',
  euro: '€', pound: '£', yen: '¥', copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»',
  shy: '', zwj: '', zwnj: '', times: '×', deg: '°', para: '¶', sect: '§',
};

export function decodeEntities(s) {
  if (!s) return '';
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return Number.isFinite(code) ? String.fromCodePoint(code) : m; } catch { return m; }
    }
    const v = ENTITIES[e.toLowerCase()];
    return v ?? m;
  });
}

// HTML (possibly entity-encoded, as Greenhouse returns it) -> readable plain text.
export function htmlToText(html) {
  if (!html) return '';
  let s = String(html);
  if (/&lt;\/?[a-z]/i.test(s) && !/<\/?[a-z][^>]*>/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(div|h[1-6]|ul|ol|tr|section|article|header|footer|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s
    .replace(/[ \t   ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Lowercase, accents removed, punctuation collapsed to single spaces.
export function norm(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();
}

export const slug = (s) => norm(s).replace(/[+#]/g, '').replace(/ +/g, '-').slice(0, 60).replace(/-+$/, '');
export const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);

// A board database document id: letters, digits and - only, stable per posting.
export function docIdFor(job) {
  const base = slug(`${job.company || 'job'}-${job.title || ''}`).slice(0, 48) || 'job';
  return `${base}-${hash(job.key || job.url || `${job.company}|${job.title}|${job.location}`)}`;
}

export const todayISO = (d = new Date()) => d.toISOString().slice(0, 10);

export function daysAgo(iso, now = new Date()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 864e5));
}

// Workday style "Posted 3 Days Ago" -> ISO date (approximate).
export function relativePostedToISO(text, now = new Date()) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  let days = null;
  if (/today|just posted|hours? ago/.test(t)) days = 0;
  else if (/yesterday/.test(t)) days = 1;
  else {
    const m = t.match(/(\d+)\+?\s*(day|week|month)s?/);
    if (m) {
      const n = Number(m[1]);
      days = m[2] === 'day' ? n : m[2] === 'week' ? n * 7 : n * 30;
      if (/\+/.test(t)) days += 1;
    }
  }
  if (days === null) return null;
  return new Date(now.getTime() - days * 864e5).toISOString();
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) args[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args[a.slice(2)] = argv[++i];
      else args[a.slice(2)] = true;
    } else args._.push(a);
  }
  return args;
}

export const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
export const uniq = (arr) => [...new Set(arr)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Run async tasks with limited concurrency, keeping order.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

// Read every JSON document file in a folder written by ArtifactData's out_dir.
export function readDocDir(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const body = readJSON(path.join(dir, f));
      return { id: f.replace(/\.json$/, ''), ...body };
    });
}
