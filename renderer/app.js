'use strict';

const bridge = window.api;

const state = {
  roots: [],
  projects: [],
  filtered: [],
  query: '',
  selectedStacks: new Set(),
  sort: 'name',
  view: 'grid',
  sidebarOpen: true,
  current: null,
  prompt: null,
  ratings: {},
  liveUrls: {},
  favorites: {},
  tags: {},
  notes: {},
  descriptions: {},
  names: {},
  statuses: {},
  runs: {},
  filters: { status: 'all', git: 'all', fav: false, tags: new Set() },
  editor: null,
  scanning: false
};

/* ---------- helpers ---------- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function stackMeta(key) {
  const s = window.STACKS[key];
  if (s) return s;
  const str = String(key || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  const palette = [
    ['#fef3c7', '#b45309'], ['#dbeafe', '#1d4ed8'], ['#dcfce7', '#15803d'],
    ['#fee2e2', '#b91c1c'], ['#ede9fe', '#6d28d9'], ['#cffafe', '#0e7490'],
    ['#fce7f3', '#be185d'], ['#ecfccb', '#3f6212'], ['#fed7aa', '#9a3412']
  ];
  const [bg, fg] = palette[Math.abs(hash) % palette.length];
  const label = str.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, bg, fg, mono: label.replace(/\s+/g, '').slice(0, 2).toUpperCase() };
}

function stackChip(key, opts) {
  opts = opts || {};
  const m = stackMeta(key);
  const cls = (opts.selected ? ' selected' : '') + (opts.label ? ' labeled' : '');
  const dataStack = opts.filter ? ` data-stack="${esc(key)}"` : '';
  const label = opts.label ? `<span class="chip-label">${esc(m.label)}</span>` : '';
  return `<span class="chip${cls}"${dataStack} title="${esc(m.label)}">` +
    window.stackIconHtml(key, 'chip-ic') + label + `</span>`;
}

// Card stack row: at most `max` icons, then a "+N" chip with the rest as tooltip.
function stacksHtml(p, max) {
  const keys = p.stacks || [];
  const shown = keys.slice(0, max);
  const rest = keys.slice(max);
  let html = shown.map((k) => stackChip(k)).join('');
  if (rest.length) {
    html += `<span class="chip more" title="${esc(rest.map((k) => stackMeta(k).label).join(', '))}">+${rest.length}</span>`;
  }
  return html;
}

function thumbIconHtml(p) {
  return `<span class="thumb-code thumb-initials">${esc(monogramFor(nameFor(p)))}</span>`;
}

// Display name: user override first, then the detected name.
function nameFor(p) {
  const override = state.names && state.names[p.path];
  return (override != null && override !== '') ? override : (p.name || '');
}

// Two-letter monogram used for the thumbnail fallback.
function monogramFor(name) {
  const words = String(name || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function liveUrlFor(p) {
  return (state.liveUrls && state.liveUrls[p.path]) || p.url || null;
}

// Difficulty is ordinal and user-assigned. Colours form a cool -> warm
// intensity ramp (deliberately no green) so they read as "harder", not
// "better/worse" — and the chip always carries the name as a label.
const DIFFICULTY = [
  { name: 'Unrated', color: 'var(--text-3)' },
  { name: 'Beginner', color: '#38bdf8' },
  { name: 'Easy', color: '#818cf8' },
  { name: 'Moderate', color: '#c084fc' },
  { name: 'Hard', color: '#f472b6' },
  { name: 'Expert', color: '#fb7185' }
];

// Card representation: a labelled chip. Unrated projects show nothing.
function difficultyHtml(path, value) {
  const v = Math.max(0, Math.min(5, value || 0));
  if (!v) return '';
  const d = DIFFICULTY[v];
  return `<button class="diff-chip" data-action="rate" data-path="${esc(path)}" title="Difficulty: ${esc(d.name)} (${v}/5) \u2014 click to change">` +
    `<span class="diff-dot" style="--dc:${d.color}"></span>${esc(d.name)}</button>`;
}

// Detail representation: a labelled segmented picker (matches the status control).
function difficultyPickerHtml(path, value) {
  const v = Math.max(0, Math.min(5, value || 0));
  const buttons = DIFFICULTY.slice(1).map((d, i) => {
    const n = i + 1;
    return `<button class="sseg${v === n ? ' active' : ''}" style="--sc:${d.color}" data-action="rate" data-rate="${n}" data-path="${esc(path)}" title="${esc(d.name)} (${n}/5)">${esc(d.name)}</button>`;
  });
  if (v) buttons.push(`<button class="sseg clear" data-action="rate" data-rate="0" data-path="${esc(path)}">Clear</button>`);
  return `<div class="status-seg rate-seg">${buttons.join('')}</div>`;
}

/* ---------- status, activity, git, favorites & tags ---------- */

const STATUSES = [
  { key: 'development', label: 'Development', color: '#3b9eff', icon: 'code' },
  { key: 'live', label: 'Live', color: '#22c55e', icon: 'play' },
  { key: 'paused', label: 'Paused', color: '#f59e0b', icon: 'pause' },
  { key: 'archived', label: 'Archived', color: '#929aae', icon: 'archive' },
  { key: 'broken', label: 'Broken', color: '#ef4444', icon: 'alert' }
];

function statusMeta(key) {
  return STATUSES.find((s) => s.key === key) || STATUSES[0];
}

// Detected status, plus any user override.
function statusInfo(p) {
  const override = (state.statuses && state.statuses[p.path]) || null;
  const detected = liveUrlFor(p) ? 'live' : 'development';
  return { override, detected, effective: override || detected };
}

function effectiveStatus(p) {
  return statusInfo(p).effective;
}

// System-locale date/time without the noisy seconds.
function fmtDate(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function timeAgo(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 45000) return 'just now';
  const min = Math.floor(diff / 60000);
  if (min < 60) return min + 'm ago';
  const h = Math.floor(min / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 30) return d + 'd ago';
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo + 'mo ago';
  return Math.floor(mo / 12) + 'y ago';
}

function isRepo(p) {
  return !!(p.git && p.git.isRepo);
}

function gitStatusParts(p) {
  const g = p.git || {};
  if (!g.isRepo) return null;
  return {
    unavailable: !g.ok,
    branch: g.detached ? (g.branch ? 'detached @ ' + g.branch : 'detached') : g.branch,
    changed: g.changed || 0,
    ahead: g.ahead || 0,
    behind: g.behind || 0,
    lastCommit: g.lastCommit || ''
  };
}

// Card git line: branch, coloured change count (clickable), ahead/behind.
function gitLineHtml(p) {
  const s = gitStatusParts(p);
  if (!s) return '';
  const icon = window.iconSvg('gitBranch');
  if (s.unavailable) {
    const label = s.branch ? `${esc(s.branch)} \u00b7 status unavailable` : 'Git unavailable';
    return `<span class="card-git" title="Git could not read this repository">${icon}<span class="git-unavailable">${label}</span></span>`;
  }
  const parts = [];
  if (s.branch) parts.push(`<span class="git-branch" title="${esc(s.lastCommit || s.branch)}">${esc(s.branch)}</span>`);
  if (s.changed) {
    const n = s.changed;
    parts.push(`<button class="git-changes" data-action="git-files" data-path="${esc(p.path)}" title="Show ${n} changed file${n === 1 ? '' : 's'}">${n} change${n === 1 ? '' : 's'}</button>`);
  } else {
    parts.push('<span class="git-clean">Clean</span>');
  }
  if (s.ahead) {
    parts.push(`<span class="git-ahead" title="${s.ahead} commit${s.ahead === 1 ? '' : 's'} not pushed">${s.ahead} not pushed</span>`);
  }
  if (s.behind) {
    parts.push(`<span class="git-behind" title="${s.behind} commit${s.behind === 1 ? '' : 's'} behind remote">${s.behind} behind</span>`);
  }
  return `<span class="card-git">${icon}${parts.join('<span class="git-sep">\u00b7</span>')}</span>`;
}

function isFav(p) {
  return !!(state.favorites && state.favorites[p.path]);
}

function tagsFor(p) {
  return (state.tags && state.tags[p.path]) || [];
}

function toggleFavorite(path) {
  if (!state.favorites) state.favorites = {};
  if (state.favorites[path]) delete state.favorites[path];
  else state.favorites[path] = true;
  persistSettings();
  applyFilters();
  if (state.current && state.current.path === path) showDetail(state.current);
}

function setStatus(path, key) {
  if (!state.statuses) state.statuses = {};
  if (!key || key === 'auto') delete state.statuses[path];
  else state.statuses[path] = key;
  persistSettings();
  applyFilters();
  if (state.current && state.current.path === path) showDetail(state.current);
}

function addTag(path, value) {
  const parts = String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return;
  if (!state.tags) state.tags = {};
  const list = state.tags[path] || [];
  for (const part of parts) {
    if (!list.some((t) => t.toLowerCase() === part.toLowerCase())) list.push(part);
  }
  state.tags[path] = list;
  persistSettings();
  applyFilters();
  if (state.current && state.current.path === path) showDetail(state.current);
}

