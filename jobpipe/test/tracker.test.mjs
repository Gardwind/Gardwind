// The owner's applications sheet: grouping, order, CSV escaping and link formulas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackerRows, trackerCSV, TRACKER_HEADER } from '../lib/tracker.mjs';

const jobs = [
  { id: 'a', company: 'Alpha, Inc', role: 'Analyst "Paris"', location: 'Paris', status: 'applied', appliedOn: '2026-11-03', nextStep: 'Wait for reply', nextDate: '2026-11-13', applyUrl: 'https://a.example/apply', emails: [{ at: '2026-11-04T09:00:00Z', kind: 'received', subject: 'Thanks' }] },
  { id: 'b', company: 'Beta', role: 'Intern', location: 'London', status: 'manual', deadline: '2026-11-20', blocker: { action: 'Apply by hand' }, applyUrl: 'https://b.example' },
  { id: 'c', company: 'Gamma', role: '=cmd', status: 'manual', deadline: '2026-11-10', fit: { score: 70 } },
  { id: 'd', company: 'Delta', role: 'Analyst', status: 'skipped', updatedAt: '2026-11-01T00:00:00Z' },
  { id: 'e', company: 'Eps', role: 'Lead', status: 'found' },
];

test('rows are grouped To do, In progress, Closed, Leads; soonest deadline first', () => {
  const rows = trackerRows(jobs);
  assert.deepEqual(rows.map((r) => r.firm), ['Gamma', 'Beta', 'Alpha, Inc', 'Delta', 'Eps']);
  assert.deepEqual(rows.map((r) => r.group), ['To do', 'To do', 'In progress', 'Closed', 'Leads']);
  assert.equal(rows[2].todo, 'Wait for reply by 2026-11-13');
  assert.equal(rows[2].lastEmail, '2026-11-04 · received: Thanks');
  assert.equal(rows[3].todo, '');
  assert.equal(rows[2].deadline, '');
});

test('CSV escapes text, never starts a formula from data, and links per row', () => {
  const csv = trackerCSV(trackerRows(jobs));
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], TRACKER_HEADER.join(','));
  assert.equal(lines.length, jobs.length + 1);
  assert.match(lines[1], /,'=cmd,/);
  assert.match(lines[3], /^In progress,"Alpha, Inc","Analyst ""Paris""",Paris,Applied,/);
  assert.match(lines[3], /"=HYPERLINK\(""https:\/\/a\.example\/apply"",""Open""\)"/);
  assert.match(lines[3], /ENCODEURL\(B4\)/);
});
