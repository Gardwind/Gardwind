// Job sources: public applicant-tracking-system (ATS) job board APIs, a few
// open job aggregators, and a generic fallback that reads schema.org
// JobPosting data from any careers page. Every fetcher returns jobs in one
// normalized shape (see `job()` below).
import { getJSON, getText } from './http.mjs';
import { htmlToText, decodeEntities, clip, hash, relativePostedToISO, mapLimit } from './util.mjs';

const DESC_MAX = 12000;

export function job(o) {
  return {
    key: o.key,
    source: o.source,
    ats: o.ats ?? o.source,
    board: o.board ?? null,
    company: decodeEntities(String(o.company || '')).trim(),
    title: decodeEntities(String(o.title || '')).trim(),
    location: String(o.location || '').trim(),
    remote: o.remote ?? null,
    url: o.url || null,
    applyUrl: o.applyUrl || o.url || null,
    postedAt: o.postedAt || null,
    department: o.department || null,
    employmentType: o.employmentType || null,
    salary: o.salary || null,
    description: clip(o.description || '', DESC_MAX),
    ...(o.detailUrl ? { detailUrl: o.detailUrl } : {}),
    ...(o.form ? { form: o.form } : {}),
  };
}

// ---------- ATS board fetchers (one company board each) ----------

export async function fetchGreenhouse(e) {
  const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(e.slug)}`;
  const data = await getJSON(`${base}/jobs?content=true`);
  let company = e.company;
  if (!company) {
    try { company = (await getJSON(base)).name; } catch { /* name is optional */ }
  }
  return (data.jobs || []).map((j) => job({
    key: `greenhouse:${e.slug}:${j.id}`,
    source: 'greenhouse',
    board: e.slug,
    company: company || e.slug,
    title: j.title,
    location: j.location?.name || (j.offices || []).map((o) => o.name).join('; '),
    url: j.absolute_url,
    postedAt: j.first_published || j.updated_at || null,
    department: (j.departments || []).map((d) => d.name).join(', ') || null,
    remote: /remote/i.test(j.location?.name || '') ? true : null,
    description: htmlToText(j.content),
  }));
}

function leverJob(e, p) {
  const lists = (p.lists || []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join('\n\n');
  const s = p.salaryRange;
  const salary = s && (s.min || s.max) ? `${s.currency || ''} ${s.min ?? ''}–${s.max ?? ''} ${s.interval || ''}`.replace(/\s+/g, ' ').trim() : null;
  const wt = (p.workplaceType || '').toLowerCase();
  return job({
    key: `lever:${e.slug}:${p.id}`,
    source: 'lever',
    board: e.slug,
    company: e.company || e.slug,
    title: p.text,
    location: p.categories?.location || (p.categories?.allLocations || []).join('; '),
    url: p.hostedUrl,
    applyUrl: p.applyUrl || (p.hostedUrl ? `${p.hostedUrl.replace(/\/$/, '')}/apply` : null),
    postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    department: p.categories?.team || p.categories?.department || null,
    employmentType: p.categories?.commitment || null,
    salary,
    remote: wt === 'remote' ? true : wt === 'hybrid' ? 'hybrid' : wt === 'onsite' ? false : null,
    description: [p.descriptionPlain || htmlToText(p.description), lists, p.additionalPlain || htmlToText(p.additional)].filter(Boolean).join('\n\n'),
  });
}

export async function fetchLever(e) {
  const host = e.region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
  const arr = await getJSON(`https://${host}/v0/postings/${encodeURIComponent(e.slug)}?mode=json`);
  return (Array.isArray(arr) ? arr : []).map((p) => leverJob(e, p));
}

