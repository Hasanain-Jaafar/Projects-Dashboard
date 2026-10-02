'use strict';

// Running project scripts: spawn, stream, detect the dev-server URL/port,
// and stop. One run per project directory. All read-only w.r.t. the repo.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const runs = new Map(); // project dir -> { child, script, manager, url, port, startedAt }

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\u001b\[[0-9;]*m/g, '');
}

// Pull a dev-server URL/port out of a line of process output.
function parseDevServerUrl(text) {
  const clean = stripAnsi(text);
  const m = clean.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s'"]*/i);
  if (m) {
    const full = m[0]
      .replace(/[),.;]+$/, '')
      .replace(/\/\/0\.0\.0\.0/, '//localhost')
      .replace(/\/\/\[::1\]/, '//localhost')
      .replace(/\/\/127\.0\.0\.1/, '//localhost');
    const pm = full.match(/:(\d+)/);
    return { url: full, port: pm ? Number(pm[1]) : null };
  }
  const p = clean.match(/\b(?:port|listening on|running at)[:\s]+(\d{2,5})\b/i);
  if (p) return { url: null, port: Number(p[1]) };
  return null;
}

function readScripts(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return pkg && pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  } catch {
    return {};
  }
}

function detectManager(dir) {
  for (const [file, mgr] of [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm']
  ]) {
    try { if (fs.existsSync(path.join(dir, file))) return mgr; } catch { /* ignore */ }
  }
  return 'npm';
}

function pickScript(scripts, requested) {
  if (requested && scripts[requested]) return requested;
  if (scripts.dev) return 'dev';
  if (scripts.start) return 'start';
  return null;
}

function startRun(dir, requested, onUpdate) {
  if (!dir || !fs.existsSync(dir)) return { ok: false, error: 'Project folder not found' };
  if (runs.has(dir)) return { ok: false, error: 'Already running' };
  const scripts = readScripts(dir);
  const names = Object.keys(scripts);
  if (!names.length) return { ok: false, error: 'No package.json scripts found' };
  const script = pickScript(scripts, requested);
  if (!script) return { ok: false, error: 'No "dev" or "start" script', scripts: names.slice(0, 20) };

  const manager = detectManager(dir);
  const cmd = process.platform === 'win32' ? manager + '.cmd' : manager;
  const child = spawn(cmd, ['run', script], {
    cwd: dir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const rec = { child, script, manager, url: null, port: null, startedAt: Date.now() };
  runs.set(dir, rec);

  const emit = () => { if (onUpdate) onUpdate(dir, rec); };
  const onData = (buf) => {
    const found = parseDevServerUrl(buf.toString());
    if (!found) return;
    let changed = false;
    if (found.url && found.url !== rec.url) { rec.url = found.url; changed = true; }
    if (found.port && found.port !== rec.port) { rec.port = found.port; changed = true; }
    if (changed) emit();
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', () => { runs.delete(dir); emit(); });
  child.on('exit', () => { runs.delete(dir); emit(); });

  emit();
  return { ok: true, manager, script };
}

function stopRun(dir) {
  const rec = runs.get(dir);
  if (!rec) return { ok: true };
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(rec.child.pid), '/T', '/F'], { windowsHide: true });
      killer.on('error', () => {});
    } else {
      rec.child.kill('SIGTERM');
    }
  } catch { /* already gone */ }
  runs.delete(dir);
  return { ok: true };
}

function listRuns() {
  const list = {};
  for (const [dir, r] of runs) {
    list[dir] = { script: r.script, manager: r.manager, url: r.url, port: r.port, startedAt: r.startedAt };
  }
  return list;
}

function killAll() {
  for (const r of runs.values()) {
    try { r.child.kill(); } catch { /* ignore */ }
  }
  runs.clear();
}

module.exports = { startRun, stopRun, listRuns, killAll, parseDevServerUrl, readScripts, detectManager };