function removeTag(path, tag) {
  const list = tagsFor(path).filter((t) => t !== tag);
  if (list.length) state.tags[path] = list;
  else if (state.tags) delete state.tags[path];
  persistSettings();
  applyFilters();
  if (state.current && state.current.path === path) showDetail(state.current);
}

function setNotes(path, value) {
  if (!state.notes) state.notes = {};
  const v = String(value || '').trim();
  if (v) state.notes[path] = v;
  else delete state.notes[path];
  persistSettings();
}

function setName(path, value) {
  if (!state.names) state.names = {};
  const p = findProject(path);
  const detected = (p && p.name) || '';
  const v = String(value || '').trim().slice(0, 60);
  if (!v || v === detected) delete state.names[path];
  else state.names[path] = v;
  persistSettings();
  applyFilters();
  if (state.current && state.current.path === path) showDetail(state.current);
}

async function editName(path) {
  const p = findProject(path);
  if (!p || !window.extras || !window.extras.promptInput) return;
  const value = await window.extras.promptInput({
    title: 'Rename project',
    value: nameFor(p),
    placeholder: p.name,
    confirmLabel: 'Save'
  });
  if (value === null) return;
  setName(path, value);
}

// Last activity, and whether it came from a commit or the file system.
function activityInfo(p) {
  const g = p.git || {};
  const commitMs = g.lastCommitDate ? Date.parse(g.lastCommitDate) || 0 : 0;
  const mtime = p.mtimeMs || 0;
  const ms = p.lastActivityMs || Math.max(mtime, commitMs);
  const fromGit = commitMs > 0 && commitMs >= mtime;
  const full = ms ? fmtDate(ms) : '';
  return {
    ms,
    fromGit,
    full,
    label: fromGit ? 'committed' : 'modified',
    title: fromGit ? `Last commit: ${full}` : `Files last modified: ${full}`
  };
}

// Description shown for a project: user override first, then detected.
function descFor(p) {
  const override = state.descriptions && state.descriptions[p.path];
  return (override != null && override !== '') ? override : (p.description || '');
}

function setDescription(path, value) {
  if (!state.descriptions) state.descriptions = {};
  const p = findProject(path);
  const detected = (p && p.description) || '';
  const v = String(value || '').trim();
  if (!v || v === detected) delete state.descriptions[path];
  else state.descriptions[path] = v;
  persistSettings();
  applyFilters();
  if (state.current && state.current.path === path) showDetail(state.current);
}

// Edit the description in place, inside the details modal.
function editDescription(path) {
  const p = findProject(path);
  const el = document.getElementById('detail-desc');
  if (!p || !el) return;
  if (el.parentNode.querySelector('.desc-edit')) return;
  const current = descFor(p);

  const wrap = document.createElement('div');
  wrap.className = 'desc-edit';
  wrap.innerHTML =
    `<textarea class="notes-input desc-input" spellcheck="false" placeholder="What is this project?">${esc(current)}</textarea>` +
    '<div class="desc-edit-actions">' +
      '<button class="ghost-btn" data-desc-cancel>Cancel</button>' +
      '<button class="primary-btn" data-desc-save>Save</button>' +
    '</div>';
  el.hidden = true;
  el.parentNode.insertBefore(wrap, el.nextSibling);

  const ta = wrap.querySelector('textarea');
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  const finish = (save) => {
    const value = ta.value;
    wrap.remove();
    el.hidden = false;
    const cta = document.getElementById('detail-desc-cta');
    if (cta) cta.hidden = false;
    if (save) setDescription(path, value);
  };
  const ctaHidden = document.getElementById('detail-desc-cta');
  if (ctaHidden) ctaHidden.hidden = true;
  wrap.querySelector('[data-desc-cancel]').addEventListener('click', () => finish(false));
  wrap.querySelector('[data-desc-save]').addEventListener('click', () => finish(true));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
  });
}

function setRating(path, n) {
  if (!state.ratings) state.ratings = {};
  const cur = state.ratings[path] || 0;
  if (n <= 0 || cur === n) delete state.ratings[path];
  else state.ratings[path] = n;
  persistSettings();
  applyFilters();
  if (state.current && state.current.path === path) showDetail(state.current);
}

function openLive(path) {
  const p = findProject(path);
  const url = p && liveUrlFor(p);
  if (!url) { toast('No live URL set', true); return; }
  bridge.openExternal(url).then((r) => { if (r && !r.ok) toast(r.error || 'Could not open link', true); });
}

function setLiveUrl(path) {
  const p = findProject(path);
  const cur = (p && liveUrlFor(p)) || '';
  const apply = (val) => {
    if (val === null || val === undefined) return;
    if (!state.liveUrls) state.liveUrls = {};
    const trimmed = String(val).trim();
    if (trimmed) state.liveUrls[path] = trimmed;
    else delete state.liveUrls[path];
    persistSettings();
    applyFilters();
    if (state.current && state.current.path === path) showDetail(state.current);
  };
  if (window.extras && window.extras.promptInput) {
    window.extras.promptInput({
      title: 'Live URL',
      value: cur,
      placeholder: 'https://example.com',
      confirmLabel: 'Save'
    }).then(apply);
  } else {
    toast('Try again in a moment', true);
  }
}

function findProject(path) {
  return state.projects.find((p) => p.path === path);
}

function showLoading(on) {
  const el = document.getElementById('loading');
  if (!el) return;
  // Veil the projects area only when cards are already on screen; otherwise the
  // loader simply fills the main section.
  if (on) el.classList.toggle('has-cards', !!document.querySelector('#grid .card'));
  el.hidden = !on;
}

let toastTimer = null;
function toast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function hideContextMenu() {
  document.getElementById('context-menu').hidden = true;
}

let lastContextPos = { x: 0, y: 0 };

// Shared popover positioning (rate picker, changed-files list).
function positionPopover(el, anchor) {
  const rect = el.getBoundingClientRect();
  let x;
  let y;
  if (anchor && anchor.getBoundingClientRect) {
    const a = anchor.getBoundingClientRect();
    x = a.left;
    y = a.bottom + 6;
    if (y + rect.height > window.innerHeight - 8) y = a.top - rect.height - 6;
  } else {
    x = lastContextPos.x;
    y = lastContextPos.y;
    if (y + rect.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - rect.height - 8);
  }
  if (x + rect.width > window.innerWidth - 8) x = window.innerWidth - rect.width - 8;
  el.style.left = Math.max(8, x) + 'px';
  el.style.top = Math.max(8, y) + 'px';
}

// Small floating picker for setting a project's difficulty.
function hideRateMenu() {
  const m = document.getElementById('rate-menu');
  if (m) m.hidden = true;
}

function openRateMenu(anchor, path) {
  const menu = document.getElementById('rate-menu');
  if (!menu || !path) return;
  const cur = (state.ratings && state.ratings[path]) || 0;
  const items = DIFFICULTY.slice(1).map((d, i) => {
    const v = i + 1;
    const active = cur === v ? ' active' : '';
    return `<div class="rate-item${active}" data-rate="${v}" data-path="${esc(path)}">` +
      `<span class="diff-dot" style="--dc:${d.color}"></span><span>${esc(d.name)}</span>` +
      (cur === v ? `<span class="rate-check">${window.iconSvg('check')}</span>` : '') +
      '</div>';
  });
  if (cur) {
    items.push('<div class="cm-sep"></div>');
    items.push(`<div class="rate-item clear" data-rate="0" data-path="${esc(path)}"><span class="diff-dot clear"></span><span>Clear rating</span></div>`);
  }
  menu.innerHTML = items.join('');
  menu.hidden = false;
  positionPopover(menu, anchor);
}

// Changed-files popover, opened from the card's change count or the modal.
function hideGitFilesMenu() {
  const m = document.getElementById('file-menu');
  if (m) m.hidden = true;
}

function openGitFilesMenu(anchor, path) {
  const menu = document.getElementById('file-menu');
  const p = findProject(path);
  if (!menu) return;
  if (!p || !p.git || !p.git.isRepo) { toast('Not a Git repository', true); return; }
  const files = p.git.files || [];
  const total = p.git.changed || 0;
  if (!files.length) { toast('No changed files'); return; }
  const more = Math.max(0, total - files.length);
  const sep = path.indexOf('\\') !== -1 ? '\\' : '/';
  menu.innerHTML =
    `<div class="file-menu-head">${total} changed file${total === 1 ? '' : 's'}</div>` +
    files.map((f) => {
      const full = path.replace(/[\\/]+$/, '') + sep + f.path.replace(/[\\/]/g, sep);
      return `<div class="file-item" data-action="copy" data-path="${esc(full)}" title="Copy path">` +
        `<span class="file-code" data-code="${esc(f.code.slice(0, 1))}">${esc(f.code)}</span>` +
        `<span class="file-path">${esc(f.path)}</span></div>`;
    }).join('') +
    (more > 0 ? `<div class="file-more">+${more} more</div>` : '');
  menu.hidden = false;
  positionPopover(menu, anchor);
}

/* ---------- status + script popovers ---------- */

