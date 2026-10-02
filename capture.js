'use strict';

// Offscreen screenshot capture for live-project thumbnails.
// Runs entirely in the main process using Electron's own renderer — no extra
// dependencies. Each capture happens in a sandboxed, node-less window.

const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function thumbPathFor(dir, url) {
  const hash = crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 16);
  return path.join(dir, hash + '.png');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureSite(url, file, opts) {
  opts = opts || {};
  const timeout = opts.timeout || 20000;
  const settle = opts.settle || 1600;
  const width = opts.width || 1280;
  const height = opts.height || 800;
  const outWidth = opts.outWidth || 640;

  return new Promise((resolve) => {
    let settled = false;
    let win = null;
    let timer = null;

    const done = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { if (win && !win.isDestroyed()) win.destroy(); } catch { /* ignore */ }
      resolve(result);
    };

    timer = setTimeout(() => done({ ok: false, error: 'Timed out' }), timeout);

    try {
      win = new BrowserWindow({
        show: false,
        width,
        height,
        webPreferences: {
          offscreen: true,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          javascript: true,
          images: true,
          partition: 'thumb-capture'
        }
      });
    } catch (err) {
      done({ ok: false, error: err.message });
      return;
    }

    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    win.webContents.on('did-fail-load', (e, code, desc, failedUrl, isMainFrame) => {
      if (isMainFrame === false) return;
      done({ ok: false, error: desc || ('HTTP ' + code) });
    });

    win.webContents.on('did-finish-load', async () => {
      try {
        await delay(settle);
        const img = await win.webContents.capturePage();
        if (!img || img.isEmpty()) {
          done({ ok: false, error: 'Empty capture' });
          return;
        }
        const size = img.getSize();
        const sized = outWidth && size.width > outWidth ? img.resize({ width: outWidth }) : img;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, sized.toPNG());
        done({ ok: true, file });
      } catch (err) {
        done({ ok: false, error: err.message });
      }
    });

    win.loadURL(url).catch((err) => done({ ok: false, error: err.message }));
  });
}

module.exports = { thumbPathFor, captureSite };
