// Application forms in a real (headless) browser, in two steps:
//   inspect -> list every field with its label, type, options and whether it is required
//   fill    -> follow a plan Claude writes from that list; optionally submit
// Claude does the understanding (which answer goes where); this file does the
// clicking, typing, uploading, screenshots and confirmation detection.
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './pw.mjs';
import { escapeRegExp, sleep } from './util.mjs';

// Runs inside the page.
function collectFields() {
  const visible = (el) => {
    if (el.type === 'file') return true;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const labelFor = (el) => {
    let t = '';
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) t = l.innerText;
    }
    if (!t) t = el.closest('label')?.innerText || '';
    if (!t && el.getAttribute('aria-labelledby')) {
      t = el.getAttribute('aria-labelledby').split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ');
    }
    if (!t) t = el.getAttribute('aria-label') || '';
    if (!t) {
      const box = el.closest('.field, .form-group, .application-question, [class*="field"], [class*="question"], [class*="Field"], fieldset, li');
      const lab = box?.querySelector('label, legend, .label, [class*="label"], [class*="Label"]');
      if (lab) t = lab.innerText;
    }
    if (!t) t = el.placeholder || el.name || '';
    return clean(t);
  };
  const selectorFor = (el) => {
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
    const tag = el.tagName.toLowerCase();
    if (el.name) {
      const sel = `${tag}[name="${el.name.replace(/"/g, '\\"')}"]`;
      if (el.type === 'radio' || el.type === 'checkbox') {
        const s2 = `${sel}[value="${String(el.value || '').replace(/"/g, '\\"')}"]`;
        if (document.querySelectorAll(s2).length === 1) return s2;
      } else if (document.querySelectorAll(sel).length === 1) return sel;
    }
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body) {
      let i = 1;
      let sib = cur;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === cur.tagName) i++;
      parts.unshift(`${cur.tagName.toLowerCase()}:nth-of-type(${i})`);
      cur = cur.parentElement;
    }
    return `body > ${parts.join(' > ')}`;
  };

  const fields = [];
  const groups = {};
  for (const el of document.querySelectorAll('input, select, textarea, [role="combobox"]')) {
    const type = (el.getAttribute('type') || el.tagName).toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
    if (!visible(el)) continue;
    const label = labelFor(el);
    const required = !!(el.required || el.getAttribute('aria-required') === 'true' || /\*\s*$/.test(label) || /\(required\)/i.test(label));
    if (type === 'radio' || type === 'checkbox') {
      const key = el.name || selectorFor(el);
      const box = el.closest('fieldset, [role="radiogroup"], [role="group"], .field, .application-question, [class*="question"]');
      const groupLabel = clean(box?.querySelector('legend, label, .label, [class*="label"]')?.innerText || '');
      if (!groups[key]) {
        groups[key] = { kind: type === 'radio' ? 'radio' : 'checkbox', name: el.name || null, label: groupLabel || label, required, options: [] };
        fields.push(groups[key]);
      }
      groups[key].options.push({ label, value: el.value, selector: selectorFor(el), checked: el.checked });
      if (required) groups[key].required = true;
      continue;
    }
    const f = { kind: el.tagName === 'SELECT' ? 'select' : type === 'file' ? 'file' : el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') ? 'combobox' : el.tagName === 'TEXTAREA' ? 'textarea' : 'text', type, selector: selectorFor(el), name: el.name || null, id: el.id || null, label, required };
    if (el.tagName === 'SELECT') f.options = [...el.options].map((o) => ({ label: clean(o.text), value: o.value })).filter((o) => o.label && o.value !== '');
    if (type === 'file') {
      f.accept = el.accept || null;
      // Custom upload widgets keep the input empty and list the file name next to it.
      const box = el.closest('.field-wrapper, [class*="field"], [class*="upload"], fieldset, li') || el.parentElement;
      f.filled = el.files?.length > 0 || /\.(pdf|docx?|txt|rtf)\b/i.test(box?.innerText || '');
    } else if (f.kind === 'combobox' && !el.value) {
      // React-select style widgets show the chosen option outside the input.
      const box = el.closest('[class*="value-container"], [class*="ValueContainer"]') || el.closest('[class*="__control"], [class*="-control"]') || el.parentElement?.parentElement;
      const shown = box?.querySelector('[class*="single-value"], [class*="singleValue"], [class*="multi-value"], [class*="multiValue"]');
      const hidden = el.closest('[class*="field"], [class*="select"], .field-wrapper')?.querySelector('input[type="hidden"]');
      f.value = (shown && shown.textContent.trim()) || (hidden && hidden.value) || '';
    } else f.value = el.value || '';
    if (el.maxLength > 0) f.maxLength = el.maxLength;
    fields.push(f);
  }
  const frames = [...document.querySelectorAll('iframe')].map((f) => f.src || '');
  const captchaKinds = [...new Set(frames.map((s) => (s.match(/recaptcha|hcaptcha|turnstile|arkoselabs|funcaptcha/) || [])[0]).filter(Boolean))];
  if (document.querySelector('.g-recaptcha, [data-sitekey]')) captchaKinds.push('recaptcha-widget');
  if (document.querySelector('.h-captcha')) captchaKinds.push('hcaptcha-widget');
  if (document.querySelector('.cf-turnstile')) captchaKinds.push('turnstile-widget');
  const buttons = [...document.querySelectorAll('button, input[type="submit"], a[role="button"]')]
    .filter(visible)
    .map((b) => ({ text: clean(b.innerText || b.value).slice(0, 60), selector: selectorFor(b), type: b.getAttribute('type') || b.tagName.toLowerCase() }))
    .filter((b) => b.type === 'submit' || /submit|apply|send|continue|next|envoyer|postuler|soumettre|weiter|bewerben/i.test(b.text));
  const codeInput = fields.find((f) => /verification code|security code|confirmation code|one[- ]time|\botp\b|code de (v[ée]rification|s[ée]curit[ée])/i.test(f.label));
  return {
    title: document.title,
    url: location.href,
    fields,
    captcha: { present: captchaKinds.length > 0, kinds: [...new Set(captchaKinds)] },
    login: !!document.querySelector('input[type="password"]'),
    buttons,
    codePrompt: codeInput ? codeInput.selector : null,
    text: clean(document.body?.innerText || '').slice(0, 3000),
  };
}

