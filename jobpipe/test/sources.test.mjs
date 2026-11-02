// Fetchers against recorded-shape fixtures (no network): global fetch is stubbed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchGreenhouse, fetchLever, fetchAshby, fetchSmartRecruiters, fetchWorkday, fetchRecruitee, fetchPersonio,
  fetchRemotive, fetchAll, enrich, parseBoardUrl, extractJobPosting, fetchJobFromUrl,
} from '../lib/sources.mjs';

const routes = new Map();
const calls = [];
let realFetch;

function route(match, body, { status = 200, type = 'json' } = {}) {
  routes.set(match, { body, status, type });
}

before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    for (const [m, r] of routes) {
      if ((typeof m === 'string' && String(url) === m) || (m instanceof RegExp && m.test(String(url)))) {
        const text = r.type === 'json' ? JSON.stringify(typeof r.body === 'function' ? r.body(opts) : r.body) : r.body;
        return new Response(text, { status: r.status });
      }
    }
    return new Response('not found', { status: 404 });
  };
});
after(() => { globalThis.fetch = realFetch; });

route('https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true', {
  jobs: [{
    id: 4012345, title: 'Analyst, Restructuring', updated_at: '2026-10-20T10:00:00-04:00', first_published: '2026-10-18T09:00:00-04:00',
    location: { name: 'London, United Kingdom' }, absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/4012345',
    content: '&lt;p&gt;Join our &lt;strong&gt;restructuring&lt;/strong&gt; team.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Model cash flows&lt;/li&gt;&lt;/ul&gt;',
    departments: [{ name: 'Advisory' }], offices: [{ name: 'London' }],
  }],
});
route('https://boards-api.greenhouse.io/v1/boards/acme', { name: 'Acme Partners' });
route('https://boards-api.greenhouse.io/v1/boards/acme/jobs/4012345?questions=true', {
  id: 4012345, title: 'Analyst, Restructuring', location: { name: 'London' }, absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/4012345',
  content: '&lt;p&gt;Role&lt;/p&gt;', departments: [], updated_at: '2026-10-20T10:00:00Z',
  questions: [{ label: 'First Name', required: true, fields: [{ name: 'first_name', type: 'input_text', values: [] }] },
    { label: 'Do you require sponsorship?', required: true, fields: [{ name: 'question_1', type: 'multi_value_single_select', values: [{ label: 'Yes', value: 1 }, { label: 'No', value: 0 }] }] }],
});

route('https://api.lever.co/v0/postings/leverco?mode=json', [{
  id: 'a1b2c3', text: 'Investment Analyst', hostedUrl: 'https://jobs.lever.co/leverco/a1b2c3', applyUrl: 'https://jobs.lever.co/leverco/a1b2c3/apply',
  createdAt: Date.parse('2026-10-25T00:00:00Z'), categories: { location: 'Paris', team: 'Investments', commitment: 'Full-time' },
  descriptionPlain: 'We invest in healthcare.', lists: [{ text: 'Requirements', content: '<li>Excel</li><li>French</li>' }], additionalPlain: 'Apply now.',
  workplaceType: 'hybrid', salaryRange: { min: 50000, max: 60000, currency: 'EUR', interval: 'per-year-salary' },
}]);
route('https://api.lever.co/v0/postings/leverco/a1b2c3', {
  id: 'a1b2c3', text: 'Investment Analyst', hostedUrl: 'https://jobs.lever.co/leverco/a1b2c3', categories: { location: 'Paris' }, descriptionPlain: 'We invest.', createdAt: 1761350400000,
});

route('https://api.ashbyhq.com/posting-api/job-board/ashco?includeCompensation=true', {
  jobs: [{ id: 'job-uuid-1', title: 'Venture Associate', location: 'Shanghai', secondaryLocations: [{ location: 'Hong Kong' }], department: 'Investing', isListed: true,
    isRemote: false, descriptionPlain: 'Healthcare venture fund.', publishedAt: '2026-10-28T00:00:00.000Z', employmentType: 'FullTime',
    jobUrl: 'https://jobs.ashbyhq.com/ashco/job-uuid-1', applyUrl: 'https://jobs.ashbyhq.com/ashco/job-uuid-1/application', compensation: { compensationTierSummary: 'CN¥300K – CN¥400K' } },
  { id: 'hidden', title: 'Hidden', isListed: false }],
});

