// Cheap, deterministic first pass before Claude reads anything: drop jobs that
// are already tracked, duplicates, too senior, wrong place, or stale; flag
// language requirements; and rank the rest so Claude reads the best first.
import { norm, daysAgo } from './util.mjs';

export const DEFAULT_EXCLUDE = [
  'senior', 'sr', 'lead', 'principal', 'director', 'head of', 'vice president', 'vp', 'svp', 'evp', 'avp',
  'managing director', 'partner', 'chief', 'staff', 'executive director', 'cfo', 'ceo', 'coo', 'cto',
];

const LOCATION_ALIASES = {
  london: ['london', 'greater london', 'city of london', 'canary wharf'],
  paris: ['paris', 'ile de france', 'la defense', 'neuilly'],
  'hong kong': ['hong kong', 'hk', 'hksar', 'kowloon', 'central hong kong'],
  shanghai: ['shanghai'],
  beijing: ['beijing'],
  shenzhen: ['shenzhen'],
  singapore: ['singapore'],
  zurich: ['zurich', 'zuerich'],
  geneva: ['geneva', 'geneve', 'genf'],
  basel: ['basel', 'bale', 'basle'],
  'new york': ['new york', 'nyc', 'manhattan'],
  dubai: ['dubai'],
  luxembourg: ['luxembourg'],
  'united kingdom': ['united kingdom', 'uk', 'england', 'scotland', 'gb', 'great britain'],
  france: ['france'],
  switzerland: ['switzerland', 'suisse', 'schweiz', 'svizzera', 'ch'],
  china: ['china', 'mainland china', 'prc'],
  'united states': ['united states', 'usa', 'us'],
  emea: ['emea', 'europe'],
  apac: ['apac', 'asia pacific', 'asia'],
};

export function expandLocation(loc) {
  const n = norm(loc);
  return LOCATION_ALIASES[n] || [n];
}

