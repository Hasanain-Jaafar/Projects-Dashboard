'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.ico', '.avif', '.tiff']);
const NAMED_IMAGES = ['cover', 'preview', 'screenshot', 'banner', 'thumbnail', 'logo', 'icon', 'hero', 'featured', 'og', 'og-image'];

// Strong signals that a folder is a code project.
const PROJECT_MARKER_FILES = new Set([
  '.git',
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'cargo.toml', 'cargo.lock',
  'go.mod', 'go.sum',
  'pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'pipfile', 'poetry.lock',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle',
  'composer.json', 'gemfile', 'mix.exs', 'pubspec.yaml',
  'deno.json', 'deno.jsonc',
  'vite.config.js', 'vite.config.ts', 'next.config.js', 'next.config.mjs', 'nuxt.config.ts',
  'angular.json', 'svelte.config.js', 'tsconfig.json',
  'cmakelists.txt', 'makefile', 'dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  'flake.nix', 'justfile', 'stack.yaml'
]);
const PROJECT_MARKER_EXTS = new Set(['.sln', '.csproj', '.fsproj', '.vbproj']);

const SOURCE_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
  '.rb', '.php', '.swift', '.kt', '.kts', '.dart', '.ex', '.exs', '.sh', '.bash', '.zsh',
  '.cs', '.fs', '.scala', '.clj', '.lua', '.r', '.jl', '.zig', '.nim', '.html', '.css',
  '.scss', '.less', '.vue', '.svelte', '.astro', '.mjs', '.cjs', '.sol', '.sql'
]);

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'venv', 'env',
  '__pycache__', 'bin', 'obj', 'coverage'
]);

const DEP_FRAMEWORKS = [
  ['react', 'react'],
  ['react-dom', 'react'],
  ['next', 'nextjs'],
  ['vue', 'vue'],
  ['nuxt', 'nuxt'],
  ['@angular/core', 'angular'],
  ['svelte', 'svelte'],
  ['@nestjs/core', 'nestjs'],
  ['express', 'express'],
  ['electron', 'electron'],
  ['vite', 'vite'],
  ['webpack', 'webpack'],
  ['gatsby', 'gatsby'],
  ['@remix-run/react', 'remix'],
  ['astro', 'astro'],
  ['redux', 'redux'],
  ['graphql', 'graphql'],
  ['prisma', 'prisma'],
  ['@prisma/client', 'prisma'],
  ['three', 'threejs'],
  ['d3', 'd3'],
  ['tailwindcss', 'tailwind']
];