function hideStatusMenu() {
  const m = document.getElementById('status-menu');
  if (m) m.hidden = true;
}

function openStatusMenu(anchor, path) {
  const menu = document.getElementById('status-menu');
  const p = findProject(path);
  if (!menu || !p) return;
  const info = statusInfo(p);
  const items = STATUSES.map((s) => {
    const active = info.effective === s.key;
    return `<div class="rate-item${active ? ' active' : ''}" data-action="set-status" data-path="${esc(path)}" data-status="${s.key}">` +
      `<span class="diff-dot" style="--dc:${s.color}"></span><span>${esc(s.label)}</span>` +
      (active ? `<span class="rate-check">${window.iconSvg('check')}</span>` : '') +
      '</div>';
  });
  if (info.override) {
    items.push('<div class="cm-sep"></div>');
    items.push(`<div class="rate-item" data-action="set-status" data-path="${esc(path)}" data-status="auto">` +
      `<span class="diff-dot clear"></span><span>Use detected (${esc(statusMeta(info.detected).label)})</span></div>`);
  }
  menu.innerHTML = items.join('');
  menu.hidden = false;
  positionPopover(menu, anchor);
}

function hideScriptMenu() {
  const m = document.getElementById('script-menu');
  if (m) m.hidden = true;
}

function openScriptMenu(anchor, path) {
  const menu = document.getElementById('script-menu');
  const p = findProject(path);
  if (!menu || !p) return;
  const scripts = p.scripts || [];
  if (!scripts.length) { toast('No scripts in package.json', true); return; }
  const manager = p.packageManager || 'npm';
  menu.innerHTML =
    `<div class="file-menu-head">Run script (${esc(manager)})</div>` +
    scripts.map((s) => `<div class="rate-item" data-action="run-script" data-path="${esc(path)}" data-script="${esc(s)}">` +
      `<span class="script-ic">${window.iconSvg('play')}</span><span>${esc(s)}</span></div>`).join('');
  menu.hidden = false;
  positionPopover(menu, anchor);
}

async function persistSettings() {
  try {
    const cur = await bridge.getSettings();
    await bridge.saveSettings(Object.assign({}, cur, {
      roots: state.roots,
      sort: state.sort,
      view: state.view,
      ratings: state.ratings,
      liveUrls: state.liveUrls,
      favorites: state.favorites,
      tags: state.tags,
      notes: state.notes,
      descriptions: state.descriptions,
      names: state.names,
      statuses: state.statuses
    }));
  } catch {}
}

/* ---------- icon injection ---------- */

function injectIcons() {
  const map = {
    '#tb-refresh .tb-ic': 'refresh',
    '#btn-add-folder .sb-ic': 'folderPlus',
    '#btn-new-project .sb-ic': 'plus',
    '#btn-settings .sb-ic': 'gear',
    '#settings-add-folder .sb-ic': 'folderPlus',
    '#nav-all .ni-ic': 'folder',
    '#nav-fav .ni-ic': 'star',
    '#filter-trigger .filter-ic': 'funnel',
    '#btn-toggle-sidebar .sh-ic': 'chevronLeft',
    '#view-grid .vt-ic': 'grid',
    '#view-list .vt-ic': 'list',
    '.sort-ic': 'sort',
    '.search-ic': 'search',
    '.dp-ic': 'folder',
    '.cp-ic': 'copy',
    '#detail-close .mc-ic': 'xmark',
    '#settings-close .mc-ic': 'xmark',
    '.empty-art': 'sparkle',
    '.titlebar-logo': 'code'
  };
  for (const [sel, name] of Object.entries(map)) {
    document.querySelectorAll(sel).forEach((el) => { el.innerHTML = window.iconSvg(name); });
  }
  document.querySelector('#tl-close .tl-glyph').innerHTML = window.iconSvg('xmark');
  document.querySelector('#tl-min .tl-glyph').innerHTML = window.iconSvg('minus');
  document.querySelector('#tl-max .tl-glyph.plus').innerHTML = window.iconSvg('squareMax');
  document.querySelector('#tl-max .tl-glyph.restore').innerHTML = window.iconSvg('restore');
}

/* ---------- scanning & rendering ---------- */

async function rescan() {
  if (state.scanning) return;
  state.scanning = true;
  showLoading(true);
  try {
    state.projects = await bridge.scan(state.roots);
  } catch {
    state.projects = [];
  }
  showLoading(false);
  state.scanning = false;
  renderFilterMenu();
  applyFilters();
  captureMissingThumbs();
}

/* ---------- live-site thumbnail capture ---------- */

let thumbsInFlight = false;
const thumbAttempted = new Set();

async function captureMissingThumbs() {
  if (state.captureScreenshots === false) return;
  if (!bridge.captureThumbs || thumbsInFlight) return;
  const need = state.projects
    .filter((p) => !p.image && !p.generatedImage && liveUrlFor(p) && !thumbAttempted.has(p.path))
    .map((p) => ({ path: p.path, url: liveUrlFor(p) }));
  if (!need.length) return;

  thumbsInFlight = true;
  try {
    const r = await bridge.captureThumbs(need);
    for (const n of need) thumbAttempted.add(n.path);
    if (!r || !r.ok || !r.thumbs) return;
    let changed = false;
    for (const [pth, file] of Object.entries(r.thumbs)) {
      const p = findProject(pth);
      if (p && !p.image && !p.generatedImage) { p.generatedImage = file; changed = true; }
    }
    if (changed) applyFilters();
  } catch {
    for (const n of need) thumbAttempted.add(n.path);
  } finally {
    thumbsInFlight = false;
  }
}

// Detected stacks, most common first.
function stackCounts() {
  const counts = new Map();
  for (const p of state.projects) {
    for (const k of p.stacks || []) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || stackMeta(a[0]).label.localeCompare(stackMeta(b[0]).label)
  );
}

function comparator() {
  const favFirst = (a, b) => (isFav(b) ? 1 : 0) - (isFav(a) ? 1 : 0);
  if (state.sort === 'recent') return (a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0);
  if (state.sort === 'updated') return (a, b) => (b.lastActivityMs || 0) - (a.lastActivityMs || 0);
  if (state.sort === 'git') {
    return (a, b) => {
      const la = a.git && a.git.lastCommitDate ? Date.parse(a.git.lastCommitDate) || 0 : 0;
      const lb = b.git && b.git.lastCommitDate ? Date.parse(b.git.lastCommitDate) || 0 : 0;
      return lb - la || nameFor(a).localeCompare(nameFor(b));
    };
  }
  if (state.sort === 'favorites') {
    return (a, b) => favFirst(a, b) || nameFor(a).localeCompare(nameFor(b), undefined, { sensitivity: 'base' });
  }
  if (state.sort === 'stack') {
    return (a, b) => {
      const la = (a.stacks && a.stacks[0]) ? stackMeta(a.stacks[0]).label : '';
      const lb = (b.stacks && b.stacks[0]) ? stackMeta(b.stacks[0]).label : '';
      return la.localeCompare(lb) || nameFor(a).localeCompare(nameFor(b));
    };
  }
  return (a, b) => nameFor(a).localeCompare(nameFor(b), undefined, { sensitivity: 'base' });
}

