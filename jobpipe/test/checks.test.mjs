import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, relativePostedToISO, docIdFor, norm, parseArgs } from '../lib/util.mjs';
import { prefilter, languageGaps, fingerprint } from '../lib/filter.mjs';
import { scamCheck, staleCheck } from '../lib/scam.mjs';
import { truthCheck, textCheck, numbersIn } from '../lib/truth.mjs';
import { computeStats } from '../lib/stats.mjs';
import { SAMPLE_MASTER } from '../lib/selftest.mjs';

const NOW = new Date('2026-11-02T12:00:00Z');

test('htmlToText handles entities, lists and scripts', () => {
  assert.equal(htmlToText('<p>A &amp; B</p><script>x()</script><ul><li>One</li><li>Two</li></ul>'), 'A & B\n\n• One\n• Two');
  assert.equal(htmlToText('&lt;p&gt;Encoded &amp;amp; twice&lt;/p&gt;'), 'Encoded & twice');
});

test('relative Workday dates', () => {
  assert.equal(relativePostedToISO('Posted Today', NOW).slice(0, 10), '2026-11-02');
  assert.equal(relativePostedToISO('Posted Yesterday', NOW).slice(0, 10), '2026-11-01');
  assert.equal(relativePostedToISO('Posted 3 Days Ago', NOW).slice(0, 10), '2026-10-30');
  assert.equal(relativePostedToISO('Posted 30+ Days Ago', NOW).slice(0, 10), '2026-10-02');
  assert.equal(relativePostedToISO('whenever', NOW), null);
});

test('document ids fit the board database grammar', () => {
  const id = docIdFor({ company: 'Rothschild & Co', title: 'Analyst – Debt Advisory (Paris)', key: 'x' });
  assert.match(id, /^[a-z0-9-]+$/);
  assert.ok(id.length < 70);
  assert.equal(id, docIdFor({ company: 'Rothschild & Co', title: 'Analyst – Debt Advisory (Paris)', key: 'x' }));
});

test('parseArgs', () => {
  assert.deepEqual(parseArgs(['fetch', '--out', 'a.json', '--submit', '--limit=5']), { _: ['fetch'], out: 'a.json', submit: true, limit: '5' });
});

const targets = {
  titleKeywords: ['restructuring', 'private equity', 'analyst', 'business analyst', 'venture'],
  locations: ['London', 'Hong Kong', 'Paris'],
  maxAgeDays: 45,
  languages: [{ name: 'English', level: 'native' }, { name: 'French', level: 'native' }, { name: 'Mandarin', level: 'basic' }],
};

test('prefilter drops senior, wrong place, stale, duplicate and tracked jobs', () => {
  const jobs = [
    { key: 'a', company: 'A', title: 'Restructuring Analyst', location: 'London, UK', postedAt: '2026-10-30', description: 'distressed debt restructuring' },
    { key: 'b', company: 'B', title: 'Senior Restructuring Analyst', location: 'London', postedAt: '2026-10-30' },
    { key: 'c', company: 'C', title: 'Private Equity Analyst', location: 'Berlin, Germany', postedAt: '2026-10-30' },
    { key: 'd', company: 'D', title: 'Venture Analyst', location: 'HK', postedAt: '2026-08-01' },
    { key: 'e', company: 'A', title: 'Restructuring Analyst', location: 'London', postedAt: '2026-10-30' },
    { key: 'f', company: 'F', title: 'Office Manager', location: 'London' },
    { key: 'g', company: 'G', title: 'Business Analyst', location: '', postedAt: null },
    { key: 'tracked', company: 'T', title: 'Analyst', location: 'Paris' },
  ];
  const { kept, dropped } = prefilter(jobs, targets, { existing: [{ key: 'tracked' }], now: NOW, keywords: ['restructuring', 'distressed'] });
  assert.deepEqual(kept.map((j) => j.key), ['a', 'g']);
  assert.deepEqual(dropped, { too_senior_or_excluded: 1, location_mismatch: 1, too_old: 1, duplicate: 1, title_mismatch: 1, already_tracked: 1 });
  assert.ok(kept[0].pre.score > kept[1].pre.score);
  assert.deepEqual(kept[0].pre.keywordHits.sort(), ['distressed', 'restructuring']);
});

test('existing board jobs dedupe by fingerprint even without a key', () => {
  const existing = [{ company: 'Acme', role: 'Analyst', location: 'London, UK' }];
  const { kept } = prefilter([{ key: 'new', company: 'ACME', title: 'Analyst', location: 'London' }], targets, { existing, now: NOW });
  assert.equal(kept.length, 0);
  assert.equal(fingerprint({ company: 'Acme', title: 'Analyst (m/f/d)', location: 'Berlin' }), 'acme|analyst|berlin');
});

test('language gaps: required vs nice-to-have', () => {
  const langs = targets.languages;
  assert.deepEqual(languageGaps('Fluent Mandarin is required for client meetings.', langs), ['mandarin']);
  assert.deepEqual(languageGaps('Mandarin is a plus.', langs), []);
  assert.deepEqual(languageGaps('Native-level Chinese preferred', langs), []);
  assert.deepEqual(languageGaps('Excellent written English and French; German is essential.', langs), ['german']);
  assert.deepEqual(languageGaps('Proficiency in English and Cantonese required', langs), ['cantonese']);
});