async function readEntries(dir) {
  try {
    return await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
}

function isProjectEntries(entries) {
  if (!entries) return false;
  let srcCount = 0;
  for (const e of entries) {
    const lower = e.name.toLowerCase();
    if (lower === '.git') return true;
    if (PROJECT_MARKER_FILES.has(lower)) return true;
    if (!e.isDirectory()) {
      if (PROJECT_MARKER_EXTS.has(path.extname(lower))) return true;
      if (SOURCE_EXTS.has(path.extname(lower))) srcCount++;
    }
  }
  return srcCount >= 2;
}

async function safeStat(dir) {
  try {
    return await fsp.stat(dir);
  } catch {
    return null;
  }
}

async function readJson(dir, name) {
  try {
    const raw = await fsp.readFile(path.join(dir, name), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readText(dir, name) {
  try {
    return await fsp.readFile(path.join(dir, name), 'utf8');
  } catch {
    return null;
  }
}

function prettifyName(s) {
  let str = String(s || '').trim();
  if (!str) return 'Untitled';
  str = str.replace(/[_-]+/g, ' ');
  str = str.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  str = str.replace(/\./g, ' ');
  const words = str.split(/\s+/).filter(Boolean);
  if (!words.length) return 'Untitled';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 60);
}

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

// Common scaffold README fragments that are noise, not a real description.
const BOILERPLATE_PATTERNS = [
  /bootstrapped with/i,
  /this is a next\.?js project/i,
  /create-next-app/i,
  /create react app/i,
  /this template provides a minimal setup/i,
  /first,? run the development server/i,
  /you can start editing the page by modifying/i,
  /this project was generated with/i,
  /welcome to your nuxt application/i,
  /look at the .{0,40}docs to learn more/i,
  /this is a .{0,24}project created with/i,
  /used by millions of developers/i,
  /installation\s+\$?\s*(npm|yarn|pnpm) install/i
];

function isBoilerplate(text) {
  const t = cleanText(text);
  if (!t) return false;
  return BOILERPLATE_PATTERNS.some((re) => re.test(t));
}

// Reject strings that still look like markup or code rather than prose.
function looksLikeProse(s) {
  const t = String(s || '').trim();
  if (t.length < 4) return false;
  if (/!\[|\]\(|\]\[|```|<\/?[a-z]|https?:\/\//i.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean).length;
  return words >= 3 || t.length >= 16;
}

// Reduce one line of markdown to plain text.
function stripMarkdownLine(line) {
  let s = line;
  s = s.replace(/^\s{0,3}#{1,6}\s*/, '');            // heading markers
  s = s.replace(/^\s*>+\s?/, '');                     // blockquote
  s = s.replace(/^\s*([-*+]|\d+[.)])\s+/, '');        // list marker
  s = s.replace(/\|/g, ' ');                           // tables
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');       // inline images
  s = s.replace(/!\[[^\]]*\]\[[^\]]*\]/g, ' ');      // reference images
  s = s.replace(/!\[[^\]]*\]/g, ' ');                 // shortcut images
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');     // inline links
  s = s.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');    // reference links
  s = s.replace(/\[([^\]]*)\]/g, '$1');               // shortcut links
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');           // html tags
  s = s.replace(/[*_~`]+/g, '');                       // emphasis + inline code
  s = s.replace(/\\([^\w\s])/g, '$1');               // escaped characters
  return cleanText(s);
}

// Split a README into its ordered list of plain-text paragraphs, skipping the
// title, badges, code blocks, frontmatter, rules, indented code, and
// reference-link definitions. Returning every paragraph (not just the first)
// lets a rejected intro — a badge wall, scaffold boilerplate, a link farm —
// give way to a usable description further down.
function extractReadmeParagraphs(text) {
  let t = String(text || '').replace(/\r\n?/g, '\n');
  t = t.replace(/^---\n[\s\S]*?\n---\n?/, '');   // YAML frontmatter
  t = t.replace(/<!--[\s\S]*?-->/g, '');         // HTML comments
  t = t.replace(/^```[\s\S]*?^```.*$/gm, '');    // fenced code
  t = t.replace(/^~~~[\s\S]*?^~~~.*$/gm, '');

  const paragraphs = [];
  let para = [];
  const flush = () => {
    if (!para.length) return;
    let out = cleanText(para.join(' '));
    para = [];
    if (!out) return;
    if (out.length > 240) {
      out = out.slice(0, 240);
      const cut = out.lastIndexOf(' ');
      if (cut > 160) out = out.slice(0, cut);
    }
    paragraphs.push(out);
  };

  for (const raw of t.split('\n')) {
    const line = raw.trim();

    if (!line) { flush(); continue; }                            // blank line
    if (/^#{1,6}\s+/.test(line)) { flush(); continue; }          // heading
    if (/^([-*_])(\s*\1){2,}$/.test(line)) { flush(); continue; } // horizontal rule
    if (/^( {4,}|\t)/.test(raw)) { flush(); continue; }          // indented code
    if (/^\s*\[[^\]]+\]:\s*\S+/.test(raw)) { flush(); continue; } // [ref]: url

    const clean = stripMarkdownLine(line);
    if (!clean) continue;
    para.push(clean);
  }
  flush();

  return paragraphs.slice(0, 25);
}

function countExtensions(entries, target) {
  for (const e of entries || []) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (ext) target[ext] = (target[ext] || 0) + 1;
  }
  return target;
}

function collectDeps(pkg) {
  const set = new Set();
  if (!pkg || typeof pkg !== 'object') return set;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const o = pkg[field];
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) set.add(k.toLowerCase());
    }
  }
  return set;
}

