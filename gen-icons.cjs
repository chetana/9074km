#!/usr/bin/env node
// Génère les icônes PWA depuis le SVG cœur
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const outDir = path.join(__dirname, 'static', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Icône standard — cœur centré sur fond sombre eau
const iconSvg = (size, bg = '#0B1A28') => {
  const padding = size * 0.15;
  const heartSize = size - padding * 2;
  const cx = size / 2;
  const cy = size / 2 - size * 0.02; // légèrement centré verticalement
  // Viewbox du cœur original : 32x32, centré autour de 16,16
  const scale = heartSize / 32;
  const tx = cx - 16 * scale;
  const ty = cy - 15.5 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${bg}"/>
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#58C4DC"/>
      <stop offset="100%" stop-color="#35A8C8"/>
    </linearGradient>
  </defs>
  <g transform="translate(${tx}, ${ty}) scale(${scale})">
    <path d="M16 27C16 27 3 18 3 11C3 7.1 6.1 4 10 4C12.2 4 14.2 5.1 16 7C17.8 5.1 19.8 4 22 4C25.9 4 29 7.1 29 11C29 18 16 27 16 27Z" fill="url(#g)"/>
  </g>
</svg>`;
};

// Icône maskable — cœur plus petit avec safe-zone (80% padding)
const maskableSvg = (size) => {
  const padding = size * 0.2;
  const heartSize = size - padding * 2;
  const cx = size / 2;
  const cy = size / 2 - size * 0.02;
  const scale = heartSize / 32;
  const tx = cx - 16 * scale;
  const ty = cy - 15.5 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#0B1A28"/>
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#58C4DC"/>
      <stop offset="100%" stop-color="#35A8C8"/>
    </linearGradient>
  </defs>
  <g transform="translate(${tx}, ${ty}) scale(${scale})">
    <path d="M16 27C16 27 3 18 3 11C3 7.1 6.1 4 10 4C12.2 4 14.2 5.1 16 7C17.8 5.1 19.8 4 22 4C25.9 4 29 7.1 29 11C29 18 16 27 16 27Z" fill="url(#g)"/>
  </g>
</svg>`;
};

async function generate() {
  const sizes = [192, 512];
  for (const size of sizes) {
    await sharp(Buffer.from(iconSvg(size))).png().toFile(path.join(outDir, `Icon-${size}.png`));
    console.log(`Icon-${size}.png`);
    await sharp(Buffer.from(maskableSvg(size))).png().toFile(path.join(outDir, `Icon-maskable-${size}.png`));
    console.log(`Icon-maskable-${size}.png`);
  }
  // Apple touch icon (180x180)
  await sharp(Buffer.from(iconSvg(180))).png().toFile(path.join(__dirname, 'static', 'apple-touch-icon.png'));
  console.log('apple-touch-icon.png');
  console.log('Done!');
}
generate().catch(console.error);