route('https://api.smartrecruiters.com/v1/companies/SRCo/postings?limit=100&offset=0', {
  totalFound: 1, content: [{ id: '744000012345', name: 'Graduate Analyst – Credit', releasedDate: '2026-10-30T08:00:00.000Z',
    location: { city: 'Geneva', region: 'GE', country: 'ch', remote: false }, company: { name: 'SR Company', identifier: 'SRCo' }, department: { label: 'Credit' }, typeOfEmployment: { label: 'Full-time' } }],
});
route('https://api.smartrecruiters.com/v1/companies/SRCo/postings/744000012345', {
  id: '744000012345', name: 'Graduate Analyst – Credit', postingUrl: 'https://jobs.smartrecruiters.com/SRCo/744000012345-graduate-analyst-credit',
  applyUrl: 'https://jobs.smartrecruiters.com/SRCo/744000012345-graduate-analyst-credit?oga=true',
  jobAd: { sections: { companyDescription: { title: 'Company', text: '<p>A bank.</p>' }, jobDescription: { title: 'Job', text: '<p>Credit analysis for corporate clients, analysing financial statements and preparing credit memos for committee review across the portfolio.</p>' } } },
});

route('https://bigbank.wd3.myworkdayjobs.com/wday/cxs/bigbank/BigBank_Careers/jobs', (opts) => {
  const b = JSON.parse(opts.body);
  return b.offset === 0 ? { total: 1, jobPostings: [{ title: 'Restructuring Analyst', externalPath: '/job/London/Restructuring-Analyst_R-1001', locationsText: 'London', postedOn: 'Posted 3 Days Ago', bulletFields: ['R-1001'] }] } : { total: 1, jobPostings: [] };
});
route('https://bigbank.wd3.myworkdayjobs.com/wday/cxs/bigbank/BigBank_Careers/job/London/Restructuring-Analyst_R-1001', {
  jobPostingInfo: { title: 'Restructuring Analyst', jobDescription: '<p>Advise distressed companies on restructuring, liability management and creditor negotiations across EMEA.</p>', location: 'London', timeType: 'Full time', startDate: '2026-10-30', externalUrl: 'https://bigbank.wd3.myworkdayjobs.com/BigBank_Careers/job/London/Restructuring-Analyst_R-1001' },
  hiringOrganization: { name: 'Big Bank plc' },
});

route('https://recco.recruitee.com/api/offers/', {
  offers: [{ id: 99, title: 'Strategy Consultant', location: 'Zurich, Switzerland', remote: false, careers_url: 'https://recco.recruitee.com/o/strategy-consultant',
    careers_apply_url: 'https://recco.recruitee.com/o/strategy-consultant/c/new', published_at: '2026-10-29 09:00:00 UTC', description: '<p>Strategy work</p>', requirements: '<p>Masters degree</p>', company_name: 'RecCo', department: 'Consulting' }],
});

route('https://perco.jobs.personio.de/xml?language=en', `<?xml version="1.0" encoding="UTF-8"?>
<workzag-jobs><position><id>1234567</id><subcompany>PerCo GmbH</subcompany><office>Basel</office><department>Finance</department><name>Junior Analyst (m/f/d)</name>
<jobDescriptions><jobDescription><name>Your tasks</name><value><![CDATA[<ul><li>Valuation</li></ul>]]></value></jobDescription></jobDescriptions>
<employmentType>permanent</employmentType><createdAt>2026-10-27T10:00:00+00:00</createdAt></position></workzag-jobs>`, { type: 'text' });

route(/^https:\/\/remotive\.com\/api\/remote-jobs\?/, { jobs: [{ id: 5, url: 'https://remotive.com/remote-jobs/finance/x-5', title: 'Financial Analyst', company_name: 'RemoteCo', category: 'Finance', job_type: 'full_time', publication_date: '2026-10-31T00:00:00', candidate_required_location: 'Europe', salary: '', description: '<p>FP&amp;A</p>' }] });

