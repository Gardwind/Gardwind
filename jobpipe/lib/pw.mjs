// Load Playwright from the project, NODE_PATH, or the global npm folder, and
// launch Chromium through the environment's HTTPS proxy when there is one.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

let cached = null;

export function loadPlaywright() {
  if (cached) return cached;
  const require = createRequire(import.meta.url);
  const candidates = ['playwright'];
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    candidates.push(path.join(root, 'playwright'));
  } catch { /* npm missing */ }
  for (const dir of (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)) candidates.push(path.join(dir, 'playwright'));
  for (const c of candidates) {
    try {
      cached = require(c);
      return cached;
    } catch { /* try next */ }
  }
  throw new Error('Playwright is not installed. Run: npm install playwright && npx playwright install chromium (inside jobpipe/).');
}

export async function launchBrowser(opts = {}) {
  const { chromium } = loadPlaywright();
  const launch = { headless: opts.headless !== false };
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy) launch.proxy = { server: proxy, bypass: 'localhost,127.0.0.1' };
  if (opts.executablePath) launch.executablePath = opts.executablePath;
  else if (fs.existsSync('/opt/pw-browsers/chromium') && process.env.JOBPIPE_USE_OPT_CHROMIUM) launch.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: opts.locale || 'en-GB',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  });
  return { browser, context };
}