function searchHay(p) {
  const parts = [
    nameFor(p),
    p.name,
    p.description,
    p.framework,
    p.packageManager,
    p.repoName,
    (p.stacks || []).map((k) => stackMeta(k).label).join(' '),
    tagsFor(p).join(' '),
    descFor(p)
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function matchesFilters(p) {
  const f = state.filters;
  if (f.fav && !isFav(p)) return false;
  if (f.status !== 'all' && effectiveStatus(p) !== f.status) return false;
  if (f.git === 'clean' && !(isRepo(p) && !p.git.changed)) return false;
  if (f.git === 'changes' && !(isRepo(p) && p.git.changed > 0)) return false;
  if (f.git === 'none' && isRepo(p)) return false;
  if (f.tags.size) {
    const lower = tagsFor(p).map((t) => t.toLowerCase());
    for (const t of f.tags) if (!lower.includes(t.toLowerCase())) return false;
  }
  return true;
}

function activeFilterCount() {
  const f = state.filters;
  let n = 0;
  if (f.fav) n++;
  if (f.status !== 'all') n++;
  if (f.git !== 'all') n++;
  if (f.tags.size) n++;
  if (state.selectedStacks.size) n++;
  return n;
}

function anyFilterActive() {
  return activeFilterCount() > 0;
}

function clearFilters() {
  state.filters = { status: 'all', git: 'all', fav: false, tags: new Set() };
  state.selectedStacks.clear();
  renderFilterMenu();
  applyFilters();
}

function applyFilters() {
  const q = state.query.trim().toLowerCase();
  let list = state.projects;
  if (q) list = list.filter((p) => searchHay(p).includes(q));
  list = list.filter(matchesFilters);
  if (state.selectedStacks.size) {
    list = list.filter((p) => (p.stacks || []).some((k) => state.selectedStacks.has(k)));
  }
  list = [...list].sort(comparator());
  state.filtered = list;
  updateToolbarTitle();
  renderCards(list);
}

function updateToolbarTitle() {
  const t = document.getElementById('toolbar-title');
  if (state.filters.fav) { t.textContent = 'Favorites'; return; }
  t.textContent = state.selectedStacks.size === 1
    ? stackMeta([...state.selectedStacks][0]).label
    : 'All Projects';
}

/* ---------- filter panel ---------- */

function filterChips(group, options, current, attr) {
  return options.map((o) => {
    const active = String(o.value) === String(current) ? ' active' : '';
    return `<button class="fchip${active}" data-group="${group}" ${attr}="${esc(String(o.value))}">${o.label}</button>`;
  }).join('');
}

function allTags() {
  const set = new Map();
  for (const list of Object.values(state.tags || {})) {
    for (const t of list) set.set(t, (set.get(t) || 0) + 1);
  }
  return [...set.keys()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).slice(0, 14);
}

function renderFilterMenu() {
  const menu = document.getElementById('filter-menu');
  if (!menu) return;
  const f = state.filters;
  const statusOpts = [{ value: 'all', label: 'All' }].concat(STATUSES.map((s) => ({ value: s.key, label: s.label })));
  const gitOpts = [
    { value: 'all', label: 'Any' },
    { value: 'clean', label: 'Clean' },
    { value: 'changes', label: 'Has changes' },
    { value: 'none', label: 'Not a repo' }
  ];
  const tags = allTags();
  const stacks = stackCounts().slice(0, 18);

  menu.innerHTML =
    '<div class="filter-group">' +
      '<div class="filter-group-title">Show</div>' +
      '<div class="filter-chips">' +
        `<button class="fchip${!f.fav ? ' active' : ''}" data-group="fav" data-value="all">All</button>` +
        `<button class="fchip${f.fav ? ' active' : ''}" data-group="fav" data-value="1">${window.iconSvg('starFill')}Favorites</button>` +
      '</div>' +
    '</div>' +
    '<div class="filter-group">' +
      '<div class="filter-group-title">Status</div>' +
      '<div class="filter-chips">' + filterChips('status', statusOpts, f.status, 'data-value') + '</div>' +
    '</div>' +
    (stacks.length
      ? '<div class="filter-group"><div class="filter-group-title">Stack</div><div class="filter-chips">' +
        stacks.map(([k, n]) =>
          `<button class="fchip${state.selectedStacks.has(k) ? ' active' : ''}" data-group="stack" data-value="${esc(k)}">${esc(stackMeta(k).label)}<span class="fchip-count">${n}</span></button>`
        ).join('') +
        '</div></div>'
      : '') +
    '<div class="filter-group">' +
      '<div class="filter-group-title">Git</div>' +
      '<div class="filter-chips">' + filterChips('git', gitOpts, f.git, 'data-value') + '</div>' +
    '</div>' +
    (tags.length
      ? '<div class="filter-group"><div class="filter-group-title">Tags</div><div class="filter-chips">' +
        tags.map((t) => `<button class="fchip${f.tags.has(t) ? ' active' : ''}" data-group="tag" data-value="${esc(t)}">${esc(t)}</button>`).join('') +
        '</div></div>'
      : '') +
    '<div class="filter-foot"><button class="filter-clear" id="filter-clear">Clear all</button></div>';

  const badge = document.getElementById('filter-count');
  const n = activeFilterCount();
  badge.hidden = n === 0;
  badge.textContent = String(n);
  document.getElementById('filter-trigger').classList.toggle('active', n > 0);
}

function statusBadge(p) {
  const status = effectiveStatus(p);
  const meta = statusMeta(status);
  const url = liveUrlFor(p);
  if (status === 'live' && url) {
    return `<button class="live-pill" data-action="live" data-path="${esc(p.path)}" title="Open live site"><span class="live-dot"></span>Live</button>`;
  }
  if (status === 'development') return '';
  return `<span class="status-pill" style="--sc:${meta.color}" title="${esc(meta.label)}">${window.iconSvg(meta.icon)}${esc(meta.label)}</span>`;
}

function cardHtml(p) {
  const primary = stackMeta((p.stacks && p.stacks[0]) || '');
  const img = p.image || p.generatedImage;
  const thumb = img
    ? `<img class="lazy" data-src="${esc(bridge.assetUrl(img))}" alt="">`
    : `<div class="card-fallback" style="--fbg:${primary.bg}">${thumbIconHtml(p)}</div>`;
  const stacks = stacksHtml(p, 8);
  const fav = isFav(p);

  const tags = tagsFor(p);
  const shown = tags.slice(0, 3);
  const more = tags.length - shown.length;
  const tagsHtml = tags.length
    ? '<div class="card-tags">' + shown.map((t) => `<span class="tag">${esc(t)}</span>`).join('') +
      (more > 0 ? `<span class="tag more">+${more}</span>` : '') + '</div>'
    : '';

  const gitHtml = gitLineHtml(p);
  const act = activityInfo(p);
  const updatedHtml = act.ms
    ? `<span class="card-updated" title="${esc(act.title)}">${window.iconSvg('clock')}<span>${esc(act.label + ' ' + timeAgo(act.ms))}</span></span>`
    : '';
  const foot = (gitHtml || updatedHtml)
    ? `<div class="card-foot">${gitHtml}${updatedHtml}</div>`
    : '';

  const runBtn = p.runScript
    ? `<button class="card-action" data-action="run" data-path="${esc(p.path)}" title="Run ${esc(p.runScript)}">${window.iconSvg('play')}</button>`
    : '';

  const rating = (state.ratings && state.ratings[p.path]) || 0;
  const run = runInfo(p.path);
  const runPill = run
    ? `<button class="run-pill run-pill-sm" data-action="run-open" data-path="${esc(p.path)}" title="${esc('Running ' + run.script + (run.url ? ' at ' + run.url : ''))}"><span class="run-dot"></span>${esc(run.port ? ':' + run.port : run.script)}</button>`
    : '';
  const statusPill = statusBadge(p);
  const leftMeta = difficultyHtml(p.path, rating) + runPill;
  const metaRowInner = (leftMeta || statusPill)
    ? `<span class="meta-left">${leftMeta}</span>${statusPill}`
    : '';
  const metaRow = metaRowInner ? `<div class="card-meta-row">${metaRowInner}</div>` : '';

  const desc = descFor(p);
  return `
    <article class="card" data-path="${esc(p.path)}" tabindex="0" title="Double-click to open in editor">
      <div class="card-inner">
        <div class="card-face card-front">
          <div class="card-thumb">${thumb}</div>
          <div class="card-front-body">
            <h3 class="card-title">${esc(nameFor(p))}</h3>
            ${desc ? `<p class="card-desc">${esc(desc)}</p>` : ''}
          </div>
        </div>
        <div class="card-face card-back">
          <div class="card-thumb card-thumb-list">${thumb}</div>
          <div class="card-body">
            <div class="card-back-head">
              <h4 class="card-back-title">${esc(nameFor(p))}</h4>
              ${desc ? `<p class="card-desc card-back-desc">${esc(desc)}</p>` : ''}
            </div>
            <div class="card-back-side">
              <div class="card-stacks">${stacks}</div>
              ${tagsHtml}
              <div class="card-meta">
                ${foot}
                ${metaRow}
              </div>
            </div>
          </div>
        </div>
        <div class="card-back-top">
          <div class="card-actions">
            <button class="card-action" data-action="editor" data-path="${esc(p.path)}" title="Open in editor">${window.iconSvg('code')}</button>
            ${runBtn}
            <button class="card-action" data-action="terminal" data-path="${esc(p.path)}" title="Open terminal">${window.iconSvg('terminal')}</button>
          </div>
          <button class="card-fav${fav ? ' on' : ''}" data-action="favorite" data-path="${esc(p.path)}" title="${fav ? 'Remove from favorites' : 'Add to favorites'}">${window.iconSvg(fav ? 'starFill' : 'star')}</button>
        </div>
      </div>
    </article>`;
}

function renderCards(list) {
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty-state');
  const hasProjects = state.projects.length > 0;
  const filtering = !!(state.query.trim() || anyFilterActive());

  document.getElementById('count-all').textContent = state.projects.length;
  const favCount = state.projects.filter(isFav).length;
  document.getElementById('count-fav').textContent = favCount;
  document.getElementById('nav-fav').classList.toggle('active', state.filters.fav);
  document.getElementById('nav-all').classList.toggle('active', !state.filters.fav);

  const emptyBtn = document.getElementById('empty-add');

  if (list.length) {
    grid.innerHTML = list.map(cardHtml).join('');
    grid.hidden = false;
    empty.hidden = true;
  } else {
    grid.innerHTML = '';
    grid.hidden = true;
    empty.hidden = false;
    emptyBtn.hidden = false;
    if (!hasProjects) {
      document.getElementById('empty-title').textContent = 'No projects yet';
      document.getElementById('empty-sub').textContent = 'Choose the folder where all your projects live \u2014 new ones appear automatically.';
      emptyBtn.textContent = 'Choose projects folder';
      emptyBtn.dataset.mode = 'add';
    } else if (state.filters.fav && favCount === 0 && !state.query.trim()) {
      document.getElementById('empty-title').textContent = 'No favorites yet';
      document.getElementById('empty-sub').textContent = 'Hover a project and tap the star to pin it here.';
      emptyBtn.hidden = true;
    } else if (state.query.trim()) {
      document.getElementById('empty-title').textContent = 'No projects found';
      document.getElementById('empty-sub').textContent = `Nothing matches \u201c${state.query.trim()}\u201d.`;
      emptyBtn.textContent = 'Clear search';
      emptyBtn.dataset.mode = 'clear-search';
    } else {
      document.getElementById('empty-title').textContent = 'No matching projects';
      document.getElementById('empty-sub').textContent = 'Try removing a filter to see more.';
      emptyBtn.textContent = 'Clear filters';
      emptyBtn.dataset.mode = 'clear-filters';
    }
  }

  const tc = document.getElementById('toolbar-count');
  if (!hasProjects) tc.textContent = '';
  else if (filtering) tc.textContent = `${list.length} of ${state.projects.length}`;
  else tc.textContent = `${state.projects.length} project${state.projects.length === 1 ? '' : 's'}`;

  observeLazy();
}

/* ---------- lazy image loading ---------- */

let lazyObserver = null;
function observeLazy() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('img.lazy').forEach((img) => { img.src = img.dataset.src; });
    return;
  }
  if (!lazyObserver) {
    lazyObserver = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const img = en.target;
        img.src = img.dataset.src;
        lazyObserver.unobserve(img);
      }
    }, { rootMargin: '240px' });
  }
  document.querySelectorAll('img.lazy').forEach((img) => lazyObserver.observe(img));
}