const LD_HTML = `<html><head><title>Careers</title><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"X"},{"@type":"JobPosting","title":"Business Analyst","hiringOrganization":{"@type":"Organization","name":"Consult &amp; Co"},"datePosted":"2026-10-26","jobLocation":[{"@type":"Place","address":{"addressLocality":"Hong Kong","addressCountry":"HK"}}],"description":"&lt;p&gt;Case work&lt;/p&gt;","employmentType":"FULL_TIME","baseSalary":{"currency":"HKD","value":{"minValue":40000,"maxValue":50000,"unitText":"MONTH"}}}]}</script></head><body>x</body></html>`;
route('https://careers.consult.example/jobs/ba-hk', LD_HTML, { type: 'text' });

test('greenhouse: decodes encoded HTML and names the company', async () => {
  const [j] = await fetchGreenhouse({ ats: 'greenhouse', slug: 'acme' });
  assert.equal(j.company, 'Acme Partners');
  assert.equal(j.title, 'Analyst, Restructuring');
  assert.equal(j.location, 'London, United Kingdom');
  assert.match(j.description, /Join our restructuring team\./);
  assert.match(j.description, /• Model cash flows/);
  assert.equal(j.key, 'greenhouse:acme:4012345');
  assert.equal(j.postedAt, '2026-10-18T09:00:00-04:00');
});

test('lever: salary, workplace type, apply url, lists', async () => {
  const [j] = await fetchLever({ ats: 'lever', slug: 'leverco', company: 'Lever Co' });
  assert.equal(j.company, 'Lever Co');
  assert.equal(j.remote, 'hybrid');
  assert.equal(j.applyUrl, 'https://jobs.lever.co/leverco/a1b2c3/apply');
  assert.match(j.salary, /EUR 50000–60000/);
  assert.match(j.description, /Requirements\n• Excel/);
});

test('ashby: listed jobs only, secondary locations, compensation', async () => {
  const jobs = await fetchAshby({ ats: 'ashby', slug: 'ashco', company: 'Ash Co' });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].location, 'Shanghai; Hong Kong');
  assert.equal(jobs[0].salary, 'CN¥300K – CN¥400K');
  assert.equal(jobs[0].applyUrl, 'https://jobs.ashbyhq.com/ashco/job-uuid-1/application');
});

test('smartrecruiters: list then enrich with detail', async () => {
  const [j] = await fetchSmartRecruiters({ ats: 'smartrecruiters', slug: 'SRCo' });
  assert.equal(j.company, 'SR Company');
  assert.equal(j.location, 'Geneva, GE, CH');
  assert.equal(j.description, '');
  const e = await enrich(j);
  assert.match(e.description, /Credit analysis for corporate clients/);
  assert.equal(e.url, 'https://jobs.smartrecruiters.com/SRCo/744000012345-graduate-analyst-credit');
});

test('workday: search POST, relative dates, detail enrichment', async () => {
  const jobs = await fetchWorkday({ ats: 'workday', host: 'bigbank.wd3.myworkdayjobs.com', tenant: 'bigbank', site: 'BigBank_Careers', company: 'Big Bank' }, { searchTerms: ['restructuring'] });
  assert.equal(jobs.length, 1);
  const post = calls.find((c) => c.url.endsWith('/BigBank_Careers/jobs'));
  assert.equal(post.method, 'POST');
  assert.equal(JSON.parse(post.body).searchText, 'restructuring');
  assert.ok(jobs[0].postedAt);
  const e = await enrich(jobs[0]);
  assert.equal(e.company, 'Big Bank');
  assert.equal(e.entity, 'Big Bank plc');
  assert.match(e.description, /distressed companies/);
  assert.equal(e.postedAt, new Date('2026-10-30').toISOString());
});

test('recruitee and personio', async () => {
  const [r] = await fetchRecruitee({ ats: 'recruitee', slug: 'recco' });
  assert.equal(r.title, 'Strategy Consultant');
  assert.match(r.description, /Masters degree/);
  const [p] = await fetchPersonio({ ats: 'personio', slug: 'perco' });
  assert.equal(p.company, 'PerCo GmbH');
  assert.equal(p.title, 'Junior Analyst (m/f/d)');
  assert.equal(p.url, 'https://perco.jobs.personio.de/job/1234567');
  assert.match(p.description, /• Valuation/);
});

test('remotive aggregator', async () => {
  const jobs = await fetchRemotive({ ats: 'remotive' }, { searchTerms: ['analyst'] });
  assert.equal(jobs[0].remote, true);
  assert.match(jobs[0].description, /FP&A/);
});

