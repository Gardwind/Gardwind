#!/usr/bin/env node
// jobpipe — the mechanical half of the job pipeline. Claude does the judging
// and writing; these commands do fetching, filtering, rendering, checking and
// form filling. Every command prints JSON to stdout. Run `jobpipe help`.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Node's fetch only uses HTTPS_PROXY when NODE_USE_ENV_PROXY=1 (Node >= 22.21).
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' },
  });
  process.exit(r.status ?? 1);
}

const { parseArgs, readJSON, writeJSON, readDocDir, docIdFor, clip, todayISO, mapLimit, uniq } = await import('../lib/util.mjs');

const HELP = `jobpipe <command> [options]

  fetch        --watchlist sources.json --profile profile.json [--existing jobs-dir] --out candidates.json
               [--limit 40] [--enrich 30]
  job          --url <posting url> [--out job.json]          one posting from any careers URL
  board        --url <careers url>                           URL -> watchlist entry
  probe        (--firms "A;B" | --sources sources.json) [--out found.json]   find firms' ATS boards by trying likely slugs
  probe-workday --tenants "kkr,hl" [--sites "A,B"] [--out found.json]          find Workday hosts + site names
  stage        --candidates candidates.json --ids a,b,c --out-dir dir   base job documents for the board
  batch        --dir dir --collection jobs --out batch.json  ArtifactData batch writes (50 per chunk)
  cv           --resume tailored.json --out cv.pdf [--master master.json] [--html cv.html] [--max-pages 1]
  letter       --letter letter.json --master master.json --out letter.pdf [--facts profile.json]
               no header; Times New Roman 12 pt (11 pt if needed for one page)
  fonts        install Times New Roman for letters if this machine lacks it
  truth        --master master.json --tailored tailored.json
  check-text   --master master.json (--text "..." | --file answers.txt) [--facts profile.json]
  scam         --job job.json
  form-inspect --url <apply url> --out fields.json [--shot form.png]
  form-fill    --plan plan.json [--submit] [--shots dir] [--code-file code.txt] [--code-timeout 300] [--out result.json]
  stats        --jobs jobs-dir|jobs.json [--out stats.json]
  tracker      --jobs jobs-dir|jobs.json --out tracker.csv   the owner's applications sheet (CSV for Google Sheets)
  collect      --dir docs-dir --out docs.json                ArtifactData out_dir files -> one array
  selftest     check that Chromium, PDF rendering and the checks work here
`;

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const out = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');
const need = (k) => {
  if (!args[k]) { console.error(`Missing --${k}\n\n${HELP}`); process.exit(64); }
  return args[k];
};
const loadDocs = (p) => {
  if (!p) return [];
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return readDocDir(p);
  const v = readJSON(p, []);
  return Array.isArray(v) ? v : v.jobs || [];
};

