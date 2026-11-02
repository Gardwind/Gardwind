// HTTP with timeouts, retries and a curl fallback (curl honours proxies and
// custom CA bundles everywhere, Node's fetch only with NODE_USE_ENV_PROXY=1).
import { spawnSync } from 'node:child_process';
import { sleep } from './util.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export class HttpError extends Error {
  constructor(url, status, body) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
    this.url = url;
    this.body = (body || '').slice(0, 500);
  }
}

export class BlockedError extends Error {
  constructor(url) {
    const host = safeHost(url);
    super(`Network policy blocked ${host}. Allow this domain (or Full network access) in the cloud environment settings.`);
    this.host = host;
    this.blocked = true;
  }
}

function safeHost(url) {
  try { return new URL(url).hostname; } catch { return String(url); }
}

let curlChecked = null;
function hasCurl() {
  if (curlChecked === null) curlChecked = !spawnSync('curl', ['--version']).error;
  return curlChecked;
}

function viaCurl(url, { method, headers, body, timeout }) {
  const args = ['-sS', '-L', '--compressed', '--max-time', String(Math.ceil(timeout / 1000)), '-X', method, '-w', '\n__STATUS__%{http_code}'];
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  if (body !== undefined) args.push('--data-binary', '@-');
  args.push(url);
  const r = spawnSync('curl', args, { input: body, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  const out = r.stdout || '';
  const i = out.lastIndexOf('\n__STATUS__');
  const stderr = (r.stderr || '').trim();
  if (/CONNECT tunnel failed, response 40[37]|Received HTTP code 40[37] from proxy/i.test(stderr)) throw new BlockedError(url);
  if (i < 0) throw new Error(`curl failed for ${url}: ${stderr || 'no output'}`);
  return { status: Number(out.slice(i + 11)), text: out.slice(0, i) };
}

function isBlockedFetchError(e) {
  const msg = `${e?.message || ''} ${e?.cause?.message || ''}`;
  return /Proxy response \(40[37]\)|tunnel.*40[37]|40[37].*tunnel/i.test(msg);
}

const NET_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET',
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_HAS_EXPIRED']);

export async function request(url, opts = {}) {
  const { method = 'GET', body, timeout = 25000, retries = 1 } = opts;
  const headers = { 'user-agent': UA, accept: 'application/json, text/html;q=0.9, */*;q=0.8', 'accept-language': 'en-GB,en;q=0.9', ...(opts.headers || {}) };
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let res;
      try {
        const r = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
        res = { status: r.status, text: await r.text() };
      } catch (e) {
        if (isBlockedFetchError(e)) throw new BlockedError(url);
        const code = e?.cause?.code || e?.code;
        // Any connection-level failure ("fetch failed", DNS, TLS, proxy tunnel):
        // curl gives a precise answer, including policy blocks.
        const networkLevel = NET_CODES.has(code) || (e?.name === 'TypeError' && /fetch failed/i.test(e.message));
        if (networkLevel && hasCurl()) res = viaCurl(url, { method, headers, body, timeout });
        else throw e;
      }
      if (res.status === 403 && /x-deny-reason|blocked by|egress/i.test(res.text.slice(0, 300))) throw new BlockedError(url);
      if (res.status >= 400) throw new HttpError(url, res.status, res.text);
      return res;
    } catch (e) {
      lastErr = e;
      const retryable = !(e instanceof BlockedError) && (!(e instanceof HttpError) || e.status >= 500 || e.status === 429);
      if (!retryable || attempt >= retries) break;
      await sleep(900 * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function getJSON(url, opts = {}) {
  const { text } = await request(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
  }
}

export async function getText(url, opts = {}) {
  const { text } = await request(url, { ...opts, headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', ...(opts.headers || {}) } });
  return text;
}