test('scam screen', () => {
  assert.equal(scamCheck({ title: 'Analyst', company: 'Real Bank', description: 'We are looking for a graduate analyst to join our restructuring team in London. You will build models, draft materials and support live deals. '.repeat(3) }).risk, 'low');
  const s = scamCheck({ title: 'Remote assistant', company: 'Confidential', description: 'Earn $300 per day! Contact HR on WhatsApp. Send your passport copy and bank details to start.' });
  assert.equal(s.risk, 'high');
  assert.ok(s.reasons.length >= 3);
  assert.equal(scamCheck({ title: 'Analyst', company: 'X Ltd', description: 'Email your CV to hiring.xltd@gmail.com — immediate start. '.repeat(5) }).risk, 'medium');
  assert.equal(staleCheck({ title: 'Talent Community - General Application', description: '' }, 3).stale, true);
  assert.equal(staleCheck({ title: 'Analyst', description: '' }, 60).reasons[0], 'Posted 60 days ago');
});

test('numbersIn normalises currency, commas, plus and percent', () => {
  assert.deepEqual(numbersIn('€3,000+ raised, 15+ firms, 25% faster, GPA 3.6'), ['3000', '15', '25', '3.6']);
});

test('truth check: reorder and reword ok; inventions caught', () => {
  const t = structuredClone(SAMPLE_MASTER);
  t.work[0].highlights = [
    { text: 'Prepared creditor-facing presentations to support restructuring negotiations', src: ['w-1-2'] },
    { text: 'Assessed the restructuring viability of 15+ distressed companies through financial statement analysis', src: ['w-1-1'] },
  ];
  t.skills = [{ category: 'Technical', items: ['Excel (Advanced)'] }];
  assert.equal(truthCheck(SAMPLE_MASTER, t).ok, true);

  const bad = structuredClone(t);
  bad.work[0].position = 'Restructuring Analyst';
  bad.work[0].end = '2025-09';
  bad.work[0].highlights.push({ text: 'Built DCF and LBO models in Python for 30 companies', src: ['w-1-1'] });
  bad.work[0].highlights.push({ text: 'Led a team of analysts', src: [] });
  bad.work.push({ id: 'w-9', organization: 'Goldman Sachs', position: 'Intern', highlights: [] });
  bad.skills[0].items.push('Bloomberg');
  const r = truthCheck(SAMPLE_MASTER, bad);
  const types = r.errors.map((e) => e.type).sort();
  assert.deepEqual([...new Set(types)].sort(), ['changed_field', 'new_number', 'new_skill', 'new_term', 'no_source', 'unknown_entry']);
  assert.equal(r.errors.filter((e) => e.type === 'changed_field').length, 2);
  assert.deepEqual(r.errors.find((e) => e.type === 'new_term').terms.sort(), ['dcf', 'lbo', 'python']);
});

test('truth check warns when a bullet drifts away from its source', () => {
  const t = structuredClone(SAMPLE_MASTER);
  t.work[0].highlights = [{ text: 'Championed cross-functional stakeholder alignment initiatives', src: ['w-1-2'] }];
  const r = truthCheck(SAMPLE_MASTER, t);
  assert.equal(r.ok, true);
  assert.equal(r.warnings[0].type, 'drift');
});

test('textCheck for cover letters', () => {
  assert.equal(textCheck('I analysed 15+ distressed companies and start in 2027.', SAMPLE_MASTER).ok, true);
  const r = textCheck('I closed 12 deals using Capital IQ.', SAMPLE_MASTER);
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues.map((i) => i.type), ['new_number', 'new_term']);
});

test('stats', () => {
  const jobs = [
    { id: '1', status: 'applied', appliedOn: '2026-10-30', source: 'greenhouse:a', fit: { score: 88 } },
    { id: '2', status: 'interviewing', appliedOn: '2026-10-10', source: 'workday:b', fit: { score: 80 }, history: [{ status: 'applied', on: '2026-10-10' }, { status: 'interviewing', on: '2026-10-20' }] },
    { id: '3', status: 'rejected', appliedOn: '2026-10-01', source: 'greenhouse:c', history: [{ status: 'applied', on: '2026-10-01' }, { status: 'rejected', on: '2026-10-15' }] },
    { id: '4', status: 'applied', appliedOn: '2026-10-20', source: 'lever:d' },
    { id: '5', status: 'skipped', decision: { skipReason: 'location' } },
    { id: '6', status: 'ready' },
  ];
  const s = computeStats(jobs, NOW);
  assert.equal(s.applied, 4);
  assert.equal(s.appliedLast7, 1);
  assert.equal(s.replies, 2);
  assert.equal(s.replyRate, 50);
  assert.equal(s.interviews, 1);
  assert.equal(s.bySource.greenhouse.applied, 2);
  assert.deepEqual(s.skipReasons, { location: 1 });
  assert.deepEqual(s.followUpDue.map((f) => f.id), ['4']);
});

test('norm strips accents and punctuation', () => {
  assert.equal(norm('Zürich – Genève & Bâle'), 'zurich geneve and bale');
});
