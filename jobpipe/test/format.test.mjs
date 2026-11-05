// The master CV format: sub-bullets, the owner's own date text, section titles,
// owner-approved alternates for fixed fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumeHTML, allHighlights, entryWhen, letterHTML } from '../lib/resume.mjs';
import { truthCheck } from '../lib/truth.mjs';

const master = {
  basics: { name: 'Alex Sample', email: 'alex@example.com', phone: '+44 7700 900123' },
  education: [{
    id: 'edu-1', institution: 'Example School', degree: 'MSc', location: 'London, UK', start: '2025', end: '2027', when: '2025-2027',
    alternates: { when: ['2025-2028'], end: ['2028'] },
    details: [
      { id: 'edu-1-1', text: 'Thesis: pricing of out-licensing deals; event study and rNPV of each deal' },
      { id: 'edu-1-2', text: 'Consulting project, Project Lead:', sub: [
        { id: 'edu-1-2a', text: 'Led a team of 7 on data quality governance' },
        { id: 'edu-1-2b', text: 'Built an NPV business case, positive in all three scenarios' },
      ] },
    ],
  }],
  work: [{ id: 'w-1', organization: 'MedCo', position: 'Business Analyst Intern', location: 'Palo Alto, US', start: '2026-07', end: '2026-08', when: 'July 2026 (2 months)', highlights: [
    { id: 'w-1-1', text: 'Sized the market (TAM/SAM/SOM) across three competitors' },
  ] }],
  activities: [],
  skills: [{ id: 's-1', category: 'Technical', items: ['Excel', 'R'] }],
  meta: { titles: { work: 'Work Experience', activities: 'Additional Experience' } },
};

test('renders sub-bullets, own date text and custom section titles', () => {
  const html = resumeHTML(master);
  assert.match(html, /<li>Consulting project, Project Lead:<ul class="subl"><li>Led a team of 7/);
  assert.match(html, /July 2026 \(2 months\)/);
  assert.match(html, /2025-2027/);
  assert.match(html, /<h2>Work Experience<\/h2>/);
  assert.equal(entryWhen({ start: '2026-07', end: '2026-08' }), 'Jul 2026 – Aug 2026');
});

test('allHighlights includes sub-bullets', () => {
  const ids = allHighlights(master).map((h) => h.id);
  assert.deepEqual(ids, ['edu-1-1', 'edu-1-2', 'edu-1-2a', 'edu-1-2b', 'w-1-1']);
});

test('truth check: sub-bullets need sources, alternates are allowed, other changes are not', () => {
  const t = structuredClone(master);
  t.education[0].when = '2025-2028';
  t.education[0].details = [{ text: 'Consulting project, Project Lead:', src: ['edu-1-2'], sub: [{ text: 'Led a 7-person team on data quality governance', src: ['edu-1-2a'] }] }];
  t.work[0].highlights = [{ text: 'Sized the TAM, SAM and SOM across three competitors', src: ['w-1-1'] }];
  assert.equal(truthCheck(master, t).ok, true, JSON.stringify(truthCheck(master, t).errors));

  const bad = structuredClone(t);
  bad.education[0].when = '2024-2028';
  bad.work[0].when = 'June 2026 (3 months)';
  bad.education[0].details[0].sub.push({ text: 'Led a team of 12', src: ['edu-1-2a'] }, { text: 'Built a model', src: [] });
  const r = truthCheck(master, bad);
  const types = r.errors.map((e) => `${e.type}:${e.field || ''}`).sort();
  assert.deepEqual(types, ['changed_field:when', 'changed_field:when', 'new_number:', 'no_source:']);
});

test('cover letter has no header and is set in Times New Roman 12 pt', () => {
  const letter = { date: '5 November 2026', subject: 'Application: Analyst', company: 'Firm', location: 'Paris', salutation: 'Dear Advisory team,', paragraphs: ['One.', 'Two.'] };
  const html = letterHTML(letter, master.basics);
  assert.match(html, /font-family: 'Times New Roman'/);
  assert.match(html, /font-size: 12pt/);
  assert.match(html, /<body>\n<p>Dear Advisory team,<\/p>/);
  assert.match(html, /<p>Two\.<\/p>\n<p>Sincerely,<\/p>\n<p>Alex Sample<\/p>/);
  for (const s of ['alex@example.com', '+44 7700', '5 November 2026', 'Application: Analyst', 'Paris']) assert.ok(!html.includes(s), s);
  assert.match(letterHTML({ paragraphs: ['x'] }, {}, { fontPt: 11 }), /font-size: 11pt/);
});
