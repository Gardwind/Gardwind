// Quick environment check used at the start of every cloud run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { truthCheck } from './truth.mjs';
import { scamCheck } from './scam.mjs';
import { prefilter } from './filter.mjs';

export const SAMPLE_MASTER = {
  basics: { name: 'Alex Sample', email: 'alex.sample@example.com', phone: '+44 7700 900123', location: 'London, UK' },
  education: [{ id: 'edu-1', institution: 'Example University', degree: 'MSc Finance', location: 'London, UK', start: '2024-09', end: '2025-07', details: [{ id: 'edu-1-1', text: 'Relevant modules: Corporate Finance, Econometrics' }] }],
  work: [{ id: 'w-1', organization: 'Example Advisory', position: 'Restructuring Intern', location: 'Paris, France', start: '2025-01', end: '2025-06', highlights: [
    { id: 'w-1-1', text: 'Analysed financial statements for 15+ distressed companies to assess restructuring viability' },
    { id: 'w-1-2', text: 'Prepared creditor presentations for restructuring negotiations' },
  ] }],
  activities: [],
  skills: [{ id: 's-1', category: 'Technical', items: ['Excel (Advanced)', 'R'] }],
  interests: ['Bouldering'],
};

export async function selftest() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, ...(detail ? { detail } : {}) });

  const good = structuredClone(SAMPLE_MASTER);
  good.work[0].highlights = [{ text: 'Assessed restructuring viability for 15+ distressed companies by analysing their financial statements', src: ['w-1-1'] }];
  add('truth check accepts a faithful rewrite', truthCheck(SAMPLE_MASTER, good).ok);

  const bad = structuredClone(good);
  bad.work[0].highlights = [{ text: 'Built LBO models for 40 distressed companies', src: ['w-1-1'] }];
  const tb = truthCheck(SAMPLE_MASTER, bad);
  add('truth check rejects invented numbers and skills', !tb.ok && tb.errors.some((e) => e.type === 'new_number') && tb.errors.some((e) => e.type === 'new_term'));

  add('scam screen flags fee + Telegram', scamCheck({ title: 'Data entry', company: 'X', description: 'Contact our HR on Telegram. A small registration fee is required before training.' }).risk === 'high');
  add('prefilter keeps a matching job', prefilter([{ key: 'k', title: 'Restructuring Analyst', company: 'A', location: 'London, UK', description: '' }], { titleKeywords: ['restructuring'], locations: ['London'] }).kept.length === 1);

  try {
    const { renderResumePdf, atsCheck } = await import('./resume.mjs');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpipe-'));
    const pdf = await renderResumePdf(good, path.join(dir, 'cv.pdf'));
    add('Chromium renders a one-page CV PDF', pdf.pages === 1, `${pdf.pages} page(s) at ${pdf.fontPt}pt`);
    const ats = atsCheck(pdf.path, good);
    add('CV PDF text is machine-readable', ats.ok, ats.skipped || `coverage ${ats.coverage}%`);
  } catch (e) {
    add('Chromium renders a one-page CV PDF', false, e.message.split('\n')[0]);
  }
  return { ok: checks.every((c) => c.ok), checks };
}
