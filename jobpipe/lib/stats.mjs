// Funnel numbers from the board's jobs, used for the daily digest and the
// weekly "what's working" review.
import { daysAgo } from './util.mjs';

const APPLIED_OR_LATER = new Set(['applied', 'screening', 'interviewing', 'offer', 'accepted', 'rejected', 'ghosted', 'withdrawn']);
const REPLIED = new Set(['screening', 'interviewing', 'offer', 'accepted']);

function appliedDate(j) {
  if (j.appliedOn) return j.appliedOn;
  const h = (j.history || []).find((x) => x.status === 'applied');
  return h?.on || null;
}

function gotReply(j) {
  if (REPLIED.has(j.status)) return true;
  if (j.status === 'rejected') return (j.history || []).some((h) => h.status === 'rejected') && !!appliedDate(j);
  return false;
}

function bucket(map, key, j) {
  const k = key || 'unknown';
  map[k] ||= { applied: 0, replies: 0, interviews: 0 };
  map[k].applied++;
  if (gotReply(j)) map[k].replies++;
  if (['interviewing', 'offer', 'accepted'].includes(j.status) || (j.history || []).some((h) => h.status === 'interviewing')) map[k].interviews++;
}

export function computeStats(jobs, now = new Date()) {
  const byStatus = {};
  for (const j of jobs) byStatus[j.status || 'unknown'] = (byStatus[j.status || 'unknown'] || 0) + 1;
  const applied = jobs.filter((j) => APPLIED_OR_LATER.has(j.status) && appliedDate(j));
  const last7 = applied.filter((j) => (daysAgo(appliedDate(j), now) ?? 999) <= 7).length;
  const last30 = applied.filter((j) => (daysAgo(appliedDate(j), now) ?? 999) <= 30).length;
  const replies = applied.filter(gotReply).length;
  const interviews = applied.filter((j) => ['interviewing', 'offer', 'accepted'].includes(j.status) || (j.history || []).some((h) => h.status === 'interviewing')).length;
  const bySource = {};
  const byFit = {};
  for (const j of applied) {
    bucket(bySource, (j.source || '').split(':')[0], j);
    const f = j.fit?.score;
    bucket(byFit, f >= 85 ? '85+' : f >= 75 ? '75-84' : f >= 65 ? '65-74' : f ? '<65' : 'unscored', j);
  }
  const skipReasons = {};
  for (const j of jobs.filter((x) => x.status === 'skipped')) {
    const r = j.decision?.skipReason || 'no reason';
    skipReasons[r] = (skipReasons[r] || 0) + 1;
  }
  const waiting = applied.filter((j) => j.status === 'applied').map((j) => ({ id: j.id, company: j.company, role: j.role || j.title, days: daysAgo(appliedDate(j), now) }));
  return {
    total: jobs.length,
    byStatus,
    applied: applied.length,
    appliedLast7: last7,
    appliedLast30: last30,
    replies,
    interviews,
    replyRate: applied.length ? Math.round((replies / applied.length) * 100) : null,
    interviewRate: applied.length ? Math.round((interviews / applied.length) * 100) : null,
    bySource,
    byFit,
    skipReasons,
    followUpDue: waiting.filter((w) => w.days !== null && w.days >= 10 && w.days < 30),
    ghostedCandidates: waiting.filter((w) => w.days !== null && w.days >= 30),
  };
}
