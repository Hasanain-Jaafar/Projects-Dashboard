'use strict';
/*
 * Extended features — loaded after app.js (injected by app.js).
 * Reuses app.js globals: state, toast, rescan.
 * Adds: theme (light/dark/system) + accent picker, editor action,
 * drag-and-drop folders, config export/import, folder rename/move/recycle.
 */
(function () {
  const b = window.api;

  const ACCENTS = {
    blue: { c: '#3b9eff', soft: 'rgba(59,158,255,.16)' },
    violet: { c: '#8b5cf6', soft: 'rgba(139,92,246,.18)' },
    green: { c: '#22c55e', soft: 'rgba(34,197,94,.18)' },
    orange: { c: '#ff8a3d', soft: 'rgba(255,138,61,.18)' },
    pink: { c: '#ec4899', soft: 'rgba(236,72,153,.18)' }
  };

  const settings = {
    theme: 'system',
    accent: 'blue',
    editor: null,
    editorCommand: '',
    closeToTray: true,
    gitEnabled: true,
    captureScreenshots: true,
    density: 'comfortable'
  };

  function applyDensity(name) {
    const grid = document.getElementById('grid');
    if (grid) grid.classList.toggle('compact', name === 'compact');
  }

  function applyTheme(theme) {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = theme === 'dark' || (theme === 'system' && sysDark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    paintThemeButton();
  }

  function paintThemeButton() {
    const btn = document.getElementById('tb-theme');
    if (btn) btn.innerHTML = window.iconSvg(document.documentElement.dataset.theme === 'dark' ? 'moon' : 'sun');
  }

  function buildTitlebarButtons() {
    const actions = document.querySelector('.titlebar-actions');
    if (!actions || actions.dataset.ext) return;
    actions.dataset.ext = '1';

    const themeBtn = document.createElement('button');
    themeBtn.className = 'tb-btn';
    themeBtn.id = 'tb-theme';
    themeBtn.title = 'Toggle light / dark';
    themeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(settings.theme);
      sync();
      persist();
    });
    actions.appendChild(themeBtn);

    const gearBtn = document.createElement('button');
    gearBtn.className = 'tb-btn';
    gearBtn.id = 'tb-settings';
    gearBtn.title = 'Settings';
    gearBtn.innerHTML = window.iconSvg('gear');
    gearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.openSettings) window.openSettings();
    });
    actions.appendChild(gearBtn);

    paintThemeButton();
  }

  function applyAccent(name) {
    const a = ACCENTS[name] || ACCENTS.blue;
    document.documentElement.style.setProperty('--accent', a.c);
    document.documentElement.style.setProperty('--accent-soft', a.soft);
  }

  async function persist() {
    try {
      const cur = await b.getSettings();
      await b.saveSettings(Object.assign({}, cur, {
        theme: settings.theme,
        accent: settings.accent,
        editor: settings.editor,
        editorCommand: settings.editorCommand,
        closeToTray: settings.closeToTray,
        gitEnabled: settings.gitEnabled,
        captureScreenshots: settings.captureScreenshots,
        density: settings.density
      }));
    } catch {}
  }

  // ---------- confirm modal ----------
  let confirmEl = null;
  let confirmResolve = null;

  function ensureConfirm() {
    if (confirmEl) return confirmEl;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.hidden = true;
    ov.innerHTML =
      '<div class="modal confirm" role="alertdialog" aria-modal="true">' +
        '<h3 id="ext-confirm-title"></h3>' +
        '<p class="confirm-message" id="ext-confirm-msg"></p>' +
        '<div class="prompt-actions">' +
          '<button class="ghost-btn" id="ext-confirm-cancel">Cancel</button>' +
          '<button class="primary-btn danger" id="ext-confirm-ok">OK</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    const done = (v) => {
      ov.hidden = true;
      if (confirmResolve) { const r = confirmResolve; confirmResolve = null; r(v); }
    };
    ov.querySelector('#ext-confirm-cancel').addEventListener('click', () => done(false));
    ov.querySelector('#ext-confirm-ok').addEventListener('click', () => done(true));
    ov.addEventListener('click', (e) => { if (e.target === ov) done(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.hidden) done(false); });
    confirmEl = ov;
    return ov;
  }

  function confirmAction(opts) {
    const ov = ensureConfirm();
    ov.querySelector('#ext-confirm-title').textContent = opts.title || 'Are you sure?';
    ov.querySelector('#ext-confirm-msg').textContent = opts.message || '';
    ov.querySelector('#ext-confirm-ok').textContent = opts.confirmLabel || 'OK';
    ov.hidden = false;
    return new Promise((res) => { confirmResolve = res; });
  }

  // ---------- text prompt modal (window.prompt is not supported in Electron) ----------
  let promptEl = null;
  let promptResolve = null;

  function ensurePrompt() {
    if (promptEl) return promptEl;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.hidden = true;
    ov.innerHTML =
      '<div class="modal prompt" role="dialog" aria-modal="true">' +
        '<h3 id="ext-prompt-title"></h3>' +
        '<input class="prompt-input" id="ext-prompt-input" type="text" spellcheck="false" autocomplete="off" />' +
        '<div class="prompt-actions">' +
          '<button class="ghost-btn" id="ext-prompt-cancel">Cancel</button>' +
          '<button class="primary-btn" id="ext-prompt-ok">OK</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    const input = ov.querySelector('#ext-prompt-input');
    const done = (v) => {
      ov.hidden = true;
      const r = promptResolve;
      promptResolve = null;
      if (r) r(v);
    };
    ov.querySelector('#ext-prompt-cancel').addEventListener('click', () => done(null));
    ov.querySelector('#ext-prompt-ok').addEventListener('click', () => done(input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(input.value.trim()); }
    });
    ov.addEventListener('click', (e) => { if (e.target === ov) done(null); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.hidden) done(null); });
    promptEl = ov;
    return ov;
  }

  function promptInput(opts) {
    const ov = ensurePrompt();
    ov.querySelector('#ext-prompt-title').textContent = opts.title || '';
    const input = ov.querySelector('#ext-prompt-input');
    input.value = opts.value || '';
    input.placeholder = opts.placeholder || '';
    ov.querySelector('#ext-prompt-ok').textContent = opts.confirmLabel || 'OK';
    ov.hidden = false;
    setTimeout(() => { input.focus(); input.select(); }, 40);
    return new Promise((res) => { promptResolve = res; });
  }

  // ---------- folder operations ----------
  function baseName(p) { return String(p).split(/[\\/]/).pop(); }

  async function rename(targetPath) {
    const base = baseName(targetPath);
    const name = await promptInput({ title: 'Rename folder', value: base, confirmLabel: 'Rename' });
    if (name === null || !name || name === base) return;
    const r = await b.renamePath(targetPath, name);
    if (r && r.ok) { toast('Renamed'); await rescan(); }
    else toast((r && r.error) || 'Rename failed', true);
  }

  async function move(targetPath) {
    const r = await b.movePath(targetPath);
    if (r && r.ok) { toast('Moved'); await rescan(); }
    else if (r && !r.canceled) toast((r && r.error) || 'Move failed', true);
  }

  async function remove(targetPath) {
    const ok = await confirmAction({
      title: 'Move to Recycle Bin?',
      confirmLabel: 'Move to Bin',
      message: '"' + baseName(targetPath) + '" and everything inside it will be moved to the Recycle Bin.'
    });
    if (!ok) return;
    const r = await b.trashPath(targetPath);
    if (r && r.ok) { toast('Moved to Recycle Bin'); await rescan(); }
    else toast((r && r.error) || 'Delete failed', true);
  }

  async function openEditor(targetPath) {
    const r = await b.openInEditor(targetPath, settings.editor, settings.editorCommand);
    if (r && !r.ok) toast(r.error || 'No editor found', true);
  }

  // ---------- settings UI ----------
  function section(label, inner) {
    const d = document.createElement('div');
    d.className = 'settings-section';
    d.innerHTML = '<div class="settings-label">' + label + '</div>' + inner;
    return d;
  }

  function mountSettings() {
    const root = document.querySelector('#settings-overlay .modal.settings');
    if (!root || root.dataset.ext) return;
    root.dataset.ext = '1';

    const folders = root.querySelector('.settings-section');
    const hint = root.querySelector('#settings-hint');

    const body = document.createElement('div');
    body.className = 'settings-body';

    body.appendChild(section('Appearance',
      '<div class="segmented" id="ext-theme">' +
        '<button class="seg-btn" data-theme="system">System</button>' +
        '<button class="seg-btn" data-theme="light">Light</button>' +
        '<button class="seg-btn" data-theme="dark">Dark</button>' +
      '</div>' +
      '<div class="accent-row" id="ext-accent"></div>'));

    body.appendChild(section('Editor',
      '<select class="settings-select" id="ext-editor"></select>' +
      '<input class="prompt-input settings-input" id="ext-editor-cmd" type="text" placeholder="Custom command (optional)" spellcheck="false" />'));

    body.appendChild(section('Project detection',
      '<label class="toggle-row"><span>Detect Git status</span>' +
      '<input type="checkbox" id="ext-git" class="switch" /></label>' +
      '<label class="toggle-row"><span>Capture live screenshots</span>' +
      '<input type="checkbox" id="ext-thumbs" class="switch" /></label>' +
      '<p class="settings-hint">Screenshots are taken from each project\u2019s live URL and cached for a week.</p>' +
      '<div class="settings-label" style="margin-top:14px">Card density</div>' +
      '<div class="segmented" id="ext-density">' +
        '<button class="seg-btn" data-density="comfortable">Comfortable</button>' +
        '<button class="seg-btn" data-density="compact">Compact</button>' +
      '</div>' +
      '<div class="settings-actions" style="margin-top:14px">' +
        '<button class="ghost-btn" id="ext-refresh">Refresh metadata</button>' +
        '<button class="ghost-btn" id="ext-clear-thumbs">Clear screenshots</button>' +
      '</div>'));

    if (folders) body.appendChild(folders);
    if (hint) body.appendChild(hint);

    body.appendChild(section('Behaviour',
      '<label class="toggle-row"><span>Close to tray</span>' +
      '<input type="checkbox" id="ext-tray" class="switch" /></label>' +
      '<p class="settings-hint">Global hotkey: Ctrl+Shift+D shows / hides the window.</p>'));

    body.appendChild(section('Configuration',
      '<div class="settings-actions">' +
        '<button class="ghost-btn" id="ext-export">Export…</button>' +
        '<button class="ghost-btn" id="ext-import">Import…</button>' +
      '</div>'));

    root.appendChild(body);

    const row = body.querySelector('#ext-accent');
    row.innerHTML = Object.keys(ACCENTS).map((k) =>
      '<button class="accent-dot" data-accent="' + k + '" style="background:' + ACCENTS[k].c + '" title="' + k + '"></button>'
    ).join('');

    body.querySelector('#ext-theme').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      settings.theme = btn.dataset.theme;
      applyTheme(settings.theme);
      sync();
      persist();
    });

    row.addEventListener('click', (e) => {
      const dot = e.target.closest('.accent-dot');
      if (!dot) return;
      settings.accent = dot.dataset.accent;
      applyAccent(settings.accent);
      sync();
      persist();
    });

    body.querySelector('#ext-editor').addEventListener('change', (e) => { settings.editor = e.target.value || null; persist(); });
    body.querySelector('#ext-editor-cmd').addEventListener('change', (e) => { settings.editorCommand = e.target.value.trim(); persist(); });
    body.querySelector('#ext-tray').addEventListener('change', (e) => { settings.closeToTray = e.target.checked; persist(); });

    body.querySelector('#ext-git').addEventListener('change', (e) => {
      settings.gitEnabled = e.target.checked;
      persist();
      if (window.rescan) window.rescan();
    });

    body.querySelector('#ext-density').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      settings.density = btn.dataset.density;
      applyDensity(settings.density);
      sync();
      persist();
    });

    body.querySelector('#ext-refresh').addEventListener('click', async () => {
      if (window.rescan) await window.rescan();
      toast('Project metadata refreshed');
    });

    body.querySelector('#ext-thumbs').addEventListener('change', (e) => {
      settings.captureScreenshots = e.target.checked;
      persist();
      if (e.target.checked && window.captureMissingThumbs) window.captureMissingThumbs();
    });

    body.querySelector('#ext-clear-thumbs').addEventListener('click', async () => {
      const r = await b.clearThumbs();
      if (r && r.ok) toast('Screenshot cache cleared');
      else toast('Could not clear cache', true);
    });

    body.querySelector('#ext-export').addEventListener('click', async () => {
      const r = await b.exportSettings();
      if (r && r.ok) toast('Configuration exported');
      else if (r && !r.canceled) toast('Export failed', true);
    });
    body.querySelector('#ext-import').addEventListener('click', async () => {
      const r = await b.importSettings();
      if (r && r.ok) { toast('Configuration imported'); await rescan(); }
      else if (r && !r.canceled) toast('Import failed', true);
    });

    b.detectEditors().then((editors) => {
      const sel = body.querySelector('#ext-editor');
      sel.innerHTML = '<option value="">Auto (first available)</option>' +
        editors.map((ed) => '<option value="' + ed.id + '">' + ed.name + '</option>').join('');
      sel.value = settings.editor || '';
    }).catch(() => {});

    sync();
  }

  function sync() {
    const wrap = document.getElementById('ext-theme');
    if (wrap) {
      wrap.querySelectorAll('.seg-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.theme === settings.theme);
      });
    }
    const row = document.getElementById('ext-accent');
    if (row) {
      row.querySelectorAll('.accent-dot').forEach((d) => {
        d.classList.toggle('active', d.dataset.accent === settings.accent);
      });
    }
    const tray = document.getElementById('ext-tray');
    if (tray) tray.checked = !!settings.closeToTray;
    const git = document.getElementById('ext-git');
    if (git) git.checked = settings.gitEnabled !== false;
    const thumbs = document.getElementById('ext-thumbs');
    if (thumbs) thumbs.checked = settings.captureScreenshots !== false;
    const density = document.getElementById('ext-density');
    if (density) {
      density.querySelectorAll('.seg-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.density === settings.density);
      });
    }
  }

  // ---------- drag & drop ----------
  function wireDrop() {
    let depth = 0;
    const ov = document.createElement('div');
    ov.className = 'drop-overlay';
    ov.hidden = true;
    ov.innerHTML = '<div class="drop-card">Drop folders to add</div>';
    document.body.appendChild(ov);
    const show = (v) => { ov.hidden = !v; };

    window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; show(true); });
    window.addEventListener('dragover', (e) => { e.preventDefault(); });
    window.addEventListener('dragleave', (e) => { e.preventDefault(); depth = Math.max(0, depth - 1); if (!depth) show(false); });
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      depth = 0;
      show(false);
      const files = Array.from(e.dataTransfer.files || []);
      const paths = [];
      for (const f of files) {
        try { const p = b.getPathForFile(f); if (p) paths.push(p); } catch {}
      }
      if (!paths.length) return;
      let added = 0;
      for (const p of paths) if (!state.roots.includes(p)) { state.roots.push(p); added++; }
      if (!added) return;
      const cur = await b.getSettings();
      await b.saveSettings(Object.assign({}, cur, { roots: state.roots }));
      await rescan();
      toast('Added ' + added + ' folder' + (added > 1 ? 's' : ''));
    });
  }

  // ---------- boot ----------
  async function init() {
    let s = {};
    try { s = await b.getSettings(); } catch {}
    settings.theme = s.theme || 'system';
    settings.accent = s.accent || 'blue';
    settings.editor = s.editor || null;
    settings.editorCommand = s.editorCommand || '';
    settings.closeToTray = s.closeToTray !== false;
    settings.gitEnabled = s.gitEnabled !== false;
    settings.captureScreenshots = s.captureScreenshots !== false;
    settings.density = s.density || 'comfortable';

    applyTheme(settings.theme);
    applyAccent(settings.accent);
    applyDensity(settings.density);

    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => { if (settings.theme === 'system') applyTheme('system'); });
    if (b.onSystemThemeChange) b.onSystemThemeChange(() => { if (settings.theme === 'system') applyTheme('system'); });

    mountSettings();
    buildTitlebarButtons();
    wireDrop();

    window.extras = { rename, move, remove, openEditor, confirmAction, promptInput };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