/* ---------- actions ---------- */

async function runProject(path, script) {
  const p = findProject(path);
  const r = await bridge.runProject(path, script || (p && p.runScript));
  if (r && r.ok) toast(`Running ${r.manager} run ${r.script}`);
  else toast((r && r.error) || 'Could not run project', true);
}

async function stopProject(path) {
  await bridge.stopProject(path);
  toast('Stopped');
}

function runInfo(path) {
  return (state.runs && state.runs[path]) || null;
}

function openRepo(path) {
  const p = findProject(path);
  const url = (p && (p.remoteWeb || (p.git && p.git.remote))) || null;
  if (!url) { toast('No repository URL', true); return; }
  bridge.openRemote(url).then((r) => { if (r && !r.ok) toast(r.error || 'Could not Repository', true); });
}

async function handleAction(action, path, el) {
  if (!path) return;
  switch (action) {
    case 'open': bridge.openPath(path); break;
    case 'terminal': bridge.openInTerminal(path); break;
    case 'details': { const p = findProject(path); if (p) showDetail(p); break; }
    case 'new-file': openPrompt('file', path); break;
    case 'new-folder': openPrompt('folder', path); break;
    case 'editor': if (window.extras) window.extras.openEditor(path); else bridge.openInEditor(path); break;
    case 'run': runProject(path); break;
    case 'run-script': runProject(path, el && el.dataset.script); hideScriptMenu(); break;
    case 'run-menu': openScriptMenu(el, path); break;
    case 'run-open': {
      const r = runInfo(path);
      if (r && r.url) bridge.openExternal(r.url).then((res) => { if (res && !res.ok) toast('Could not open URL', true); });
      break;
    }
    case 'stop': stopProject(path); break;
    case 'git-files': openGitFilesMenu(el, path); break;
    case 'copy': copyPath(path); break;
    case 'remote': openRepo(path); break;
    case 'favorite': toggleFavorite(path); break;
    case 'edit-desc': { const pp = findProject(path); if (pp) { showDetail(pp); editDescription(path); } break; }
    case 'rate': openRateMenu(el, path); break;
    case 'status-menu': openStatusMenu(el, path); break;
    case 'set-status': setStatus(path, el && el.dataset.status); hideStatusMenu(); break;
    case 'remove-tag': removeTag(path, el && el.dataset.tag); break;
    case 'live': openLive(path); break;
    case 'set-live': setLiveUrl(path); break;
    case 'rename': if (window.extras) window.extras.rename(path); break;
    case 'rename-name': editName(path); break;
    case 'move': if (window.extras) window.extras.move(path); break;
    case 'delete': if (window.extras) window.extras.remove(path); break;
  }
}

function copyPath(path) {
  bridge.copyText(path).then(() => toast('Path copied'));
}

/* ---------- detail modal ---------- */

function detailActionsHtml(p) {
  const actions = [
    { icon: 'code', label: 'Open in editor', action: 'editor', primary: true },
    { icon: 'play', label: p.runScript ? `Run (${p.runScript})` : 'Run project', action: 'run', disabled: !p.runScript },
    { icon: 'terminal', label: 'Open terminal', action: 'terminal' },
    { icon: 'external', label: 'Open folder', action: 'open' },
    { icon: 'copy', label: 'Copy path', action: 'copy' },
    { icon: 'pencil', label: 'Edit description', action: 'edit-desc' }
  ];
  if (isRepo(p) && (p.remoteWeb || (p.git && p.git.remote))) {
    actions.splice(2, 0, { icon: 'gitBranch', label: 'Repository', action: 'remote' });
  }
  if (!liveUrlFor(p)) actions.push({ icon: 'link', label: 'Set live URL', action: 'set-live' });
  return actions.map((a) =>
    `<button data-action="${a.action}" data-path="${esc(p.path)}" class="${a.primary ? 'primary' : ''}"${a.disabled ? ' disabled' : ''} title="${esc(a.label)}">${window.iconSvg(a.icon)}<span>${esc(a.label)}</span></button>`
  ).join('');
}

function infoRow(label, value) {
  if (!value) return '';
  return `<div class="info-row"><span class="info-label">${esc(label)}</span><span class="info-value">${value}</span></div>`;
}