export function fingerprint(j) {
  const city = norm(String(j.location || '').split(/[;,/|(]/)[0]);
  return `${norm(j.company)}|${norm(j.title).replace(/\b(m f d|f m d|h f|f h|m w d)\b/g, '').trim()}|${city}`;
}

const LANGS = ['mandarin', 'chinese', 'cantonese', 'german', 'french', 'spanish', 'italian', 'japanese', 'korean', 'arabic', 'dutch', 'portuguese', 'russian', 'english', 'swedish', 'polish', 'turkish', 'hindi'];
const LEVEL_WORDS = '(?:fluent|fluency|native|mother tongue|proficient|proficiency|business[- ]level|professional working|excellent|strong|full professional)';
const LEVEL_RANK = { basic: 1, elementary: 1, conversational: 2, intermediate: 2, working: 3, professional: 3, fluent: 4, bilingual: 5, native: 5 };

// Languages the posting demands at a professional level that the profile lacks.
export function languageGaps(description, profileLanguages = []) {
  const text = ` ${String(description || '').toLowerCase()} `;
  const have = new Map(profileLanguages.map((l) => [norm(l.name), LEVEL_RANK[norm(l.level)] ?? 3]));
  if (have.has('mandarin')) have.set('chinese', have.get('mandarin'));
  if (have.has('chinese')) have.set('mandarin', have.get('chinese'));
  const gaps = new Set();
  const optional = /^[^.\n;]{0,45}\b(a plus|is a plus|plus|preferred|desirable|nice to have|an advantage|advantageous|beneficial|a bonus|helpful)\b/i;
  for (const lang of LANGS) {
    const a = new RegExp(`${LEVEL_WORDS}[^.\\n;]{0,40}\\b${lang}\\b`, 'gi');
    const b = new RegExp(`\\b${lang}\\b[^.\\n;]{0,30}\\b(?:required|essential|mandatory|a must|is a must|fluency|native|proficiency)`, 'gi');
    let required = false;
    for (const re of [a, b]) {
      for (const m of text.matchAll(re)) {
        const after = text.slice(m.index + m[0].length, m.index + m[0].length + 60);
        if (!optional.test(after) && !/\b(plus|preferred|desirable|advantage)\b/i.test(m[0])) { required = true; break; }
      }
      if (required) break;
    }
    if (required) {
      const lvl = have.get(lang) ?? 0;
      if (lvl < 4) gaps.add(lang === 'chinese' ? 'mandarin' : lang);
    }
  }
  return [...gaps];
}

// Title words that say nothing about the field on their own ("Analyst", "Intern").
export const GENERIC_TITLE_WORDS = new Set(['analyst', 'analysts', 'associate', 'associates', 'intern', 'interns', 'internship', 'internships',
  'graduate', 'graduates', 'summer', 'spring', 'winter', 'off cycle', 'consultant', 'summer analyst', 'summer associate', 'graduate programme',
  'graduate program', 'analyst programme', 'analyst program', 'penultimate', 'trainee', 'junior']);

// Domain keywords found in a description (used when the title is generic).
export function domainHits(description, keywords) {
  const d = ` ${norm(description).slice(0, 15000)} `;
  return keywords.map(norm).filter((k) => k.length > 2 && d.includes(` ${k} `));
}

function hit(textN, phraseN) {
  return phraseN && ` ${textN} `.includes(` ${phraseN} `);
}

export function prefilter(jobs, targets = {}, { existing = [], now = new Date(), keywords = [] } = {}) {
  const inc = (targets.titleKeywords || []).map(norm).filter(Boolean);
  const exc = (targets.excludeKeywords ?? DEFAULT_EXCLUDE).map(norm).filter(Boolean);
  const locs = (targets.locations || []).flatMap(expandLocation).map(norm).filter(Boolean);
  const maxAge = targets.maxAgeDays ?? 45;
  const kw = keywords.map(norm).filter((k) => k.length > 2);
  const seenKeys = new Set(existing.map((j) => j.key).filter(Boolean));
  const seenFp = new Set(existing.map((j) => j.fingerprint || fingerprint({ company: j.company, title: j.role || j.title, location: j.location })));
  const kept = [];
  const dropped = {};
  const drop = (r) => { dropped[r] = (dropped[r] || 0) + 1; };

  for (const j of jobs) {
    if (!j || !j.title) { drop('no_title'); continue; }
    if (j.key && seenKeys.has(j.key)) { drop('already_tracked'); continue; }
    const fp = fingerprint(j);
    if (seenFp.has(fp)) { drop('duplicate'); continue; }
    seenFp.add(fp);
    if (j.key) seenKeys.add(j.key);

    const t = norm(j.title);
    if (exc.some((k) => hit(t, k))) { drop('too_senior_or_excluded'); continue; }
    const titleHits = inc.filter((k) => hit(t, k));
    if (inc.length && !titleHits.length) { drop('title_mismatch'); continue; }
    // Programme postings ("2027 Analyst Programme", "Summer Internship") often have generic text; keep them for Claude to judge.
    const programme = /\b(202[6-9]|programme|program|graduate|summer|spring|off cycle|internship|insight)\b/.test(t);
    const genericOnly = titleHits.length > 0 && titleHits.every((k) => GENERIC_TITLE_WORDS.has(k)) && !programme;
    if (genericOnly && (j.description || '').length > 200 && domainHits(j.description, keywords).length < 2) { drop('generic_title_off_field'); continue; }

    const l = norm(j.location);
    const isRemote = j.remote === true || hit(l, 'remote');
    const locMatch = !locs.length || locs.some((x) => hit(l, x)) || (isRemote && !!targets.remoteOk);
    if (j.location && !locMatch) { drop('location_mismatch'); continue; }

    const age = daysAgo(j.postedAt, now);
    // Campus and programme postings stay open for months.
    const longLived = /\b(202[6-9]|graduates?|programme|program|intern|internship|summer|off cycle|stage)\b/.test(t);
    if (age !== null && age > (longLived ? Math.max(maxAge, 150) : maxAge)) { drop('too_old'); continue; }

    // 0-100 ranking score. Only used to decide what Claude reads first.
    const titleScore = Math.min(40, titleHits.reduce((s, k) => s + 8 * Math.min(3, k.split(' ').length), 0) + (titleHits.length ? 8 : 0));
    const locScore = !j.location ? 10 : locMatch ? 25 : 0;
    const ageScore = age === null ? 8 : age <= 7 ? 15 : age <= 21 ? 10 : 5;
    const d = norm(j.description).slice(0, 15000);
    const kwHits = kw.filter((k) => hit(d, k));
    const descScore = Math.min(20, kwHits.length * 4);
    const langGap = languageGaps(j.description, targets.languages || []);
    const score = Math.max(0, titleScore + locScore + ageScore + descScore - langGap.length * 15);

    kept.push({ ...j, fingerprint: fp, ageDays: age, pre: { score, titleHits, genericOnly, keywordHits: kwHits.slice(0, 12), languageGaps: langGap, remote: isRemote } });
  }
  kept.sort((a, b) => b.pre.score - a.pre.score);
  return { kept, dropped };
}