function pageState() {
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
  const errs = [...document.querySelectorAll('[role="alert"], .error, .errors, .field-error, .error-message, [class*="error"]:not(style):not(script), [aria-invalid="true"]')]
    .map((e) => (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
    .filter((t) => t && t.length < 300);
  return { url: location.href, text: text.slice(0, 5000), errors: [...new Set(errs)].slice(0, 10) };
}

const CONFIRM = [
  /thank(s| you)[^.]{0,80}(appl|submi|interest|candidature)/i,
  /application (has been |was |is )?(successfully )?(received|submitted|sent|complete)/i,
  /we('ve| have) (successfully )?received your application/i,
  /successfully (submitted|applied|sent)/i,
  /your application (has been|was) (submitted|received|sent)/i,
  /merci[^.]{0,60}candidature/i,
  /candidature (a bien été |a été )?(envoy[ée]e|re[çc]ue|transmise|enregistr[ée]e)/i,
  /bewerbung[^.]{0,60}(erhalten|eingegangen|versendet)/i,
];

export function looksConfirmed(state) {
  return CONFIRM.some((re) => re.test(state.text)) || /\/(confirmation|thank[-_]?you|thanks|submitted|success)(\b|\/|\?|$)/i.test(state.url);
}

const APPLY_BUTTON = /^(apply( now| for this (job|position|role))?|start (your )?application|i'?m interested|postuler|candidater|jetzt bewerben)$/i;

async function openForm(page, url, timeout) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  let info = await page.evaluate(collectFields);
  if (info.fields.filter((f) => f.kind !== 'checkbox').length < 3) {
    const btn = page.getByRole('link', { name: APPLY_BUTTON }).or(page.getByRole('button', { name: APPLY_BUTTON })).first();
    if (await btn.count()) {
      await btn.click({ timeout: 8000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await sleep(800);
      info = await page.evaluate(collectFields);
    }
  }
  return info;
}

// Options of the listbox that belongs to a combobox (runs inside the page).
function listboxOptions(sel) {
  const el = document.querySelector(sel);
  const shown = (n) => { const r = n.getBoundingClientRect(); return r.height > 0 && r.width > 0 && getComputedStyle(n).visibility !== 'hidden'; };
  const id = el && (el.getAttribute('aria-controls') || el.getAttribute('aria-owns'));
  let box = id ? document.getElementById(id) : null;
  if (!box || !shown(box)) {
    const boxes = [...document.querySelectorAll('[role="listbox"]')].filter(shown);
    box = boxes.find((b) => el && (b.closest('.select, [class*="select"], [class*="field"]') === el.closest('.select, [class*="select"], [class*="field"]'))) || boxes[boxes.length - 1];
  }
  if (!box) return [];
  return [...box.querySelectorAll('[role="option"]')].filter(shown).map((o) => o.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Open each dropdown-style combobox once and record its options (React-select
// and similar widgets only render options while open).
async function readComboOptions(page, info) {
  for (const f of info.fields) {
    if (f.kind !== 'combobox' || f.options) continue;
    try {
      const loc = page.locator(f.selector).first();
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
      await loc.click({ timeout: 3000 });
      await sleep(400);
      const opts = await page.evaluate(listboxOptions, f.selector);
      f.options = [...new Set(opts)].slice(0, 120).map((label) => ({ label }));
      if (!f.options.length) f.options = null; // async search box (e.g. city): options appear only after typing
      await page.keyboard.press('Escape');
      await sleep(120);
    } catch { /* leave options unknown */ }
  }
  return info;
}

export async function inspectForm(url, { screenshot, timeout = 45000, comboOptions = true } = {}) {
  const { browser, context } = await launchBrowser();
  try {
    const page = await context.newPage();
    const info = await openForm(page, url, timeout);
    // Drop the hidden text inputs that shadow each combobox (same label, no id).
    const labels = new Set(info.fields.filter((f) => f.kind === 'combobox').map((f) => f.label));
    info.fields = info.fields.filter((f) => !(f.kind === 'text' && !f.id && !f.name && (labels.has(f.label) || !f.label)));
    if (comboOptions) await readComboOptions(page, info);
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    return info;
  } finally {
    await browser.close();
  }
}

function bestOption(options, wanted) {
  const w = String(wanted).toLowerCase().trim();
  return options.find((o) => o.toLowerCase().trim() === w)
    || options.find((o) => o.toLowerCase().startsWith(w))
    || options.find((o) => o.toLowerCase().includes(w))
    || options.find((o) => w.includes(o.toLowerCase().trim()) && o.trim().length > 1);
}

async function fillOne(page, f, baseDir) {
  const loc = page.locator(f.selector).first();
  switch (f.action) {
    case 'fill':
      await loc.fill(String(f.value ?? ''), { timeout: 8000 });
      break;
    case 'select': {
      const texts = (await loc.locator('option').allTextContents()).map((t) => t.trim());
      const pick = bestOption(texts, f.value);
      if (pick) await loc.selectOption({ label: pick }, { timeout: 8000 });
      else await loc.selectOption(String(f.value), { timeout: 8000 });
      break;
    }
    case 'check':
      if (f.value === false) await loc.uncheck({ timeout: 8000 });
      else await loc.check({ timeout: 8000, force: true });
      break;
    case 'click':
      await loc.click({ timeout: 8000 });
      break;
    case 'upload':
      await loc.setInputFiles(path.resolve(baseDir, String(f.value)), { timeout: 8000 });
      break;
    case 'combobox': {
      const want = String(f.optionText || f.value);
      let done = false;
      for (let attempt = 1; attempt <= 3 && !done; attempt++) {
        await page.keyboard.press('Escape').catch(() => {});
        await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await loc.click({ timeout: 8000, force: attempt > 1 });
        await loc.fill('').catch(() => {});
        await loc.fill(String(f.value)).catch(async () => { await page.keyboard.type(String(f.value), { delay: 30 }); });
        await sleep((f.wait || 700) * attempt);
        const boxId = await loc.getAttribute('aria-controls').catch(() => null);
        const scope = boxId ? page.locator(`[id="${boxId}"]`) : page;
        const exact = scope.getByRole('option', { name: want, exact: true }).first();
        const loose = scope.getByRole('option', { name: new RegExp(escapeRegExp(want).replace(/'/g, "['’]"), 'i') }).first();
        if (await exact.count()) { await exact.click({ timeout: 5000 }); done = true; }
        else if (await loose.count()) { await loose.click({ timeout: 5000 }); done = true; }
      }
      if (!done) throw new Error(`No option matching "${want}"`);
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(250);
      break;
    }
    default:
      throw new Error(`Unknown action "${f.action}"`);
  }
}

// plan: { url, fields:[{selector, action, value, label}], submit?:{selector}|{text},
//         applyFirst?:boolean }
export async function fillForm(plan, { submit = false, shotsDir, codeFile, codeTimeout = 300, timeout = 45000, baseDir = process.cwd() } = {}) {
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
  const shot = (name) => (shotsDir ? path.join(shotsDir, name) : null);
  const result = { status: 'unknown', filled: [], failed: [], missingRequired: [], errors: [], screenshots: [], captcha: null, finalUrl: null };
  const { browser, context } = await launchBrowser();
  try {
    const page = await context.newPage();
    const before = await openForm(page, plan.url, timeout);
    result.captcha = before.captcha;
    if (before.login && !plan.allowLogin) {
      result.status = 'login_required';
      if (shot('login.png')) { await page.screenshot({ path: shot('login.png'), fullPage: true }); result.screenshots.push(shot('login.png')); }
      return result;
    }
    for (const f of plan.fields || []) {
      try {
        await fillOne(page, f, baseDir);
        result.filled.push(f.label || f.selector);
      } catch (e) {
        result.failed.push({ field: f.label || f.selector, error: e.message.split('\n')[0] });
      }
    }
    await sleep(500);
    const after = await page.evaluate(collectFields);
    for (const f of after.fields) {
      if (!f.required) continue;
      const empty = f.kind === 'file' ? !f.filled : f.kind === 'radio' || f.kind === 'checkbox' ? !f.options.some((o) => o.checked) : !String(f.value || '').trim();
      if (empty) result.missingRequired.push(f.label || f.selector);
    }
    if (shot('filled.png')) { await page.screenshot({ path: shot('filled.png'), fullPage: true }); result.screenshots.push(shot('filled.png')); }

    if (!submit) {
      result.status = result.missingRequired.length || result.failed.length ? 'dry_run_incomplete' : 'dry_run_ok';
      result.finalUrl = page.url();
      return result;
    }
    if (result.missingRequired.length) {
      result.status = 'not_submitted_missing_required';
      return result;
    }

    const clickSubmit = async () => {
      if (plan.submit?.selector) return page.locator(plan.submit.selector).first().click({ timeout: 10000 });
      const name = plan.submit?.text ? new RegExp(escapeRegExp(plan.submit.text), 'i') : /submit( application)?|send application|apply|envoyer|postuler|soumettre/i;
      const btn = page.getByRole('button', { name }).last();
      if (await btn.count()) return btn.click({ timeout: 10000 });
      return page.locator('button[type="submit"], input[type="submit"]').last().click({ timeout: 10000 });
    };
    await clickSubmit();
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await sleep(2000);
    let state = await page.evaluate(pageState);
    let info = await page.evaluate(collectFields);

    if (!looksConfirmed(state) && info.codePrompt) {
      result.status = 'needs_code';
      const promptField = info.fields.find((f) => f.selector === info.codePrompt);
      if (shot('needs-code.png')) { await page.screenshot({ path: shot('needs-code.png'), fullPage: true }).catch(() => {}); result.screenshots.push(shot('needs-code.png')); }
      if (shotsDir) fs.writeFileSync(path.join(shotsDir, 'needs_code.json'), JSON.stringify({ at: new Date().toISOString(), url: page.url(), prompt: promptField?.label || null, text: state.text.slice(0, 800) }));
      if (!codeFile) return result;
      const deadline = Date.now() + codeTimeout * 1000;
      while (Date.now() < deadline && !fs.existsSync(codeFile)) await sleep(3000);
      if (!fs.existsSync(codeFile)) { result.status = 'code_timeout'; return result; }
      const code = fs.readFileSync(codeFile, 'utf8').trim();
      // Codes are often split over one box per character that auto-advance: type, don't fill.
      const first = page.locator(info.codePrompt).first();
      await first.click();
      const maxLen = Number(await first.getAttribute('maxlength').catch(() => null)) || 0;
      if (maxLen === 1) await page.keyboard.type(code, { delay: 80 });
      else await first.fill(code);
      await clickSubmit().catch(() => page.keyboard.press('Enter'));
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await sleep(2000);
      state = await page.evaluate(pageState);
      info = await page.evaluate(collectFields);
    }

    result.finalUrl = state.url;
    result.errors = state.errors;
    if (shot('after-submit.png')) { await page.screenshot({ path: shot('after-submit.png'), fullPage: true }); result.screenshots.push(shot('after-submit.png')); }
    if (looksConfirmed(state)) result.status = 'submitted';
    else if (info.captcha.present && /captcha|robot|verify you are human/i.test(state.text)) result.status = 'captcha';
    else if (state.errors.length) result.status = 'error';
    else result.status = 'unconfirmed';
    result.pageText = state.text.slice(0, 600);
    return result;
  } finally {
    await browser.close();
  }
}
