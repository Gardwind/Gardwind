// Truth check: a tailored CV may reorder, cut and reword the master CV, but it
// may not add employers, change titles or dates, invent numbers, or claim
// skills and tools that the master CV never mentions.
import { norm } from './util.mjs';
import { LIST_KEY, allHighlights, skillsList } from './resume.mjs';

const FIXED_FIELDS = {
  education: ['institution', 'degree', 'location', 'start', 'end', 'when', 'grade'],
  work: ['organization', 'position', 'location', 'start', 'end', 'when'],
  activities: ['organization', 'role', 'location', 'start', 'end', 'when'],
};

// A fixed field may also take a value the owner approved in the master entry's
// `alternates` (e.g. {when: ["2025-2028"]} for a graduation date they can choose).
function allowed(master, field, value) {
  if (norm(value) === norm(master[field] ?? '')) return true;
  return [].concat(master.alternates?.[field] || []).some((a) => norm(a) === norm(value));
}

function flatItems(list) {
  const out = [];
  for (const h of list || []) {
    out.push(h);
    if (h && typeof h === 'object') for (const s of h.sub || []) out.push(s);
  }
  return out;
}

const STOP = new Set('the and for with from into that this were was are have has had their within across over under onto upon such than then them they your our its using used use via per also both each more most less into while where which who whom what when been being able ability'.split(' '));

// Tools, methods and terms a recruiter scans for. Claiming one the master CV
// never mentions is treated as an invented skill.
const TERMS = ['python', 'sql', 'vba', 'tableau', 'power bi', 'bloomberg', 'capital iq', 'factset', 'pitchbook', 'refinitiv', 'eikon',
  'matlab', 'spss', 'sas', 'stata', 'excel', 'powerpoint', 'salesforce', 'sap', 'jira', 'javascript', 'java', 'c++', 'machine learning',
  'lbo', 'dcf', 'm&a', 'ipo', 'ecm', 'dcm', 'ifrs', 'gaap', 'cfa', 'acca', 'frm', 'three statement', '3 statement', 'leveraged buyout',
  'due diligence', 'financial modelling', 'financial modeling', 'valuation', 'merger model', 'credit memo', 'investment memo', 'pitch book', 'pitchbook'];

const core = (n) => n.replace(/[^\d.]/g, '').replace(/\.$/, '').replace(/^0+(?=\d)/, '');

export function numbersIn(s) {
  return (String(s || '').match(/\d[\d,.]*/g) || []).map(core).filter(Boolean);
}

function stem(w) {
  return w.replace(/(ations?|ing|ed|es|s|ly|ment|ments)$/, '').replace(/(is|iz)e$/, '');
}

function contentWords(s) {
  return norm(s).split(' ').filter((w) => w.length > 3 && !STOP.has(w)).map(stem);
}

export function tokenOverlap(text, source) {
  const t = contentWords(text);
  if (!t.length) return 1;
  const src = new Set(contentWords(source));
  return t.filter((w) => src.has(w)).length / t.length;
}

function masterCorpus(master) {
  const parts = [JSON.stringify(master.basics || {})];
  for (const sec of Object.keys(FIXED_FIELDS)) {
    for (const e of master[sec] || []) parts.push(FIXED_FIELDS[sec].map((f) => e[f] || '').join(' '));
  }
  parts.push(...allHighlights(master).map((h) => h.text));
  parts.push(...skillsList(master), ...(master.interests || []));
  if (master.summary?.text) parts.push(master.summary.text);
  return parts.join(' \n ');
}

function termsIn(text) {
  const t = ` ${norm(text)} `;
  return TERMS.filter((term) => t.includes(` ${norm(term)} `));
}

