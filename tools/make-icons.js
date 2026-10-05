'use strict';
// Generates app icons in assets/ from a source image.
// Usage: npx electron tools/make-icons.js [source-image]
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
  const src = path.resolve(__dirname, '..', process.argv[2] || 'projects dashboard.jpg');
  let img = nativeImage.createFromPath(src);
  if (img.isEmpty()) {
    console.error('Could not load image:', src);
    app.exit(1);
    return;
  }

  const { width, height } = img.getSize();
  const side = Math.min(width, height);
  if (width !== height) {
    img = img.crop({
      x: Math.round((width - side) / 2),
      y: Math.round((height - side) / 2),
      width: side,
      height: side,
    });
  }

  const outDir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(outDir, { recursive: true });
  const sizes = [16, 32, 48, 64, 128, 256, 512];
  for (const size of sizes) {
    const out = img.resize({ width: size, height: size, quality: 'best' });
    fs.writeFileSync(path.join(outDir, `icon-${size}.png`), out.toPNG());
  }
  console.log(
    `icon source: ${src} (${width}x${height}) -> assets/icon-{${sizes.join(',')}}.png`,
  );
  app.exit(0);
});