function detailInfoHtml(p) {
  const g = p.git || {};
  const typeLabel = p.framework
    ? stackMeta(p.framework).label
    : ((p.stacks && p.stacks[0]) ? stackMeta(p.stacks[0]).label : '\u2014');
  const url = liveUrlFor(p);
  const rating = (state.ratings && state.ratings[p.path]) || 0;

  // Status: show what's detected, with an explicit override.
  const sInfo = statusInfo(p);
  const sMeta = statusMeta(sInfo.effective);
  const statusHtml =
    `<span class="status-pill" style="--sc:${sMeta.color}">${window.iconSvg(sMeta.icon)}${esc(sMeta.label)}</span>` +
    `<span class="muted">${sInfo.override ? 'overridden' : 'detected'}</span>` +
    (sInfo.override ? `<span class="muted">\u00b7 ${esc(statusMeta(sInfo.detected).label)} detected</span>` : '') +
    `<button class="link-btn" data-action="status-menu" data-path="${esc(p.path)}">${sInfo.override ? 'Change' : 'Override'}</button>` +
    (sInfo.override ? `<button class="link-btn" data-action="set-status" data-path="${esc(p.path)}" data-status="auto">Reset</button>` : '');

  // Run controls: script list, live running state and port.
  const run = runInfo(p.path);
  let runHtml = '';
  if (p.scripts && p.scripts.length) {
    if (run) {
      const where = run.url ? run.url.replace(/^https?:\/\//, '') : (run.port ? ':' + run.port : '');
      runHtml = '<div class="run-row">' +
        `<span class="run-pill" title="Started ${esc(fmtDate(run.startedAt))}"><span class="run-dot"></span>Running ${esc(run.script)}${where ? ' \u00b7 ' + esc(where) : ''}</span>` +
        (run.url ? `<button class="ghost-btn run-btn" data-action="run-open" data-path="${esc(p.path)}">${window.iconSvg('external')}<span>Open</span></button>` : '') +
        `<button class="ghost-btn run-btn" data-action="stop" data-path="${esc(p.path)}">Stop</button>` +
        '</div>';
    } else {
      const preferred = p.runScript;
      runHtml = '<div class="run-row">' +
        `<button class="primary-btn run-btn" data-action="run" data-path="${esc(p.path)}" title="${preferred ? 'Runs ' + esc(preferred) : 'Runs the dev or start script'}">${window.iconSvg('play')}<span>${preferred ? 'Run ' + esc(preferred) : 'Run project'}</span></button>` +
        (p.scripts.length > 1 ? `<button class="ghost-btn run-btn" data-action="run-menu" data-path="${esc(p.path)}">Choose script\u2026</button>` : '') +
        '</div>';
    }
  }

  const tags = tagsFor(p);
  const tagsHtml = '<div class="tag-editor">' +
    tags.map((t) => `<span class="tag">${esc(t)}<button class="tag-x" data-action="remove-tag" data-path="${esc(p.path)}" data-tag="${esc(t)}" title="Remove">${window.iconSvg('xmark')}</button></span>`).join('') +
    '<input class="tag-input" id="detail-tag-input" type="text" placeholder="Add tag\u2026" spellcheck="false" autocomplete="off" /></div>';

  const gitHtml = isRepo(p)
    ? '<div class="info-grid">' +
        infoRow('Repository', g.remote
          ? `<button class="info-link" data-action="remote" data-path="${esc(p.path)}">${window.iconSvg('gitBranch')}<span>${esc(p.repoName || g.remote)}</span></button>`
          : (p.repoName ? esc(p.repoName) : null)) +
        infoRow('Branch', esc(g.detached
          ? (g.branch ? 'detached @ ' + g.branch : 'detached')
          : (g.branch || 'unknown'))) +
        (g.ok === false
          ? infoRow('Working tree', '<span class="muted">Git could not read this repository</span>')
          : infoRow('Working tree', g.changed
            ? `<button class="info-link wt dirty" data-action="git-files" data-path="${esc(p.path)}" title="Show changed files">${window.iconSvg('gitBranch')}<span>${g.changed} change${g.changed === 1 ? '' : 's'}</span></button>`
            : '<span class="wt clean">Clean</span>')) +
        infoRow('Last commit', g.lastCommit
          ? esc(g.lastCommit) + (g.lastCommitDate ? ` <span class="muted">\u00b7 ${esc(timeAgo(Date.parse(g.lastCommitDate) || 0))}</span>` : '')
          : null) +
        ((g.ahead || g.behind)
          ? infoRow('Remote', esc([
              g.ahead ? `${g.ahead} not pushed` : '',
              g.behind ? `${g.behind} behind` : ''
            ].filter(Boolean).join('   \u00b7   ')))
          : '') +
      '</div>'
    : '<p class="info-empty">Not a Git repository.</p>';

  const act = activityInfo(p);
  const activityHtml = act.ms
    ? '<div class="info-grid">' +
        infoRow('Last activity', `${esc(act.label)} ${esc(timeAgo(act.ms))} <span class="muted">\u00b7 ${esc(act.full)}</span>`) +
      '</div>'
    : '<p class="info-empty">No activity recorded.</p>';

  return (
    '<div class="detail-section">' +
      '<div class="detail-section-title">General</div>' +
      '<div class="info-grid">' +
        infoRow('Type', esc(typeLabel)) +
        infoRow('Package manager', p.packageManager ? esc(p.packageManager) : null) +
      '</div>' +
      `<div class="info-row"><span class="info-label">Status</span><span class="info-value status-value">${statusHtml}</span></div>` +
      `<div class="info-row"><span class="info-label">Difficulty</span><span class="info-value">${difficultyPickerHtml(p.path, rating)}</span></div>` +
    '</div>' +
    (runHtml
      ? '<div class="detail-section"><div class="detail-section-title">' + window.iconSvg('play') + 'Run</div>' + runHtml + '</div>'
      : '') +
    '<div class="detail-section">' +
      `<div class="detail-section-title">${window.iconSvg('gitBranch')}Git</div>` +
      gitHtml +
    '</div>' +
    '<div class="detail-section">' +
      `<div class="detail-section-title">${window.iconSvg('clock')}Activity</div>` +
      activityHtml +
    '</div>' +
    '<div class="detail-section">' +
      `<div class="detail-section-title">${window.iconSvg('tag')}Organization</div>` +
      `<div class="info-row"><span class="info-label">Tags</span><span class="info-value">${tagsHtml}</span></div>` +
    '</div>' +
    (url
      ? '<div class="detail-section"><div class="detail-section-title">Live</div>' +
        `<button class="live-link" data-action="live" data-path="${esc(p.path)}">${window.iconSvg('link')}<span>${esc(url)}</span></button>` +
        `<button class="ghost-btn set-live-btn" data-action="set-live" data-path="${esc(p.path)}">Change URL</button></div>`
      : '') +
    '<div class="detail-section"><div class="detail-section-title">Notes</div>' +
      `<textarea class="notes-input" id="detail-notes" placeholder="Add a note about this project\u2026" spellcheck="false">${esc((state.notes && state.notes[p.path]) || '')}</textarea></div>`
  );
}

function showDetail(p) {
  state.current = p;
  const primary = stackMeta((p.stacks && p.stacks[0]) || '');
  const hero = document.getElementById('detail-hero');
  const img = p.image || p.generatedImage;
  if (img) {
    hero.innerHTML = `<img src="${esc(bridge.assetUrl(img))}" alt="">`;
  } else {
    hero.innerHTML = `<div class="card-fallback" style="--fbg:${primary.bg}">${thumbIconHtml(p)}</div>`;
  }
  const nameEl = document.getElementById('detail-name');
  nameEl.textContent = nameFor(p);

  // Favorite star + inline rename next to the title.
  let nameRow = document.getElementById('detail-name-row');
  if (!nameRow) {
    nameRow = document.createElement('div');
    nameRow.id = 'detail-name-row';
    nameRow.className = 'detail-name-row';
    nameEl.parentNode.insertBefore(nameRow, nameEl);
    nameRow.appendChild(nameEl);

    const favBtn = document.createElement('button');
    favBtn.id = 'detail-fav';
    favBtn.className = 'name-edit';
    favBtn.dataset.action = 'favorite';
    nameRow.appendChild(favBtn);

    const btn = document.createElement('button');
    btn.id = 'detail-name-edit';
    btn.className = 'name-edit';
    btn.dataset.action = 'rename-name';
    btn.title = 'Rename project';
    btn.innerHTML = window.iconSvg('pencil');
    nameRow.appendChild(btn);
  }
  const nameBtn = document.getElementById('detail-name-edit');
  if (nameBtn) nameBtn.dataset.path = p.path;
  const favBtn = document.getElementById('detail-fav');
  if (favBtn) {
    const fav = isFav(p);
    favBtn.dataset.path = p.path;
    favBtn.title = fav ? 'Remove from favorites' : 'Add to favorites';
    favBtn.classList.toggle('on', fav);
    favBtn.innerHTML = window.iconSvg(fav ? 'starFill' : 'star');
  }

  document.getElementById('detail-path').querySelector('.dp-text').textContent = p.path;

  const descEl = document.getElementById('detail-desc');
  const staleEdit = document.querySelector('.detail-body .desc-edit');
  if (staleEdit) staleEdit.remove();
  const prevCta = document.getElementById('detail-desc-cta');
  if (prevCta) prevCta.remove();
  const desc = descFor(p);
  descEl.hidden = false;
  descEl.textContent = desc || 'No description yet.';
  descEl.classList.toggle('empty', !desc);
  if (!desc) {
    const cta = document.createElement('button');
    cta.id = 'detail-desc-cta';
    cta.className = 'link-btn desc-cta';
    cta.dataset.action = 'edit-desc';
    cta.dataset.path = p.path;
    cta.innerHTML = window.iconSvg('plus') + '<span>Add description</span>';
    descEl.parentNode.insertBefore(cta, descEl.nextSibling);
  }

  document.getElementById('detail-stacks').innerHTML = (p.stacks || []).map((k) => stackChip(k, { label: true })).join('');

  let info = document.getElementById('detail-info');
  if (!info) {
    info = document.createElement('div');
    info.id = 'detail-info';
    info.className = 'detail-info';
    const stacksEl = document.getElementById('detail-stacks');
    stacksEl.parentNode.insertBefore(info, stacksEl.nextSibling);
  }
  info.innerHTML = detailInfoHtml(p);

  document.getElementById('detail-actions').innerHTML = detailActionsHtml(p);

  const tagInput = document.getElementById('detail-tag-input');
  if (tagInput) {
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addTag(p.path, tagInput.value); }
    });
  }
  const notes = document.getElementById('detail-notes');
  if (notes) notes.addEventListener('change', () => setNotes(p.path, notes.value));

  document.getElementById('detail-overlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  document.getElementById('detail-overlay').hidden = true;
  document.body.style.overflow = '';
  state.current = null;
  hideRateMenu();
  hideGitFilesMenu();
  hideStatusMenu();
  hideScriptMenu();
}

/* ---------- prompt modal ---------- */

function openPrompt(type, parentPath) {
  const titles = { project: 'New project', folder: 'New folder', file: 'New file' };
  state.prompt = { type, parentPath: parentPath || state.roots[0] || null };
  document.getElementById('prompt-title').textContent = titles[type] || 'New';
  document.getElementById('prompt-location').textContent = state.prompt.parentPath || 'Choose a location';
  document.getElementById('prompt-name').value = '';
  document.getElementById('prompt-overlay').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('prompt-name').focus(), 40);
}

function closePrompt() {
  document.getElementById('prompt-overlay').hidden = true;
  if (document.getElementById('detail-overlay').hidden) document.body.style.overflow = '';
  state.prompt = null;
}

async function submitPrompt() {
  const name = document.getElementById('prompt-name').value.trim();
  const parent = state.prompt && state.prompt.parentPath;
  if (!parent) { toast('Choose a location first', true); return; }
  if (!name) { toast('Enter a name', true); return; }
  let res;
  if (state.prompt.type === 'project') res = await bridge.createProject(parent, name);
  else if (state.prompt.type === 'folder') res = await bridge.createFolder(parent, name);
  else res = await bridge.createFile(parent, name, '');
  if (res && res.ok) {
    toast(`Created “${name}”`);
    closePrompt();
    await rescan();
  } else {
    toast((res && res.error) || 'Something went wrong', true);
  }
}