export function truthCheck(master, tailored) {
  const errors = [];
  const warnings = [];
  const corpus = masterCorpus(master);
  const corpusN = ` ${norm(corpus)} `;
  const corpusNums = new Set(numbersIn(corpus));

  for (const k of ['name', 'email', 'phone']) {
    const a = master.basics?.[k];
    const b = tailored.basics?.[k];
    if (b && a && norm(a) !== norm(b) && String(a).replace(/\D/g, '') !== String(b).replace(/\D/g, '')) {
      errors.push({ type: 'changed_contact', field: k, master: a, tailored: b });
    }
  }

  for (const [sec, fields] of Object.entries(FIXED_FIELDS)) {
    const byId = new Map((master[sec] || []).map((e) => [e.id, e]));
    for (const e of tailored[sec] || []) {
      const m = byId.get(e.id);
      if (!m) {
        errors.push({ type: 'unknown_entry', section: sec, id: e.id, detail: `"${e.organization || e.institution || e.id}" is not in the master CV` });
        continue;
      }
      for (const f of fields) {
        if (e[f] !== undefined && e[f] !== null && !allowed(m, f, e[f])) {
          errors.push({ type: 'changed_field', section: sec, id: e.id, field: f, master: m[f] ?? '', tailored: e[f] });
        }
      }
      const key = LIST_KEY[sec];
      const items = new Map(flatItems(m[key]).filter((h) => h && h.id).map((h) => [h.id, h]));
      for (const h of flatItems(e[key])) {
        const text = typeof h === 'string' ? h : h.text;
        const src = [].concat(typeof h === 'string' ? [] : h.src || (h.id ? [h.id] : []));
        if (!src.length) {
          errors.push({ type: 'no_source', section: sec, id: e.id, text, detail: 'Bullet has no src ids pointing at master bullets' });
          continue;
        }
        const bad = src.filter((s) => !items.has(s));
        if (bad.length) {
          errors.push({ type: 'bad_source', section: sec, id: e.id, src: bad, text, detail: 'src ids must belong to the same master entry' });
          continue;
        }
        const sourceText = src.map((s) => items.get(s).text).join(' ');
        const srcNums = new Set(numbersIn(sourceText));
        const newNums = numbersIn(text).filter((n) => !srcNums.has(n));
        if (newNums.length) errors.push({ type: 'new_number', section: sec, id: e.id, numbers: newNums, text, source: sourceText });
        const newTerms = termsIn(text).filter((term) => !corpusN.includes(` ${norm(term)} `));
        if (newTerms.length) errors.push({ type: 'new_term', section: sec, id: e.id, terms: newTerms, text });
        const overlap = tokenOverlap(text, sourceText);
        if (overlap < 0.35) warnings.push({ type: 'drift', section: sec, id: e.id, overlap: Math.round(overlap * 100), text, source: sourceText });
      }
    }
  }

  const masterSkills = new Set(skillsList(master).map(norm));
  for (const s of skillsList(tailored)) {
    if (!masterSkills.has(norm(s)) && !corpusN.includes(` ${norm(s)} `)) errors.push({ type: 'new_skill', skill: s });
  }
  for (const i of tailored.interests || []) {
    if (!corpusN.includes(` ${norm(i)} `)) errors.push({ type: 'new_interest', interest: i });
  }

  if (tailored.summary?.text) {
    const nums = numbersIn(tailored.summary.text).filter((n) => !corpusNums.has(n));
    if (nums.length) errors.push({ type: 'new_number', section: 'summary', numbers: nums, text: tailored.summary.text });
    const terms = termsIn(tailored.summary.text).filter((term) => !corpusN.includes(` ${norm(term)} `));
    if (terms.length) errors.push({ type: 'new_term', section: 'summary', terms, text: tailored.summary.text });
  }

  return { ok: errors.length === 0, errors, warnings };
}

// Same idea for free text (cover letters, form answers): numbers and named
// tools must exist in the master CV or the profile's saved facts.
export function textCheck(text, master, extraFacts = '') {
  const corpus = `${masterCorpus(master)} ${extraFacts}`;
  const corpusN = ` ${norm(corpus)} `;
  const corpusNums = new Set(numbersIn(corpus));
  const issues = [];
  const nums = numbersIn(text).filter((n) => !corpusNums.has(n) && !/^(19|20)\d\d$/.test(n));
  if (nums.length) issues.push({ type: 'new_number', numbers: [...new Set(nums)] });
  const terms = termsIn(text).filter((term) => !corpusN.includes(` ${norm(term)} `));
  if (terms.length) issues.push({ type: 'new_term', terms });
  return { ok: issues.length === 0, issues };
}
