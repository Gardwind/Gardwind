// Browser tests against local fixture pages (file:// URLs, no network).
// Skipped automatically when Playwright is not installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadPlaywright } from '../lib/pw.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (f) => pathToFileURL(path.join(here, 'fixtures', f)).href;
let available = true;
try { loadPlaywright(); } catch { available = false; }
const opts = { skip: !available && 'Playwright not installed', timeout: 120000 };

test('inspect lists fields with labels, options, groups and required flags', opts, async () => {
  const { inspectForm } = await import('../lib/forms.mjs');
  const info = await inspectForm(fx('form.html'));
  const by = (label) => info.fields.find((f) => f.label.startsWith(label));
  assert.equal(by('First Name').required, true);
  assert.equal(by('First Name').selector, '#first_name');
  assert.equal(by('Phone').required, false);
  assert.equal(by('Resume/CV').kind, 'file');
  assert.deepEqual(by('Country of residence').options.map((o) => o.label), ['China', 'France', 'United Kingdom']);
  const radio = info.fields.find((f) => f.kind === 'radio');
  assert.match(radio.label, /visa sponsorship/);
  assert.deepEqual(radio.options.map((o) => o.label), ['Yes', 'No']);
  assert.equal(radio.required, true);
  assert.equal(info.captcha.present, false);
  assert.ok(info.buttons.some((b) => /Submit application/.test(b.text)));
});

function plan(extra = []) {
  return {
    url: fx('form.html'),
    fields: [
      { selector: '#first_name', action: 'fill', value: 'Alex' },
      { selector: '#last_name', action: 'fill', value: 'Sample' },
      { selector: '#email', action: 'fill', value: 'alex@example.com' },
      { selector: '#resume', action: 'upload', value: path.join(here, 'fixtures', 'cv.pdf') },
      { selector: '#country', action: 'select', value: 'france' },
      { selector: 'input[name="sponsorship"][value="no"]', action: 'check' },
      { selector: '#why', action: 'fill', value: 'Restructuring work matches my internships.' },
      ...extra,
    ],
  };
}

test('dry run reports the missing required consent box; full plan submits', opts, async () => {
  const { fillForm } = await import('../lib/forms.mjs');
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-shots-'));
  const dry = await fillForm(plan(), { shotsDir: shots });
  assert.equal(dry.status, 'dry_run_incomplete');
  assert.equal(dry.missingRequired.length, 1);
  assert.match(dry.missingRequired[0], /privacy notice/);
  assert.ok(fs.existsSync(path.join(shots, 'filled.png')));

  const full = await fillForm(plan([{ selector: '#consent', action: 'check' }]), { submit: true, shotsDir: shots });
  assert.equal(full.status, 'submitted', JSON.stringify(full));
  assert.match(full.finalUrl, /thanks\.html\?first_name=Alex/);
  assert.match(full.finalUrl, /country=fr/);
  assert.match(full.finalUrl, /sponsorship=no/);
});

test('verification code: waits for the code file, enters it, confirms', opts, async () => {
  const { fillForm } = await import('../lib/forms.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-code-'));
  const codeFile = path.join(dir, 'code.txt');
  setTimeout(() => fs.writeFileSync(codeFile, '482913\n'), 4000);
  const r = await fillForm({ url: fx('form-code.html'), fields: [{ selector: '#email', action: 'fill', value: 'alex@example.com' }] }, { submit: true, shotsDir: dir, codeFile, codeTimeout: 30 });
  assert.equal(r.status, 'submitted', JSON.stringify(r));
  assert.ok(fs.existsSync(path.join(dir, 'needs_code.json')));
});

test('CV renders to one page and passes the ATS read-back', opts, async () => {
  const { renderResumePdf, atsCheck, resumeHTML } = await import('../lib/resume.mjs');
  const { SAMPLE_MASTER } = await import('../lib/selftest.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-cv-'));
  const big = structuredClone(SAMPLE_MASTER);
  big.work[0].highlights.push({ id: 'w-1-3', text: 'Summarised creditor positions and recovery scenarios for the supervising partner' });
  for (let i = 0; i < 8; i++) big.work.push({ ...structuredClone(big.work[0]), id: `w-x${i}` });
  const r = await renderResumePdf(big, path.join(dir, 'cv.pdf'));
  assert.equal(r.pages, 1, `expected 1 page, got ${r.pages} at ${r.fontPt}pt`);
  assert.ok(r.fontPt < 10.5, 'font should shrink to fit');
  const ats = atsCheck(r.path, big);
  assert.equal(ats.ok, true, JSON.stringify(ats));
  assert.match(resumeHTML(SAMPLE_MASTER), /Restructuring Intern/);
});
