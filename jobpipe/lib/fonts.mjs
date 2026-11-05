// Times New Roman for cover letters. Linux containers don't ship it, so on first use this
// fetches Microsoft's free core-fonts package (the SourceForge "corefonts" file that Debian's
// ttf-mscorefonts-installer also uses) and unpacks the Times files into the user's font folder.
// If that fails, letters fall back to Liberation Serif, which has the same metrics.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PACKAGE = 'https://downloads.sourceforge.net/corefonts/times32.exe';
let cached = null;

const quiet = { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' };
function has(cmd) {
  try { execFileSync('which', [cmd], quiet); return true; } catch { return false; }
}

export function fontInstalled(family) {
  try { return execFileSync('fc-list', [`:family=${family}`, 'family'], quiet).trim() !== ''; } catch { return false; }
}

function installCabextract() {
  if (has('cabextract')) return;
  if (process.getuid?.() !== 0 || !has('apt-get')) throw new Error('cabextract is not installed');
  const apt = (args) => execFileSync('apt-get', args, { stdio: 'ignore', timeout: 240000 });
  try { apt(['install', '-y', '-q', 'cabextract']); } catch { apt(['update', '-q']); apt(['install', '-y', '-q', 'cabextract']); }
}

// Returns {font, installed, note?}: the family letters will actually be set in.
export function ensureTimesNewRoman({ install = true } = {}) {
  if (cached) return cached;
  if (process.platform !== 'linux' || fontInstalled('Times New Roman')) return (cached = { font: 'Times New Roman', installed: false });
  if (!install) return (cached = { font: 'Liberation Serif', installed: false, note: 'Times New Roman is not installed' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tnr-'));
  try {
    installCabextract();
    const exe = path.join(tmp, 'times32.exe');
    execFileSync('curl', ['-fsSL', '-m', '90', '-o', exe, PACKAGE], { stdio: 'ignore' });
    const dir = path.join(os.homedir(), '.local', 'share', 'fonts', 'msttcorefonts');
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('cabextract', ['-q', '-F', '*.TTF', '-d', dir, exe], { stdio: 'ignore' });
    execFileSync('fc-cache', ['-f', dir], { stdio: 'ignore' });
    if (!fontInstalled('Times New Roman')) throw new Error('font not found after unpacking');
    return (cached = { font: 'Times New Roman', installed: true });
  } catch (e) {
    return (cached = { font: 'Liberation Serif', installed: false, note: `Times New Roman could not be installed (${e.message}); used Liberation Serif, which has the same metrics` });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
