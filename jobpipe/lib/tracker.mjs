// The owner's applications sheet: one row per job, grouped To do → In progress → Closed → Leads,
// written as CSV so Google Drive turns it into a Google Sheet. Links are HYPERLINK formulas so
// cells stay short; the Gmail column searches the owner's inbox for the firm.
import fs from 'node:fs';
import path from 'node:path';

const LABEL = { saved: 'Saved', found: 'Found', ready: 'Ready for you', approved: 'Approved', applying: 'Sending', applied: 'Applied', screening: 'Screening', interviewing: 'Interviewing', offer: 'Offer', accepted: 'Accepted', rejected: 'Rejected', ghosted: 'No reply', withdrawn: 'Withdrawn', skipped: 'Skipped', blocked: 'Needs you', manual: 'Apply by hand' };
const GROUP = { manual: 0, blocked: 0, ready: 0, approved: 0, applying: 0, applied: 1, screening: 1, interviewing: 1, offer: 1, accepted: 2, rejected: 2, ghosted: 2, withdrawn: 2, skipped: 2, saved: 3, found: 3 };
const GROUP_NAME = ['To do', 'In progress', 'Closed', 'Leads'];

export const TRACKER_HEADER = ['Group', 'Firm', 'Role', 'City', 'Status', 'What to do', 'Deadline', 'Applied on', 'Fit', 'Last email', 'Apply', 'Gmail', 'Updated'];

const day = (s) => (s ? String(s).slice(0, 10) : '');

// Short enough to read in a cell; the full instruction stays on the board card.
function clip(s, max = 150) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = cut.lastIndexOf('. ');
  return end > 60 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '').replace(/[,:;(]$/, '')}…`;
}

function todo(j) {
  return clip(todoText(j));
}

function todoText(j) {
  switch (j.status) {
    case 'manual': case 'blocked': return j.blocker?.action || j.blocker?.detail || 'Needs you: see the card on the board';
    case 'ready': return 'Approve or skip on the board';
    case 'approved': return 'Claude sends it on the next run';
    case 'applying': return 'Being sent';
    case 'saved': case 'found': return 'Claude scores it on the next run';
    case 'accepted': case 'rejected': case 'ghosted': case 'withdrawn': case 'skipped': return j.decision?.reason || '';
    default: return [j.nextStep, j.nextDate ? `by ${day(j.nextDate)}` : ''].filter(Boolean).join(' ');
  }
}

function lastEmail(j) {
  const e = [...(j.emails || [])].sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).pop();
  return e ? `${day(e.at)} · ${[e.kind, e.subject].filter(Boolean).join(': ')}` : '';
}

// Rows in sheet order. jobs: [{id, ...job}]
export function trackerRows(jobs) {
  const g = (j) => GROUP[j.status] ?? 3;
  const due = (j) => j.deadline || j.blocker?.deadline || '9999-12-31';
  const fit = (j) => j.fit?.score ?? -1;
  return [...jobs].sort((a, b) => g(a) - g(b)
    || (g(a) === 0 ? due(a).localeCompare(due(b)) || fit(b) - fit(a)
      : g(a) === 1 ? day(b.appliedOn).localeCompare(day(a.appliedOn))
        : g(a) === 2 ? day(b.updatedAt).localeCompare(day(a.updatedAt))
          : fit(b) - fit(a))
    || String(a.company || '').localeCompare(String(b.company || '')))
    .map((j) => ({
      group: GROUP_NAME[g(j)], firm: j.company || '', role: j.role || '', city: j.location || '', status: LABEL[j.status] || j.status || '',
      todo: todo(j), deadline: [0, 3].includes(g(j)) ? day(j.deadline || j.blocker?.deadline) : '', appliedOn: day(j.appliedOn), fit: j.fit?.score ?? '',
      lastEmail: lastEmail(j), link: j.applyUrl || j.url || j.blocker?.link || '', updated: day(j.updatedAt),
    }));
}

// Plain text never starts a formula; quotes and commas are CSV-escaped.
const text = (v) => { const s = String(v ?? '').replace(/\r?\n/g, ' '); return /^[=+\-@]/.test(s) ? `'${s}` : s; };
const cell = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const link = (url, label) => (url ? `=HYPERLINK("${String(url).replace(/"/g, '%22')}","${label}")` : '');

export function trackerCSV(rows) {
  const lines = [TRACKER_HEADER.map(cell).join(',')];
  rows.forEach((r, i) => {
    const n = i + 2; // sheet row: the header is row 1
    lines.push([
      text(r.group), text(r.firm), text(r.role), text(r.city), text(r.status), text(r.todo), r.deadline, r.appliedOn, String(r.fit), text(r.lastEmail),
      link(r.link, 'Open'), r.firm ? `=HYPERLINK("https://mail.google.com/mail/u/0/#search/"&ENCODEURL(B${n}),"Search")` : '', r.updated,
    ].map(cell).join(','));
  });
  return lines.join('\n') + '\n';
}

// jobs from an ArtifactData out_dir folder of <id>.json files, or one JSON array.
export function loadJobs(p) {
  if (fs.statSync(p).isDirectory()) {
    return fs.readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => ({ id: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(p, f), 'utf8')) }));
  }
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  return Array.isArray(data) ? data : Object.entries(data).map(([id, j]) => ({ id, ...j }));
}