/* ---------- settings modal ---------- */

function renderRoots() {
  const list = document.getElementById('roots-list');
  if (!state.roots.length) {
    list.innerHTML = '<li style="color:var(--text-3)">No folders added yet.</li>';
    return;
  }
  list.innerHTML = state.roots.map((r) =>
    `<li><span class="root-path" title="${esc(r)}">${esc(r)}</span><button class="root-remove" data-root="${esc(r)}" title="Remove">${window.iconSvg('xmark')}</button></li>`
  ).join('');
}

function openSettings() {
  renderRoots();
  document.getElementById('settings-hint').textContent =
    'Projects are detected from these folders. Subfolders that look like a code project appear as cards.';
  document.getElementById('settings-overlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeSettings() {
  document.getElementById('settings-overlay').hidden = true;
  document.body.style.overflow = '';
}

async function addFolder() {
  const folders = await bridge.chooseFolder(true);
  if (!folders || !folders.length) return;
  let added = 0;
  for (const f of folders) {
    if (!state.roots.includes(f)) { state.roots.push(f); added++; }
  }
  if (!added) return;
  await persistSettings();
  await rescan();
  closeSettings();
  renderRoots();
  const n = state.projects.length;
  if (n) {
    toast(`Found ${n} project${n === 1 ? '' : 's'}`);
  } else {
    toast('No projects detected — check that the folders contain code', true);
  }
}

/* ---------- context menu ---------- */

function showContextMenu(x, y, path) {
  lastContextPos = { x, y };
  const menu = document.getElementById('context-menu');
  const p = findProject(path) || {};
  const fav = isFav({ path });
  const repo = isRepo(p) && p.remoteWeb;
  const items = [
    { icon: 'code', label: 'Open in editor', action: 'editor' },
    p.runScript
      ? { icon: 'play', label: `Run (${p.packageManager || 'npm'} run ${p.runScript})`, action: 'run' }
      : { icon: 'play', label: 'No run script', action: 'run', disabled: true },
    { icon: 'terminal', label: 'Open terminal', action: 'terminal' },
    { icon: 'external', label: 'Open folder', action: 'open' },
    { icon: 'copy', label: 'Copy path', action: 'copy' },
    repo ? { icon: 'gitBranch', label: 'Open repository', action: 'remote' } : null,
    null,
    { icon: fav ? 'starFill' : 'star', label: fav ? 'Remove from favorites' : 'Add to favorites', action: 'favorite' },
    { icon: 'link', label: liveUrlFor(p) ? 'Change live URL\u2026' : 'Set live URL\u2026', action: 'set-live' },
    { icon: 'gauge', label: 'Set difficulty\u2026', action: 'rate' },
    { icon: 'info', label: 'Details', action: 'details' },
    { icon: 'pencil', label: 'Edit description\u2026', action: 'edit-desc' },
    null,
    { icon: 'filePlus', label: 'New file\u2026', action: 'new-file' },
    { icon: 'folderPlus', label: 'New folder\u2026', action: 'new-folder' },
    null,
    { icon: 'pencil', label: 'Rename project\u2026', action: 'rename-name' },
    { icon: 'folderMove', label: 'Rename folder\u2026', action: 'rename' },
    { icon: 'folderMove', label: 'Move\u2026', action: 'move' },
    { icon: 'trash', label: 'Move to Recycle Bin', action: 'delete' }
  ];
  menu.innerHTML = items.map((it) => it
    ? `<div class="cm-item${it.disabled ? ' disabled' : ''}" data-action="${it.action}" data-path="${esc(path)}">${window.iconSvg(it.icon)}<span>${esc(it.label)}</span></div>`
    : '<div class="cm-sep"></div>'
  ).join('');
  menu.hidden = false;

  const rect = menu.getBoundingClientRect();
  let px = x;
  let py = y;
  if (px + rect.width > window.innerWidth) px = window.innerWidth - rect.width - 8;
  if (py + rect.height > window.innerHeight) py = window.innerHeight - rect.height - 8;
  menu.style.left = px + 'px';
  menu.style.top = py + 'px';
}

/* ---------- window controls & view ---------- */

function setView(v) {
  state.view = v;
  applyViewClass();
  persistSettings();
}

function applyViewClass() {
  document.getElementById('grid').classList.toggle('list', state.view === 'list');
  document.getElementById('view-grid').classList.toggle('active', state.view === 'grid');
  document.getElementById('view-list').classList.toggle('active', state.view === 'list');
}

// Sidebar collapse: the toggle lives on the sidebar itself, and the collapsed
// state is a narrow icon rail (items stay clickable).
function setSidebarOpen(open) {
  state.sidebarOpen = open;
  const app = document.getElementById('app');
  if (app) app.classList.toggle('collapsed', !open);
  const ic = document.querySelector('#btn-toggle-sidebar .sh-ic');
  if (ic) ic.innerHTML = window.iconSvg(open ? 'chevronLeft' : 'chevronRight');
  const btn = document.getElementById('btn-toggle-sidebar');
  if (btn) btn.title = open ? 'Collapse sidebar' : 'Expand sidebar';
}

// Replace the native <select> with a glass dropdown that matches the app.
function buildSortDropdown() {
  const select = document.getElementById('sort-select');
  const box = select.parentElement;
  const options = Array.from(select.options).map((o) => ({ value: o.value, label: o.textContent }));

  box.innerHTML = '';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'sort-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.innerHTML =
    `<span class="sort-ic">${window.iconSvg('sort')}</span>` +
    `<span class="sort-label"></span>` +
    `<span class="sort-chev">${window.iconSvg('chevronDown')}</span>`;

  const menu = document.createElement('div');
  menu.className = 'sort-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  menu.innerHTML = options
    .map((o) => `<div class="sort-opt" data-value="${esc(o.value)}">${esc(o.label)}</div>`)
    .join('');

  box.appendChild(trigger);
  box.appendChild(menu);

  const labelEl = trigger.querySelector('.sort-label');

  function sync() {
    const cur = options.find((o) => o.value === state.sort) || options[0];
    if (cur) labelEl.textContent = cur.label;
    menu.querySelectorAll('.sort-opt').forEach((el) => {
      el.classList.toggle('selected', el.dataset.value === state.sort);
    });
  }

  function close() {
    menu.hidden = true;
    trigger.classList.remove('open');
  }

  sync();

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    trigger.classList.toggle('open', willOpen);
  });

  menu.addEventListener('click', (e) => {
    const opt = e.target.closest('.sort-opt');
    if (!opt) return;
    state.sort = opt.dataset.value;
    sync();
    close();
    persistSettings();
    applyFilters();
  });

  document.addEventListener('click', close);
  window.addEventListener('blur', close);
  document.addEventListener('scroll', close, true);
}

/* ---------- event wiring ---------- */

let clickTimer = null;