async function main() {
  switch (cmd) {
    case 'fetch': {
      const { fetchAll, enrich } = await import('../lib/sources.mjs');
      const { prefilter, languageGaps, domainHits } = await import('../lib/filter.mjs');
      const { daysAgo } = await import('../lib/util.mjs');
      const { scamCheck, staleCheck } = await import('../lib/scam.mjs');
      const src = readJSON(need('watchlist'));
      const profile = readJSON(need('profile'));
      const targets = profile.targets || {};
      const existing = loadDocs(args.existing);
      const entries = [...(src.watchlist || []), ...(src.aggregators || [])];
      const searchTerms = src.searchTerms?.length ? src.searchTerms : (targets.searchTerms || []);
      const t0 = Date.now();
      const { jobs, errors, counts } = await fetchAll(entries, { searchTerms });
      const keywords = uniq([...(targets.keywords || []), ...(targets.titleKeywords || [])]);
      const { kept, dropped } = prefilter(jobs, { ...targets, languages: profile.languages || targets.languages }, { existing, keywords });
      const enrichN = Number(args.enrich ?? 30);
      const top = await mapLimit(kept.slice(0, enrichN), 4, (j) => enrich(j));
      const rest = kept.slice(enrichN);
      const limit = Number(args.limit ?? 40);
      const maxAge = targets.maxAgeDays ?? 45;
      const afterDetails = [];
      for (const j of [...top, ...rest]) {
        const ageDays = daysAgo(j.postedAt) ?? j.ageDays ?? null;
        const hits = domainHits(j.description, keywords);
        const longLived = /\b(202[6-9]|graduates?|programme|program|intern|internship|summer|off.?cycle|stage)\b/i.test(j.title);
        if (ageDays !== null && ageDays > (longLived ? Math.max(maxAge, 150) : maxAge)) { dropped.too_old = (dropped.too_old || 0) + 1; continue; }
        if (j.pre?.genericOnly && (j.description || '').length > 200 && hits.length < 2) { dropped.generic_title_off_field = (dropped.generic_title_off_field || 0) + 1; continue; }
        afterDetails.push({ ...j, ageDays, pre: { ...j.pre, keywordHits: hits.slice(0, 12), score: j.pre.score + (j.pre.keywordHits?.length ? 0 : Math.min(20, hits.length * 4)) } });
      }
      afterDetails.sort((a, b) => b.pre.score - a.pre.score);
      const checked = afterDetails.slice(0, limit).map((j) => {
        const langGap = languageGaps(j.description, profile.languages || targets.languages || []);
        const scam = scamCheck(j);
        const stale = staleCheck(j, j.ageDays);
        return { ...j, docId: docIdFor(j), pre: { ...j.pre, languageGaps: langGap }, scam, stale };
      });
      const candidates = checked.filter((j) => j.scam.risk !== 'high');
      if (checked.length > candidates.length) dropped.scam_high = checked.length - candidates.length;
      const result = { generatedAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), fetched: jobs.length, kept: kept.length, returned: candidates.length, counts, errors, dropped, candidates };
      if (args.out) writeJSON(args.out, result);
      out({ ...result, candidates: candidates.map((c) => ({ docId: c.docId, company: c.company, title: c.title, location: c.location, ats: c.ats, pre: c.pre.score, languageGaps: c.pre.languageGaps, scam: c.scam.risk, stale: c.stale.stale, ageDays: c.ageDays, url: c.url })) });
      break;
    }
    case 'job': {
      const { fetchJobFromUrl } = await import('../lib/sources.mjs');
      const { scamCheck, staleCheck } = await import('../lib/scam.mjs');
      const { daysAgo } = await import('../lib/util.mjs');
      const j = await fetchJobFromUrl(need('url'));
      const ageDays = daysAgo(j.postedAt);
      const res = { ...j, docId: docIdFor(j), ageDays, scam: scamCheck(j), stale: staleCheck(j, ageDays) };
      if (args.out) writeJSON(args.out, res);
      out(res);
      break;
    }
    case 'board': {
      const { parseBoardUrl } = await import('../lib/sources.mjs');
      out(parseBoardUrl(need('url')) || { error: 'Not a known job board URL (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Recruitee, Personio).' });
      break;
    }
    case 'probe': {
      const { probeFirm } = await import('../lib/sources.mjs');
      let firms;
      if (args.firms) firms = String(args.firms).split(';').map((x) => x.trim()).filter(Boolean).map((name) => ({ name }));
      else firms = (readJSON(need('sources')).targetFirms || []).filter((f) => f.status === 'unresolved' || args.all);
      const results = await mapLimit(firms, 3, (f) => probeFirm(f.name, f.slugs || []));
      const summary = results.map((r) => ({ firm: r.firm, match: r.found.filter((x) => x.match), other: r.found.filter((x) => !x.match).slice(0, 3) }));
      if (args.out) writeJSON(args.out, summary);
      out(summary);
      break;
    }
    case 'probe-workday': {
      const { probeWorkday } = await import('../lib/sources.mjs');
      const tenants = String(need('tenants')).split(',').map((x) => x.trim()).filter(Boolean);
      const sites = args.sites ? String(args.sites).split(',').map((x) => x.trim()) : [];
      const results = await mapLimit(tenants, 3, (t) => probeWorkday(t, { sites }));
      if (args.out) writeJSON(args.out, results);
      out(results);
      break;
    }
    case 'stage': {
      const data = readJSON(need('candidates'));
      const ids = new Set(String(need('ids')).split(',').map((s) => s.trim()).filter(Boolean));
      const dir = need('out-dir');
      const now = new Date().toISOString();
      const written = [];
      for (const c of data.candidates || []) {
        if (!ids.has(c.docId)) continue;
        const doc = {
          company: c.company, role: c.title, location: c.location, remote: c.remote, url: c.url, applyUrl: c.applyUrl,
          ats: c.ats, source: `${c.source}${c.board ? ':' + c.board : ''}`, key: c.key, fingerprint: c.fingerprint,
          postedAt: c.postedAt, pay: c.salary || '', department: c.department, employmentType: c.employmentType,
          description: clip(c.description || '', 6000),
          status: 'found', flags: { scam: c.scam, stale: c.stale, languageGaps: c.pre?.languageGaps || [], ageDays: c.ageDays ?? null },
          pre: { score: c.pre?.score ?? null, titleHits: c.pre?.titleHits || [] },
          history: [{ status: 'found', on: todayISO() }], createdAt: now, updatedAt: now,
        };
        writeJSON(path.join(dir, `${c.docId}.json`), doc);
        written.push(c.docId);
      }
      out({ written, missing: [...ids].filter((i) => !written.includes(i)) });
      break;
    }
    case 'batch': {
      const dir = need('dir');
      const collection = need('collection');
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
      const writes = files.map((f) => ({ op: 'set', collection, doc_id: f.replace(/\.json$/, ''), file_path: path.resolve(dir, f) }));
      const chunks = [];
      for (let i = 0; i < writes.length; i += 50) chunks.push(writes.slice(i, i + 50));
      if (args.out) writeJSON(args.out, chunks);
      out({ documents: writes.length, chunks: chunks.length, writes: chunks });
      break;
    }
    case 'cv': {
      const { renderResumePdf, atsCheck } = await import('../lib/resume.mjs');
      const { truthCheck } = await import('../lib/truth.mjs');
      const resume = readJSON(need('resume'));
      const truth = args.master ? truthCheck(readJSON(args.master), resume) : null;
      const pdf = await renderResumePdf(resume, need('out'), { maxPages: Number(args['max-pages'] || 1), htmlOut: args.html });
      const ats = atsCheck(pdf.path, resume);
      out({ pdf, ats, truth });
      if (truth && !truth.ok) process.exitCode = 2;
      break;
    }
    case 'letter': {
      const { renderLetterPdf } = await import('../lib/resume.mjs');
      const { textCheck } = await import('../lib/truth.mjs');
      const letter = readJSON(need('letter'));
      const master = readJSON(need('master'));
      const check = textCheck((letter.paragraphs || []).join('\n'), master, args.facts ? JSON.stringify(readJSON(args.facts)) : '');
      const pdf = await renderLetterPdf(letter, master.basics || {}, need('out'));
      out({ pdf, check });
      if (!check.ok || !pdf.fits) process.exitCode = 2;
      break;
    }
    case 'tracker': {
      const { loadJobs, trackerRows, trackerCSV } = await import('../lib/tracker.mjs');
      const rows = trackerRows(loadJobs(need('jobs')));
      const csv = trackerCSV(rows);
      fs.writeFileSync(need('out'), csv);
      const groups = {};
      for (const r of rows) groups[r.group] = (groups[r.group] || 0) + 1;
      out({ path: need('out'), rows: rows.length, bytes: Buffer.byteLength(csv), groups });
      break;
    }
    case 'fonts': {
      const { ensureTimesNewRoman } = await import('../lib/fonts.mjs');
      out(ensureTimesNewRoman());
      break;
    }
    case 'truth': {
      const { truthCheck } = await import('../lib/truth.mjs');
      const r = truthCheck(readJSON(need('master')), readJSON(need('tailored')));
      out(r);
      if (!r.ok) process.exitCode = 2;
      break;
    }
    case 'check-text': {
      const { textCheck } = await import('../lib/truth.mjs');
      const text = args.text || fs.readFileSync(need('file'), 'utf8');
      const r = textCheck(text, readJSON(need('master')), args.facts ? JSON.stringify(readJSON(args.facts)) : '');
      out(r);
      if (!r.ok) process.exitCode = 2;
      break;
    }
    case 'scam': {
      const { scamCheck } = await import('../lib/scam.mjs');
      out(scamCheck(readJSON(need('job'))));
      break;
    }
    case 'form-inspect': {
      const { inspectForm } = await import('../lib/forms.mjs');
      const info = await inspectForm(need('url'), { screenshot: args.shot });
      if (args.out) writeJSON(args.out, info);
      out(info);
      break;
    }
    case 'form-fill': {
      const { fillForm } = await import('../lib/forms.mjs');
      const planPath = need('plan');
      const plan = readJSON(planPath);
      const r = await fillForm(plan, {
        submit: !!args.submit,
        shotsDir: args.shots,
        codeFile: args['code-file'],
        codeTimeout: Number(args['code-timeout'] || 300),
        baseDir: path.dirname(path.resolve(planPath)),
      });
      if (args.out) writeJSON(args.out, r);
      out(r);
      break;
    }
    case 'stats': {
      const { computeStats } = await import('../lib/stats.mjs');
      const s = computeStats(loadDocs(need('jobs')));
      if (args.out) writeJSON(args.out, s);
      out(s);
      break;
    }
    case 'collect': {
      const docs = readDocDir(need('dir'));
      if (args.out) writeJSON(args.out, docs);
      out({ count: docs.length, ids: docs.map((d) => d.id) });
      break;
    }
    case 'selftest': {
      const { selftest } = await import('../lib/selftest.mjs');
      const r = await selftest();
      out(r);
      if (!r.ok) process.exitCode = 1;
      break;
    }
    default:
      process.stdout.write(HELP);
      if (cmd && cmd !== 'help') process.exitCode = 64;
  }
}

main().catch((e) => {
  out({ error: e.message, blocked: !!e.blocked });
  process.exitCode = 1;
});