test('fetchAll keeps going when one source fails', async () => {
  const { jobs, errors, counts } = await fetchAll([{ ats: 'greenhouse', slug: 'acme' }, { ats: 'greenhouse', slug: 'missing' }, { ats: 'nosuch', slug: 'x' }]);
  assert.equal(jobs.length, 1);
  assert.equal(errors.length, 2);
  assert.equal(counts['greenhouse:acme'], 1);
});

test('parseBoardUrl understands every supported ATS', () => {
  assert.deepEqual(parseBoardUrl('https://boards.greenhouse.io/acme/jobs/123?gh_src=x'), { ats: 'greenhouse', slug: 'acme', jobId: '123' });
  assert.deepEqual(parseBoardUrl('https://job-boards.eu.greenhouse.io/acme'), { ats: 'greenhouse', slug: 'acme', jobId: undefined });
  assert.deepEqual(parseBoardUrl('https://boards.greenhouse.io/embed/job_app?for=acme&token=55'), { ats: 'greenhouse', slug: 'acme', jobId: '55' });
  assert.deepEqual(parseBoardUrl('https://jobs.eu.lever.co/leverco/a1b2c3/apply'), { ats: 'lever', slug: 'leverco', region: 'eu', jobId: 'a1b2c3' });
  assert.deepEqual(parseBoardUrl('https://jobs.ashbyhq.com/ashco/job-uuid-1/application'), { ats: 'ashby', slug: 'ashco', jobId: 'job-uuid-1' });
  assert.deepEqual(parseBoardUrl('https://blackstone.wd1.myworkdayjobs.com/en-US/Blackstone_Careers'), { ats: 'workday', host: 'blackstone.wd1.myworkdayjobs.com', tenant: 'blackstone', site: 'Blackstone_Careers', jobPath: undefined });
  assert.deepEqual(parseBoardUrl('https://bigbank.wd3.myworkdayjobs.com/BigBank_Careers/job/London/Restructuring-Analyst_R-1001/apply'), { ats: 'workday', host: 'bigbank.wd3.myworkdayjobs.com', tenant: 'bigbank', site: 'BigBank_Careers', jobPath: '/job/London/Restructuring-Analyst_R-1001' });
  assert.deepEqual(parseBoardUrl('https://wd3.myworkdaysite.com/recruiting/acme/External/job/Paris/Analyst_R2'), { ats: 'workday', host: 'wd3.myworkdaysite.com', tenant: 'acme', site: 'External', jobPath: '/job/Paris/Analyst_R2' });
  assert.deepEqual(parseBoardUrl('https://jobs.smartrecruiters.com/SRCo/744000012345-graduate-analyst'), { ats: 'smartrecruiters', slug: 'SRCo', jobId: '744000012345' });
  assert.equal(parseBoardUrl('https://recco.recruitee.com/o/strategy-consultant').jobSlug, 'strategy-consultant');
  assert.equal(parseBoardUrl('https://perco.jobs.personio.de/job/1234567').jobId, '1234567');
  assert.equal(parseBoardUrl('https://www.linkedin.com/jobs/view/123'), null);
  assert.equal(parseBoardUrl('not a url'), null);
});

test('schema.org JobPosting extraction from a careers page', () => {
  const j = extractJobPosting(LD_HTML, 'https://careers.consult.example/jobs/ba-hk');
  assert.equal(j.title, 'Business Analyst');
  assert.equal(j.company, 'Consult & Co');
  assert.equal(j.location, 'Hong Kong, HK');
  assert.equal(j.salary, 'HKD 40000–50000 MONTH');
  assert.equal(j.description, 'Case work');
});

test('fetchJobFromUrl routes by ATS and falls back to JSON-LD', async () => {
  const gh = await fetchJobFromUrl('https://job-boards.greenhouse.io/acme/jobs/4012345');
  assert.equal(gh.company, 'Acme Partners');
  assert.equal(gh.form.questions.length, 2);
  assert.deepEqual(gh.form.questions[1].fields[0].values, ['Yes', 'No']);
  const lv = await fetchJobFromUrl('https://jobs.lever.co/leverco/a1b2c3');
  assert.equal(lv.title, 'Investment Analyst');
  const web = await fetchJobFromUrl('https://careers.consult.example/jobs/ba-hk');
  assert.equal(web.company, 'Consult & Co');
});