function cleanHeading(line) {
  let s = String(line || '').trim();
  s = s.replace(/^#+\s*/, '');
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/[*_`~]+/g, '');
  return cleanText(s);
}

const GENERIC_TITLES = /^(readme|docs?|documentation|index|untitled|home|welcome|overview)$/i;

// The README's first H1 usually carries the project's real, human casing.
async function detectReadmeTitle(dir, files) {
  const readme = ['readme.md', 'readme.markdown', 'readme.mdx', 'readme.rst', 'readme.txt']
    .find((f) => files.has(f));
  if (!readme) return null;
  const t = await readText(dir, files.get(readme));
  if (!t) return null;
  for (const raw of t.replace(/\r\n?/g, '\n').split('\n').slice(0, 40)) {
    const m = raw.match(/^\s*#\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const title = cleanHeading(m[1]);
    if (title && title.length <= 60 && !GENERIC_TITLES.test(title) && !isBoilerplate(title)) return title;
    return null; // first heading was unusable — don't keep hunting
  }
  return null;
}

async function detectName(dir, files) {
  // Explicit display names win — they preserve the author's intended casing.
  if (files.has('package.json')) {
    const p = await readJson(dir, files.get('package.json'));
    if (p) {
      for (const k of ['displayName', 'productName']) {
        if (typeof p[k] === 'string' && p[k].trim()) return p[k].trim().slice(0, 60);
      }
    }
  }

  const title = await detectReadmeTitle(dir, files);
  if (title) return title;

  if (files.has('package.json')) {
    const p = await readJson(dir, files.get('package.json'));
    if (p && p.name) return prettifyName(p.name);
  }
  if (files.has('cargo.toml')) {
    const t = await readText(dir, files.get('cargo.toml'));
    const m = t && t.match(/^name\s*=\s*"([^"]+)"/m);
    if (m) return prettifyName(m[1]);
  }
  if (files.has('pyproject.toml')) {
    const t = await readText(dir, files.get('pyproject.toml'));
    let m = t && t.match(/^name\s*=\s*"([^"]+)"/m);
    if (!m) m = t && t.match(/name\s*=\s*['"]([^'"]+)['"]/);
    if (m) return prettifyName(m[1]);
  }
  if (files.has('composer.json')) {
    const p = await readJson(dir, files.get('composer.json'));
    if (p && p.name) return prettifyName(String(p.name).split('/').pop());
  }
  if (files.has('pubspec.yaml')) {
    const t = await readText(dir, files.get('pubspec.yaml'));
    const m = t && t.match(/^name:\s*(\S+)/m);
    if (m) return prettifyName(m[1]);
  }
  return prettifyName(path.basename(dir));
}

async function detectDescription(dir, files) {
  const candidates = [];

  if (files.has('package.json')) {
    const p = await readJson(dir, files.get('package.json'));
    if (p && p.description) candidates.push(cleanText(p.description));
  }
  if (files.has('pyproject.toml')) {
    const t = await readText(dir, files.get('pyproject.toml'));
    const m = t && t.match(/description\s*=\s*["']([^"']+)["']/);
    if (m) candidates.push(cleanText(m[1]));
  }
  if (files.has('composer.json')) {
    const p = await readJson(dir, files.get('composer.json'));
    if (p && p.description) candidates.push(cleanText(p.description));
  }
  if (files.has('cargo.toml')) {
    const t = await readText(dir, files.get('cargo.toml'));
    const m = t && t.match(/^description\s*=\s*"([^"]+)"/m);
    if (m) candidates.push(cleanText(m[1]));
  }
  if (files.has('pubspec.yaml')) {
    const t = await readText(dir, files.get('pubspec.yaml'));
    const m = t && t.match(/^description:\s*(.+)$/m);
    if (m) candidates.push(cleanText(m[1].replace(/^['"]|['"]$/g, '')));
  }

  const readme = ['readme.md', 'readme.markdown', 'readme.mdx', 'readme.txt', 'readme.rst']
    .find((f) => files.has(f));
  if (readme) {
    const t = await readText(dir, files.get(readme));
    if (t) {
      // Try each paragraph in order — a badge wall or boilerplate intro
      // shouldn't hide a usable description further down the file.
      for (const p of extractReadmeParagraphs(t)) candidates.push(p);
    }
  }

  // Prefer a real, hand-written description; skip boilerplate and markup.
  for (const c of candidates) {
    if (c && !isBoilerplate(c) && looksLikeProse(c)) return c;
  }
  return '';
}

async function detectUrl(dir, files) {
  const isHttp = (v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim());

  // Explicit overrides for the dashboard live link.
  if (files.has('.dashboard.json')) {
    const d = await readJson(dir, files.get('.dashboard.json'));
    if (d) {
      for (const k of ['url', 'live', 'liveUrl', 'homepage']) {
        if (isHttp(d[k])) return d[k].trim();
      }
    }
  }

  for (const n of ['package.json', 'composer.json']) {
    if (files.has(n)) {
      const p = await readJson(dir, files.get(n));
      if (p) {
        for (const k of ['homepage', 'live', 'liveUrl', 'url', 'deployUrl']) {
          if (isHttp(p[k])) return p[k].trim();
        }
        // "homepage" can be a nested object in some setups.
        if (p.homepage && typeof p.homepage === 'object' && isHttp(p.homepage.url)) {
          return p.homepage.url.trim();
        }
      }
    }
  }
  if (files.has('pyproject.toml')) {
    const t = await readText(dir, files.get('pyproject.toml'));
    const m = t && t.match(/^\s*(?:Homepage|homepage)\s*=\s*"([^"]+)"/m);
    if (m && isHttp(m[1])) return m[1];
  }
  return null;
}

async function readReq(dir, files) {
  let out = '';
  for (const n of ['requirements.txt', 'pyproject.toml', 'setup.py', 'pipfile']) {
    if (files.has(n)) {
      const t = await readText(dir, files.get(n));
      if (t) out += '\n' + t;
    }
  }
  return out;
}

// Display priority: frameworks first, then languages, then tooling, then generic.
const STACK_PRIORITY = [
  'nextjs', 'nuxt', 'remix', 'astro', 'svelte', 'vue', 'angular', 'react',
  'nestjs', 'express', 'electron', 'django', 'flask', 'fastapi', 'rails',
  'laravel', 'spring', 'flutter',
  'prisma', 'graphql', 'redux', 'threejs', 'd3',
  'tailwind', 'vite', 'webpack', 'gatsby',
  'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'kotlin',
  'csharp', 'cpp', 'c', 'ruby', 'php', 'swift', 'dart', 'elixir',
  'sql', 'docker', 'node', 'html', 'css', 'shell'
];
const STACK_PRIORITY_INDEX = new Map(STACK_PRIORITY.map((k, i) => [k, i]));

// Drop VCS/forge "stacks", remove redundant signals, and order by importance so
// a card's first few icons are the ones that actually identify the project.
function refineStacks(stacks) {
  const drop = new Set(['git', 'github']);
  let out = (stacks || []).filter((k) => !drop.has(k));
  if (out.includes('typescript')) out = out.filter((k) => k !== 'javascript');
  // Node is implied by any JS project; only meaningful when it stands alone.
  if (out.length > 1) out = out.filter((k) => k !== 'node');
  out.sort((a, b) => {
    const ia = STACK_PRIORITY_INDEX.has(a) ? STACK_PRIORITY_INDEX.get(a) : 999;
    const ib = STACK_PRIORITY_INDEX.has(b) ? STACK_PRIORITY_INDEX.get(b) : 999;
    return ia - ib;
  });
  return out.slice(0, 8);
}

async function detectStacks(dir, entries, files) {
  const stacks = [];
  const seen = new Set();
  const add = (k) => {
    if (k && !seen.has(k)) {
      seen.add(k);
      stacks.push(k);
    }
  };
  const hasFile = (n) => files.has(n);
  const hasDir = (n) => (entries || []).some((e) => e.isDirectory() && e.name.toLowerCase() === n);

  const extCount = {};
  countExtensions(entries, extCount);
  const srcDir = (entries || []).find((e) =>
    e.isDirectory() && ['src', 'lib', 'app', 'source', 'server', 'client'].includes(e.name.toLowerCase())
  );
  if (srcDir) {
    const sub = await readEntries(path.join(dir, srcDir.name));
    if (sub) countExtensions(sub, extCount);
  }

  const dotnet = (entries || []).some(
    (e) => e.isFile() && ['.sln', '.csproj', '.fsproj', '.vbproj'].includes(path.extname(e.name.toLowerCase()))
  );

  if (hasFile('package.json')) {
    const p = await readJson(dir, files.get('package.json'));
    const deps = collectDeps(p);
    const isTs = deps.has('typescript') || hasFile('tsconfig.json') || (extCount['.ts'] + extCount['.tsx'] > 0);
    add(isTs ? 'typescript' : 'javascript');
    add('node');
    for (const [dep, key] of DEP_FRAMEWORKS) {
      if (deps.has(dep)) add(key);
    }
  } else if (hasFile('cargo.toml')) {
    add('rust');
  } else if (hasFile('go.mod')) {
    add('go');
  } else if (hasFile('pyproject.toml') || hasFile('setup.py') || hasFile('requirements.txt') || hasFile('pipfile')) {
    add('python');
    const req = await readReq(dir, files);
    if (req) {
      if (/django/i.test(req)) add('django');
      if (/flask/i.test(req)) add('flask');
      if (/fastapi/i.test(req)) add('fastapi');
      if (/pytest/i.test(req)) add('pytest');
    }
  } else if (hasFile('pom.xml') || hasFile('build.gradle') || hasFile('build.gradle.kts') || hasFile('settings.gradle')) {
    add((extCount['.kt'] + extCount['.kts'] > 0) ? 'kotlin' : 'java');
    add('gradle');
  } else if (dotnet) {
    add('csharp');
  } else if (hasFile('composer.json')) {
    add('php');
  } else if (hasFile('gemfile')) {
    add('ruby');
  } else if (hasFile('mix.exs')) {
    add('elixir');
  } else if (hasFile('pubspec.yaml')) {
    add('dart');
    const t = await readText(dir, files.get('pubspec.yaml'));
    if (t && /flutter/i.test(t)) add('flutter');
  } else if (hasFile('cmakelists.txt') || hasFile('makefile')) {
    if (extCount['.c'] || extCount['.h']) add('c');
    if (extCount['.cpp'] || extCount['.hpp']) add('cpp');
  }

  if (stacks.length === 0) {
    if (extCount['.py']) add('python');
    if (extCount['.js'] || extCount['.mjs'] || extCount['.cjs'] || extCount['.jsx']) add('javascript');
    if (extCount['.ts'] || extCount['.tsx']) add('typescript');
    if (extCount['.go']) add('go');
    if (extCount['.rs']) add('rust');
    if (extCount['.java']) add('java');
    if (extCount['.cs']) add('csharp');
    if (extCount['.cpp'] || extCount['.c'] || extCount['.h'] || extCount['.hpp']) add('cpp');
    if (extCount['.rb']) add('ruby');
    if (extCount['.php']) add('php');
    if (extCount['.swift']) add('swift');
    if (extCount['.kt'] || extCount['.kts']) add('kotlin');
    if (extCount['.dart']) add('dart');
    if (extCount['.ex'] || extCount['.exs']) add('elixir');
    if (extCount['.vue']) add('vue');
    if (extCount['.svelte']) add('svelte');
    if (extCount['.astro']) add('astro');
    if (extCount['.html']) add('html');
    if (extCount['.css'] || extCount['.scss'] || extCount['.less']) add('css');
  }

  if (hasFile('dockerfile') || hasFile('docker-compose.yml') || hasFile('docker-compose.yaml')) add('docker');
  if (hasDir('.git')) add('git');
  if (hasDir('.github')) add('github');
  if (hasFile('tailwind.config.js') || hasFile('tailwind.config.ts') || hasFile('tailwind.config.cjs')) add('tailwind');
  if (hasFile('vite.config.js') || hasFile('vite.config.ts')) add('vite');
  if (hasFile('webpack.config.js') || hasFile('webpack.config.cjs')) add('webpack');
  if (extCount['.html']) add('html');
  if (extCount['.css'] || extCount['.scss'] || extCount['.less']) add('css');
  if (extCount['.sh'] || extCount['.bash'] || extCount['.zsh']) add('shell');
  if (extCount['.sql']) add('sql');

  return refineStacks(stacks);
}

async function detectImage(dir, entries) {
  const images = [];
  for (const e of entries || []) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const base = path.basename(e.name, ext).toLowerCase();
    const rank = NAMED_IMAGES.indexOf(base);
    images.push({ file: e.name, base, rank: rank === -1 ? 999 : rank });
  }
  if (!images.length) return null;
  images.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.base.localeCompare(b.base)));
  return images[0].file;
}

// ---------- Package manager / scripts / framework ----------
function detectPackageManager(files) {
  if (files.has('pnpm-lock.yaml')) return 'pnpm';
  if (files.has('yarn.lock')) return 'yarn';
  if (files.has('bun.lock') || files.has('bun.lockb')) return 'bun';
  if (files.has('package-lock.json')) return 'npm';
  if (files.has('package.json')) return 'npm';
  return null;
}

async function detectScripts(dir, files) {
  if (!files.has('package.json')) return { scripts: [], runScript: null };
  const p = await readJson(dir, files.get('package.json'));
  const scripts = p && p.scripts && typeof p.scripts === 'object' ? Object.keys(p.scripts) : [];
  let runScript = null;
  if (scripts.includes('dev')) runScript = 'dev';
  else if (scripts.includes('start')) runScript = 'start';
  return { scripts: scripts.slice(0, 40), runScript };
}

const FRAMEWORK_KEYS = [
  'nextjs', 'nuxt', 'remix', 'astro', 'svelte', 'vue', 'angular', 'react',
  'nestjs', 'express', 'electron', 'django', 'flask', 'fastapi', 'rails', 'laravel', 'spring', 'flutter'
];

function detectFramework(stacks) {
  for (const k of FRAMEWORK_KEYS) {
    if (stacks.includes(k)) return k;
  }
  return null;
}

// ---------- Git (read-only) ----------
// Parse the `## ` header line from `git status --branch`.
function parseGitBranchLine(info, out) {
  const noCommits = info.match(/^No commits yet on (.+)$/);
  if (noCommits) { out.branch = noCommits[1].trim(); return; }

  const ahead = info.match(/ahead (\d+)/);
  const behind = info.match(/behind (\d+)/);
  if (ahead) out.ahead = Number(ahead[1]);
  if (behind) out.behind = Number(behind[1]);

  const head = info.split('...')[0].trim();
  out.upstream = info.includes('...');

  if (/^HEAD\b/i.test(head)) {
    out.detached = true;
    out.branch = null;
    const sha = info.match(/detached at ([0-9a-f]{7,})/i);
    if (sha) out.branch = sha[1];
    return;
  }
  out.branch = head || null;
}

async function detectGit(dir) {
  const out = { isRepo: false };
  let hasGit = false;
  try { hasGit = fs.existsSync(path.join(dir, '.git')); } catch {}
  if (!hasGit) return out;

  out.isRepo = true;
  out.ok = false;
  out.error = false;
  out.branch = null;
  out.detached = false;
  out.upstream = false;
  out.dirty = false;
  out.changed = 0;
  out.files = [];
  out.ahead = 0;
  out.behind = 0;
  out.lastCommit = null;
  out.lastCommitDate = null;
  out.remote = null;

  // `-c safe.directory=*` bypasses git's "dubious ownership" refusal, which
  // otherwise makes many repos fail silently and look like a bogus
  // "detached - Clean". All commands here are read-only.
  const run = (args) => execFileAsync(
    'git',
    ['-C', dir, '-c', 'safe.directory=*', '--no-optional-locks', ...args],
    { timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
  );

  try {
    const { stdout } = await run(['status', '--porcelain=v1', '--branch']);
    out.ok = true;
    for (const line of stdout.split(/\r?\n/)) {
      if (line.startsWith('## ')) {
        parseGitBranchLine(line.slice(3), out);
      } else if (line.trim()) {
        out.changed++;
        if (out.files.length < 40) {
          const code = line.slice(0, 2).trim() || '?';
          const file = line.slice(3).trim();
          if (file) out.files.push({ code, path: file });
        }
      }
    }
    out.dirty = out.changed > 0;
  } catch {
    out.error = true;
  }

  // Fallback: read .git/HEAD directly so a branch (and a truthful detached
  // state) is still shown when git itself refuses to run.
  if (!out.branch && !out.detached) {
    try {
      const head = fs.readFileSync(path.join(dir, '.git', 'HEAD'), 'utf8').trim();
      const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
      if (ref) out.branch = ref[1];
      else if (/^[0-9a-f]{40}$/i.test(head)) {
        out.detached = true;
        out.branch = head.slice(0, 7);
      }
    } catch {}
  }

  try {
    const { stdout } = await run(['log', '-1', '--format=%cI%x00%s']);
    const parts = stdout.replace(/\n$/, '').split('\u0000');
    if (parts[0]) out.lastCommitDate = parts[0];
    if (parts[1]) out.lastCommit = parts[1];
  } catch {}

  // Read the remote straight from .git/config (no extra process) when possible.
  try {
    const cfg = fs.readFileSync(path.join(dir, '.git', 'config'), 'utf8');
    const m = cfg.match(/\[remote\s+"origin"\][^\[]*?\burl\s*=\s*(.+)/i);
    if (m) out.remote = m[1].trim();
  } catch {}
  if (!out.remote) {
    try {
      const { stdout } = await run(['config', '--get', 'remote.origin.url']);
      out.remote = stdout.trim() || null;
    } catch {}
  }

  return out;
}

// Turn any git remote (https, git@host:owner/repo, ssh://) into a web URL.
function remoteToWeb(url) {
  if (!url) return null;
  const u = String(url).trim();
  const scp = u.match(/^git@([^:]+):(.+)$/i);
  if (scp) return 'https://' + scp[1] + '/' + scp[2].replace(/\.git$/i, '');
  const ssh = u.match(/^ssh:\/\/git@([^/]+)\/(.+)$/i);
  if (ssh) return 'https://' + ssh[1] + '/' + ssh[2].replace(/\.git$/i, '');
  if (/^https?:\/\//i.test(u)) return u.replace(/\.git$/i, '');
  return null;
}

// "owner/repo" or just "repo" from a remote URL.
function repoNameFrom(url) {
  const web = remoteToWeb(url);
  const src = web || url || '';
  const parts = String(src).replace(/\.git$/i, '').split('/').filter(Boolean);
  return parts.length ? parts.slice(-2).join('/') : null;
}

async function buildProject(dir, entries, opts) {
  opts = opts || {};
  const stat = await safeStat(dir);
  const files = new Map();
  for (const e of entries || []) {
    if (e.isFile()) files.set(e.name.toLowerCase(), e.name);
  }
  const name = await detectName(dir, files);
  const description = await detectDescription(dir, files);
  const stacks = await detectStacks(dir, entries, files);
  const imageName = await detectImage(dir, entries);
  const url = await detectUrl(dir, files);
  const packageManager = detectPackageManager(files);
  const { scripts, runScript } = await detectScripts(dir, files);
  const framework = detectFramework(stacks);

  let git = { isRepo: false };
  if (opts.git !== false) {
    try {
      git = await detectGit(dir);
    } catch {
      git = { isRepo: false };
    }
  }

  const mtimeMs = stat ? stat.mtimeMs : Date.now();
  const commitMs = git.lastCommitDate ? Date.parse(git.lastCommitDate) || 0 : 0;

  return {
    path: dir,
    name,
    description,
    stacks,
    image: imageName ? path.join(dir, imageName) : null,
    url: url || null,
    packageManager,
    scripts,
    runScript,
    framework,
    git,
    repoName: git.remote ? repoNameFrom(git.remote) : null,
    remoteWeb: git.remote ? remoteToWeb(git.remote) : null,
    mtimeMs,
    lastActivityMs: Math.max(mtimeMs, commitMs),
    isRoot: false
  };
}

const MAX_DEPTH = 6;
const MAX_VISIT = 5000;

async function scan(roots, opts) {
  const out = [];
  const seen = new Set();
  let visits = 0;

  async function walk(dir, depth) {
    if (depth > MAX_DEPTH || visits > MAX_VISIT) return;

    let norm;
    try {
      norm = path.resolve(dir);
    } catch {
      return;
    }
    const key = norm.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    visits++;

    const entries = await readEntries(norm);
    if (!entries) return;

    if (isProjectEntries(entries)) {
      const p = await buildProject(norm, entries, opts);
      p.isRoot = depth === 0;
      out.push(p);
      return; // identified a project — don't descend into its internals
    }

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const lower = e.name.toLowerCase();
      if (SKIP_DIRS.has(lower) || e.name.startsWith('.')) continue;
      await walk(path.join(norm, e.name), depth + 1);
    }
  }

  for (const root of roots || []) {
    await walk(root, 0);
  }

  return out;
}

module.exports = { scan, detectGit };