function setupListeners() {
  // Window controls
  document.getElementById('tl-close').addEventListener('click', () => bridge.windowClose());
  document.getElementById('tl-min').addEventListener('click', () => bridge.windowMinimize());
  document.getElementById('tl-max').addEventListener('click', () => bridge.windowToggleMaximize());
  document.getElementById('titlebar').addEventListener('dblclick', (e) => {
    if (e.target.closest('.traffic-lights') || e.target.closest('.titlebar-actions')) return;
    bridge.windowToggleMaximize();
  });
  bridge.onWindowMaximizedChange((max) => {
    document.getElementById('titlebar').classList.toggle('maximized', max);
  });

  // Sidebar / toolbar
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  if (toggleBtn) toggleBtn.addEventListener('click', () => setSidebarOpen(!state.sidebarOpen));
  setSidebarOpen(state.sidebarOpen);
  const refreshBtn = document.getElementById('tb-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', () => rescan());

  // Auto-detect: the main process watches the projects folders and notifies us on changes.
  if (bridge.onProjectsChanged) bridge.onProjectsChanged(() => rescan());

  // Live run state (script, port, exit).
  if (bridge.onRunUpdate) {
    bridge.onRunUpdate((runs) => {
      state.runs = runs || {};
      applyFilters();
      const ov = document.getElementById('detail-overlay');
      if (state.current && ov && !ov.hidden) showDetail(state.current);
    });
  }

  // Frame the folder picker around a single "projects folder".
  const addBtn = document.getElementById('btn-add-folder');
  if (addBtn && addBtn.lastElementChild) addBtn.lastElementChild.textContent = 'Projects folder';
  const emptyAdd = document.getElementById('empty-add');
  if (emptyAdd) { emptyAdd.textContent = 'Choose projects folder'; emptyAdd.dataset.mode = 'add'; }
  const settingsAdd = document.getElementById('settings-add-folder');
  if (settingsAdd && settingsAdd.lastElementChild) settingsAdd.lastElementChild.textContent = 'Add projects folder';
  document.getElementById('btn-add-folder').addEventListener('click', addFolder);
  document.getElementById('empty-add').addEventListener('click', (e) => {
    const mode = e.currentTarget.dataset.mode || 'add';
    if (mode === 'clear-search') {
      state.query = '';
      document.getElementById('search-input').value = '';
      applyFilters();
    } else if (mode === 'clear-filters') {
      clearFilters();
    } else {
      addFolder();
    }
  });
  document.getElementById('btn-new-project').addEventListener('click', () => openPrompt('project', state.roots[0] || null));
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('settings-add-folder').addEventListener('click', addFolder);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('settings-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'settings-overlay') closeSettings();
  });

  document.getElementById('view-grid').addEventListener('click', () => setView('grid'));
  document.getElementById('view-list').addEventListener('click', () => setView('list'));
  buildSortDropdown();

  // Filter panel
  renderFilterMenu();
  const filterTrigger = document.getElementById('filter-trigger');
  const filterMenu = document.getElementById('filter-menu');
  filterTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = filterMenu.hidden;
    if (willOpen) renderFilterMenu();
    filterMenu.hidden = !willOpen;
    filterTrigger.classList.toggle('open', willOpen);
  });
  const closeFilterMenu = () => {
    filterMenu.hidden = true;
    filterTrigger.classList.remove('open');
  };
  filterMenu.addEventListener('click', (e) => {
    if (e.target.closest('#filter-clear')) {
      clearFilters();
      renderFilterMenu();
      return;
    }
    const chip = e.target.closest('.fchip');
    if (!chip) return;
    const f = state.filters;
    const group = chip.dataset.group;
    const value = chip.dataset.value;
    if (group === 'fav') f.fav = value === '1';
    else if (group === 'status') f.status = value;
    else if (group === 'git') f.git = value;
    else if (group === 'tag') {
      if (f.tags.has(value)) f.tags.delete(value);
      else f.tags.add(value);
    } else if (group === 'stack') {
      if (state.selectedStacks.has(value)) state.selectedStacks.delete(value);
      else state.selectedStacks.add(value);
    }
    renderFilterMenu();
    applyFilters();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-box')) closeFilterMenu();
  });
  window.addEventListener('blur', closeFilterMenu);

  // Difficulty popover (opened from a card chip or the context menu).
  document.addEventListener('click', (e) => {
    if (e.target.closest('#rate-menu')) return;
    if (e.target.closest('[data-action="rate"]')) return;
    if (e.target.closest('.cm-item[data-action="rate"]')) return;
    hideRateMenu();
  });
  window.addEventListener('blur', hideRateMenu);
  window.addEventListener('resize', hideRateMenu);
  document.addEventListener('scroll', hideRateMenu, true);

  // Changed-files popover (opened from the card or the details panel).
  document.addEventListener('click', (e) => {
    if (e.target.closest('#file-menu')) return;
    if (e.target.closest('[data-action="git-files"]')) return;
    hideGitFilesMenu();
  });
  window.addEventListener('blur', hideGitFilesMenu);
  window.addEventListener('resize', hideGitFilesMenu);
  document.addEventListener('scroll', hideGitFilesMenu, true);

  // Status + script popovers.
  document.addEventListener('click', (e) => {
    if (e.target.closest('#status-menu') || e.target.closest('#script-menu')) return;
    if (e.target.closest('[data-action="status-menu"]') || e.target.closest('[data-action="run-menu"]')) return;
    hideStatusMenu();
    hideScriptMenu();
  });
  window.addEventListener('blur', () => { hideStatusMenu(); hideScriptMenu(); });
  window.addEventListener('resize', () => { hideStatusMenu(); hideScriptMenu(); });
  document.addEventListener('scroll', () => { hideStatusMenu(); hideScriptMenu(); }, true);

  document.getElementById('nav-all').addEventListener('click', (e) => {
    e.preventDefault();
    state.query = '';
    document.getElementById('search-input').value = '';
    clearFilters();
  });

  document.getElementById('nav-fav').addEventListener('click', (e) => {
    e.preventDefault();
    state.filters.fav = true;
    renderFilterMenu();
    applyFilters();
  });

  // Move the search box up into the toolbar (left of the grid/list view toggle).
  const searchBox = document.querySelector('.sidebar-inner .search-box');
  const viewToggle = document.querySelector('.toolbar .view-toggle');
  if (searchBox && viewToggle && viewToggle.parentNode) {
    viewToggle.parentNode.insertBefore(searchBox, viewToggle);
  }

  let searchTimer = null;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const v = e.target.value;
    searchTimer = setTimeout(() => { state.query = v; applyFilters(); }, 120);
  });

  // Prompt modal
  document.getElementById('prompt-cancel').addEventListener('click', closePrompt);
  document.getElementById('prompt-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'prompt-overlay') closePrompt();
  });
  document.getElementById('prompt-ok').addEventListener('click', submitPrompt);
  document.getElementById('prompt-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPrompt();
  });
  document.getElementById('prompt-browse').addEventListener('click', async () => {
    const folders = await bridge.chooseFolder(false);
    if (folders && folders.length && state.prompt) {
      state.prompt.parentPath = folders[0];
      document.getElementById('prompt-location').textContent = folders[0];
    }
  });

  // Detail modal
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  document.getElementById('detail-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'detail-overlay') closeDetail();
  });
  document.getElementById('detail-copy').addEventListener('click', () => {
    if (state.current) copyPath(state.current.path);
  });

  // Settings root removal (delegated)
  document.getElementById('roots-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.root-remove');
    if (btn) {
      state.roots = state.roots.filter((r) => r !== btn.dataset.root);
      await persistSettings();
      renderRoots();
      await rescan();
    }
  });

  // Global click delegation
  document.addEventListener('click', (e) => {
    const cmItem = e.target.closest('.cm-item');
    if (cmItem) {
      if (!cmItem.classList.contains('disabled')) handleAction(cmItem.dataset.action, cmItem.dataset.path, cmItem);
      hideContextMenu();
      return;
    }
    hideContextMenu();

    const rateEl = e.target.closest('[data-rate]');
    if (rateEl) {
      e.stopPropagation();
      setRating(rateEl.dataset.path, Number(rateEl.dataset.rate));
      hideRateMenu();
      return;
    }

    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      if (actionEl.disabled) return;
      const inCard = !!actionEl.closest('.card');
      handleAction(actionEl.dataset.action, actionEl.dataset.path, actionEl);
      if (inCard) return;
      return;
    }

    const card = e.target.closest('.card');
    if (card) {
      const path = card.dataset.path;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        const p = findProject(path);
        if (p) showDetail(p);
      }, 260);
    }
  });

  document.addEventListener('dblclick', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    if (e.target.closest('[data-action]')) return; // buttons handle their own clicks
    clearTimeout(clickTimer);
    const p = findProject(card.dataset.path);
    if (!p) return;
    if (window.extras) window.extras.openEditor(p.path);
    else bridge.openInEditor(p.path);
  });

  document.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, card.dataset.path);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const filterMenu = document.getElementById('filter-menu');
    if (filterMenu && !filterMenu.hidden) {
      filterMenu.hidden = true;
      document.getElementById('filter-trigger').classList.remove('open');
    }
    else if (!document.getElementById('status-menu').hidden) hideStatusMenu();
    else if (!document.getElementById('script-menu').hidden) hideScriptMenu();
    else if (!document.getElementById('file-menu').hidden) hideGitFilesMenu();
    else if (!document.getElementById('rate-menu').hidden) hideRateMenu();
    else if (!document.getElementById('context-menu').hidden) hideContextMenu();
    else if (!document.getElementById('detail-overlay').hidden) closeDetail();
    else if (!document.getElementById('prompt-overlay').hidden) closePrompt();
    else if (!document.getElementById('settings-overlay').hidden) closeSettings();
  });

  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG') t.style.display = 'none';
  }, true);

  window.addEventListener('scroll', hideContextMenu, true);
  window.addEventListener('resize', hideContextMenu);
}

/* ---------- boot ---------- */

async function init() {
  injectIcons();

  let settings = {};
  try { settings = await bridge.getSettings(); } catch {}
  state.roots = Array.isArray(settings.roots) ? settings.roots : [];
  state.sort = settings.sort || 'name';
  state.view = settings.view || 'grid';
  state.ratings = settings.ratings || {};
  state.liveUrls = settings.liveUrls || {};
  state.favorites = settings.favorites || {};
  state.tags = settings.tags || {};
  state.notes = settings.notes || {};
  state.descriptions = settings.descriptions || {};
  state.names = settings.names || {};
  state.statuses = settings.statuses || {};
  state.editor = settings.editor || null;
  state.captureScreenshots = settings.captureScreenshots !== false;
  applyViewClass();

  try {
    const max = await bridge.windowIsMaximized();
    if (max) document.getElementById('titlebar').classList.add('maximized');
  } catch {}

  state.runs = {};
  try { state.runs = (await bridge.getRuns()) || {}; } catch { state.runs = {}; }

  setupListeners();
  await rescan();
}

// Load extended features (theme, editor, drag-drop, folder ops) once app.js is ready.
(() => {
  const s = document.createElement('script');
  s.src = 'extras.js';
  document.body.appendChild(s);
})();

init();