function ashbyJob(e, j) {
  const wt = String(j.workplaceType || '').toLowerCase();
  return job({
    key: `ashby:${e.slug}:${j.id}`,
    source: 'ashby',
    board: e.slug,
    company: e.company || e.slug,
    title: j.title,
    location: [j.location, ...(j.secondaryLocations || []).map((s) => s.location)].filter(Boolean).join('; '),
    url: j.jobUrl,
    applyUrl: j.applyUrl || (j.jobUrl ? `${j.jobUrl.replace(/\/$/, '')}/application` : null),
    postedAt: j.publishedAt || null,
    department: j.department || j.team || null,
    employmentType: j.employmentType || null,
    salary: j.compensation?.compensationTierSummary || j.compensation?.scrapeableCompensationSalarySummary || null,
    remote: j.isRemote || wt === 'remote' ? true : wt === 'hybrid' ? 'hybrid' : null,
    description: j.descriptionPlain || htmlToText(j.descriptionHtml),
  });
}

export async function fetchAshby(e) {
  const data = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(e.slug)}?includeCompensation=true`);
  return (data.jobs || []).filter((j) => j.isListed !== false).map((j) => ashbyJob(e, j));
}

export async function fetchSmartRecruiters(e) {
  const all = [];
  for (let offset = 0, page = 0; page < 6; page++, offset += 100) {
    const data = await getJSON(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(e.slug)}/postings?limit=100&offset=${offset}`);
    all.push(...(data.content || []));
    if (offset + 100 >= (data.totalFound || 0)) break;
  }
  return all.map((p) => job({
    key: `smartrecruiters:${e.slug}:${p.id}`,
    source: 'smartrecruiters',
    board: e.slug,
    company: e.company || p.company?.name || e.slug,
    title: p.name,
    location: p.location?.fullLocation || [p.location?.city, p.location?.region, (p.location?.country || '').toUpperCase()].filter(Boolean).join(', '),
    remote: p.location?.remote ? true : p.location?.hybrid ? 'hybrid' : null,
    url: `https://jobs.smartrecruiters.com/${e.slug}/${p.id}`,
    postedAt: p.releasedDate || null,
    department: p.department?.label || null,
    employmentType: p.typeOfEmployment?.label || null,
    detailUrl: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(e.slug)}/postings/${p.id}`,
  }));
}

function workdayBase(e) {
  return `https://${e.host}/wday/cxs/${e.tenant}/${e.site}`;
}

function workdayPublicUrl(e, externalPath) {
  if (/myworkdaysite\.com$/.test(e.host)) return `https://${e.host}/recruiting/${e.tenant}/${e.site}${externalPath}`;
  return `https://${e.host}/en-US/${e.site}${externalPath}`;
}

export async function fetchWorkday(e, ctx = {}) {
  const terms = (e.search?.length ? e.search : ctx.searchTerms?.length ? ctx.searchTerms : ['']).slice(0, 8);
  const base = workdayBase(e);
  const seen = new Map();
  const perTerm = e.maxPerTerm || 60;
  for (const term of terms) {
    for (let offset = 0; offset < perTerm; offset += 20) {
      const data = await getJSON(`${base}/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: term }),
      });
      const posts = data.jobPostings || [];
      for (const p of posts) if (p.externalPath && !seen.has(p.externalPath)) seen.set(p.externalPath, p);
      if (posts.length < 20 || offset + 20 >= (data.total || 0)) break;
    }
  }
  return [...seen.values()].map((p) => job({
    key: `workday:${e.tenant}:${p.externalPath.split('/').pop()}`,
    source: 'workday',
    board: `${e.tenant}/${e.site}`,
    company: e.company || e.tenant,
    title: p.title,
    location: p.locationsText || '',
    url: workdayPublicUrl(e, p.externalPath),
    postedAt: relativePostedToISO(p.postedOn),
    detailUrl: `${base}${p.externalPath}`,
  }));
}

export async function fetchRecruitee(e) {
  const data = await getJSON(`https://${e.slug}.recruitee.com/api/offers/`);
  return (data.offers || []).map((o) => job({
    key: `recruitee:${e.slug}:${o.id}`,
    source: 'recruitee',
    board: e.slug,
    company: e.company || o.company_name || e.slug,
    title: o.title,
    location: o.location || [o.city, o.country].filter(Boolean).join(', '),
    remote: o.remote ? true : o.hybrid ? 'hybrid' : null,
    url: o.careers_url,
    applyUrl: o.careers_apply_url || o.careers_url,
    postedAt: o.published_at || o.created_at || null,
    department: o.department || null,
    employmentType: o.employment_type_code || null,
    salary: o.salary?.min ? `${o.salary.currency || ''} ${o.salary.min}–${o.salary.max ?? ''} ${o.salary.period || ''}`.replace(/\s+/g, ' ').trim() : null,
    description: [htmlToText(o.description), htmlToText(o.requirements)].filter(Boolean).join('\n\n'),
  }));
}

function xmlTag(s, t) {
  const m = s.match(new RegExp(`<${t}>([\\s\\S]*?)<\\/${t}>`));
  if (!m) return '';
  return m[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
}

export async function fetchPersonio(e) {
  const domain = e.domain || 'jobs.personio.de';
  const xml = await getText(`https://${e.slug}.${domain}/xml?language=en`);
  const positions = [...xml.matchAll(/<position>([\s\S]*?)<\/position>/g)].map((m) => m[1]);
  return positions.map((p) => {
    const id = xmlTag(p, 'id');
    const descs = [...p.matchAll(/<jobDescription>([\s\S]*?)<\/jobDescription>/g)]
      .map((d) => `${decodeEntities(xmlTag(d[1], 'name'))}\n${htmlToText(xmlTag(d[1], 'value'))}`)
      .join('\n\n');
    return job({
      key: `personio:${e.slug}:${id}`,
      source: 'personio',
      board: e.slug,
      company: e.company || decodeEntities(xmlTag(p, 'subcompany')) || e.slug,
      title: xmlTag(p, 'name'),
      location: decodeEntities(xmlTag(p, 'office')),
      url: `https://${e.slug}.${domain}/job/${id}`,
      postedAt: xmlTag(p, 'createdAt') || null,
      department: decodeEntities(xmlTag(p, 'department')) || null,
      employmentType: xmlTag(p, 'employmentType') || null,
      description: descs,
    });
  });
}

// ---------- Aggregators (search across many companies) ----------

export async function fetchRemotive(e, ctx = {}) {
  const terms = (e.search?.length ? e.search : ctx.searchTerms?.length ? ctx.searchTerms : ['']).slice(0, 5);
  const map = new Map();
  for (const t of terms) {
    const d = await getJSON(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(t)}&limit=100`);
    for (const j of d.jobs || []) map.set(j.id, j);
  }
  return [...map.values()].map((j) => job({
    key: `remotive:${j.id}`,
    source: 'remotive',
    ats: 'other',
    company: j.company_name,
    title: j.title,
    location: j.candidate_required_location || 'Remote',
    remote: true,
    url: j.url,
    postedAt: j.publication_date || null,
    department: j.category || null,
    employmentType: j.job_type || null,
    salary: j.salary || null,
    description: htmlToText(j.description),
  }));
}

export async function fetchArbeitnow(e) {
  const out = [];
  for (let page = 1; page <= (e.pages || 3); page++) {
    const d = await getJSON(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    out.push(...(d.data || []));
    if (!d.links?.next) break;
  }
  return out.map((j) => job({
    key: `arbeitnow:${j.slug}`,
    source: 'arbeitnow',
    ats: 'other',
    company: j.company_name,
    title: j.title,
    location: j.location,
    remote: j.remote ? true : null,
    url: j.url,
    postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
    employmentType: (j.job_types || []).join(', ') || null,
    description: htmlToText(j.description),
  }));
}

export const FETCHERS = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  smartrecruiters: fetchSmartRecruiters,
  workday: fetchWorkday,
  recruitee: fetchRecruitee,
  personio: fetchPersonio,
  remotive: fetchRemotive,
  arbeitnow: fetchArbeitnow,
};

export function describeEntry(e) {
  if (e.ats === 'workday') return `workday:${e.tenant}/${e.site}`;
  return `${e.ats}:${e.slug || ''}`;
}

// Fetch every watchlist entry; one failing board never stops the others.
export async function fetchAll(entries, ctx = {}) {
  const errors = [];
  const counts = {};
  const results = await mapLimit(entries.filter((e) => e && e.enabled !== false), ctx.concurrency || 4, async (e) => {
    const name = describeEntry(e);
    const fn = FETCHERS[e.ats];
    if (!fn) {
      errors.push({ source: name, error: `Unknown source type "${e.ats}"` });
      return [];
    }
    try {
      const jobs = await fn(e, ctx);
      counts[name] = jobs.length;
      return jobs;
    } catch (err) {
      errors.push({ source: name, error: err.message, blocked: !!err.blocked });
      counts[name] = 0;
      return [];
    }
  });
  return { jobs: results.flat(), errors, counts };
}

// ---------- Details for one posting ----------

export async function enrich(j) {
  if (j.description && j.description.length > 200) return j;
  try {
    if (j.source === 'smartrecruiters' && j.detailUrl) {
      const d = await getJSON(j.detailUrl);
      const sec = d.jobAd?.sections || {};
      const text = ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation']
        .map((k) => sec[k] && `${sec[k].title || ''}\n${htmlToText(sec[k].text)}`)
        .filter(Boolean)
        .join('\n\n');
      return { ...j, description: clip(text, DESC_MAX), applyUrl: d.applyUrl || j.applyUrl, url: d.postingUrl || j.url };
    }
    if (j.source === 'workday' && j.detailUrl) {
      const d = await getJSON(j.detailUrl, { headers: { accept: 'application/json' } });
      const info = d.jobPostingInfo || {};
      return {
        ...j,
        company: d.hiringOrganization?.name || j.company,
        title: info.title || j.title,
        location: [info.location, ...(info.additionalLocations || [])].filter(Boolean).join('; ') || j.location,
        description: clip(htmlToText(info.jobDescription), DESC_MAX),
        url: info.externalUrl || j.url,
        applyUrl: info.externalUrl ? `${info.externalUrl.replace(/\/$/, '')}/apply` : j.applyUrl,
        postedAt: info.startDate ? new Date(info.startDate).toISOString() : j.postedAt,
        employmentType: info.timeType || j.employmentType,
      };
    }
    if (j.url && (!j.description || j.description.length < 200)) {
      const html = await getText(j.url);
      const found = extractJobPosting(html, j.url);
      if (found?.description) return { ...j, description: found.description };
    }
  } catch (err) {
    return { ...j, enrichError: err.message };
  }
  return j;
}

// ---------- Board URL parsing ----------

// Turn a careers-board or posting URL into a watchlist entry, e.g.
// https://boards.greenhouse.io/acme/jobs/123 -> {ats:'greenhouse', slug:'acme', jobId:'123'}
export function parseBoardUrl(input) {
  let u;
  try { u = new URL(String(input).trim()); } catch { return null; }
  const h = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (/(^|\.)greenhouse\.io$/.test(h)) {
    if (h.startsWith('boards-api')) return { ats: 'greenhouse', slug: seg[2], jobId: seg[3] === 'jobs' ? seg[4] : undefined };
    const forParam = u.searchParams.get('for');
    if (forParam) return { ats: 'greenhouse', slug: forParam, jobId: u.searchParams.get('token') || undefined };
    if (seg[0] && seg[0] !== 'embed') return { ats: 'greenhouse', slug: seg[0], jobId: seg[1] === 'jobs' ? seg[2] : undefined };
    return null;
  }
  if (/(^|\.)lever\.co$/.test(h)) {
    const region = h.includes('.eu.') ? 'eu' : undefined;
    if (h.startsWith('api')) return { ats: 'lever', slug: seg[2], region, jobId: seg[3] };
    return { ats: 'lever', slug: seg[0], region, jobId: seg[1] && seg[1] !== 'apply' ? seg[1] : undefined };
  }
  if (h === 'jobs.ashbyhq.com') return { ats: 'ashby', slug: seg[0], jobId: seg[1] && seg[1] !== 'application' ? seg[1] : undefined };
  if (h === 'api.ashbyhq.com') return { ats: 'ashby', slug: seg[2] };
  if (/\.myworkdayjobs\.com$/.test(h) || /myworkdaysite\.com$/.test(h)) {
    let rest = seg;
    if (rest[0] && /^[a-z]{2}-[a-z]{2}$/i.test(rest[0])) rest = rest.slice(1);
    if (rest[0] === 'wday' && rest[1] === 'cxs') {
      const jobIdx = rest.indexOf('job');
      return { ats: 'workday', host: h, tenant: rest[2], site: rest[3], jobPath: jobIdx > 0 ? '/' + rest.slice(jobIdx).join('/') : undefined };
    }
    if (rest[0] === 'recruiting') {
      const jobIdx = rest.indexOf('job');
      return { ats: 'workday', host: h, tenant: rest[1], site: rest[2], jobPath: jobIdx > 0 ? '/' + rest.slice(jobIdx).join('/') : undefined };
    }
    const tenant = h.split('.')[0];
    const jobIdx = rest.indexOf('job');
    return { ats: 'workday', host: h, tenant, site: rest[0], jobPath: jobIdx > 0 ? '/' + rest.slice(jobIdx).join('/').replace(/\/apply.*$/, '') : undefined };
  }
  if (h === 'jobs.smartrecruiters.com' || h === 'careers.smartrecruiters.com') return { ats: 'smartrecruiters', slug: seg[0], jobId: seg[1] ? seg[1].split('-')[0] : undefined };
  if (h === 'api.smartrecruiters.com') return { ats: 'smartrecruiters', slug: seg[2], jobId: seg[4] };
  if (h.endsWith('.recruitee.com')) return { ats: 'recruitee', slug: h.split('.')[0], jobSlug: seg[0] === 'o' ? seg[1] : undefined };
  if (/\.jobs\.personio\.(de|com)$/.test(h)) return { ats: 'personio', slug: h.split('.')[0], domain: h.split('.').slice(1).join('.'), jobId: seg[0] === 'job' ? seg[1] : undefined };
  return null;
}

export function detectAts(url) {
  return parseBoardUrl(url)?.ats || 'other';
}

// ---------- schema.org JobPosting extraction (works on most careers pages) ----------

function flattenLd(d) {
  if (Array.isArray(d)) return d.flatMap(flattenLd);
  if (d && typeof d === 'object') return d['@graph'] ? flattenLd(d['@graph']) : [d];
  return [];
}

export function extractJobPosting(html, url) {
  const blocks = [...String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const b of blocks) {
    let data;
    try { data = JSON.parse(b.trim()); } catch { continue; }
    const jp = flattenLd(data).find((x) => [].concat(x['@type'] || []).includes('JobPosting'));
    if (!jp) continue;
    const locs = [].concat(jp.jobLocation || []).map((l) => {
      const a = l?.address || {};
      const country = typeof a.addressCountry === 'object' ? a.addressCountry?.name : a.addressCountry;
      return [a.addressLocality, a.addressRegion, country].filter(Boolean).join(', ');
    }).filter(Boolean);
    const org = typeof jp.hiringOrganization === 'string' ? jp.hiringOrganization : jp.hiringOrganization?.name;
    let salary = null;
    const v = jp.baseSalary?.value;
    if (v) {
      const c = jp.baseSalary.currency || '';
      salary = (v.minValue ? `${c} ${v.minValue}–${v.maxValue ?? ''} ${v.unitText || ''}` : `${c} ${v.value ?? ''} ${v.unitText || ''}`).replace(/\s+/g, ' ').trim();
    }
    const remote = [].concat(jp.jobLocationType || []).includes('TELECOMMUTE');
    return job({
      key: `web:${hash(url)}`,
      source: 'web',
      ats: detectAts(url),
      company: org || '',
      title: jp.title || '',
      location: locs.join('; ') || (remote ? 'Remote' : ''),
      remote: remote ? true : null,
      url,
      postedAt: jp.datePosted || null,
      employmentType: [].concat(jp.employmentType || []).join(', ') || null,
      salary,
      description: htmlToText(jp.description),
    });
  }
  return null;
}

// One posting from any URL (used by /job-add and for links found in job-alert emails).
export async function fetchJobFromUrl(url) {
  const p = parseBoardUrl(url);
  if (p?.ats === 'greenhouse' && p.jobId) {
    const j = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(p.slug)}/jobs/${p.jobId}?questions=true`);
    let company = p.slug;
    try { company = (await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(p.slug)}`)).name || company; } catch { /* optional */ }
    return job({
      key: `greenhouse:${p.slug}:${j.id}`, source: 'greenhouse', board: p.slug, company,
      title: j.title, location: j.location?.name || '', url: j.absolute_url || url,
      postedAt: j.first_published || j.updated_at || null,
      department: (j.departments || []).map((d) => d.name).join(', ') || null,
      description: htmlToText(j.content),
      form: { ats: 'greenhouse', questions: (j.questions || []).map((q) => ({ label: q.label, required: !!q.required, fields: (q.fields || []).map((f) => ({ name: f.name, type: f.type, values: (f.values || []).map((v) => v.label) })) })) },
    });
  }
  if (p?.ats === 'lever' && p.jobId) {
    const host = p.region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
    return leverJob(p, await getJSON(`https://${host}/v0/postings/${encodeURIComponent(p.slug)}/${p.jobId}`));
  }
  if (p?.ats === 'ashby' && p.jobId) {
    const data = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(p.slug)}?includeCompensation=true`);
    const j = (data.jobs || []).find((x) => x.id === p.jobId);
    if (j) return ashbyJob(p, j);
  }
  if (p?.ats === 'workday' && p.jobPath) {
    const stub = job({ key: `workday:${p.tenant}:${p.jobPath.split('/').pop()}`, source: 'workday', board: `${p.tenant}/${p.site}`, company: p.tenant, title: '', url, detailUrl: `${workdayBase(p)}${p.jobPath}` });
    return enrich(stub);
  }
  if (p?.ats === 'smartrecruiters' && p.jobId) {
    const stub = job({ key: `smartrecruiters:${p.slug}:${p.jobId}`, source: 'smartrecruiters', board: p.slug, company: p.slug, title: '', url, detailUrl: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(p.slug)}/postings/${p.jobId}` });
    const d = await getJSON(stub.detailUrl);
    const e2 = await enrich(stub);
    return { ...e2, title: d.name || e2.title, company: d.company?.name || e2.company, location: d.location?.fullLocation || [d.location?.city, d.location?.country].filter(Boolean).join(', '), postedAt: d.releasedDate || null };
  }
  if (p?.ats === 'recruitee' && p.jobSlug) {
    const all = await fetchRecruitee(p);
    const found = all.find((j) => (j.url || '').includes(`/o/${p.jobSlug}`));
    if (found) return found;
  }
  if (p?.ats === 'personio' && p.jobId) {
    const all = await fetchPersonio(p);
    const found = all.find((j) => j.key.endsWith(`:${p.jobId}`));
    if (found) return found;
  }
  // Any other careers page.
  const html = await getText(url);
  const found = extractJobPosting(html, url);
  if (found) return found;
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  return job({ key: `web:${hash(url)}`, source: 'web', ats: detectAts(url), title, url, description: htmlToText(html) });
}
