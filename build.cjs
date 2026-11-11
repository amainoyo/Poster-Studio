'use strict';
// Build the Poster Studio client artifact: inline the official web fonts
// into the client module so the poster renders offline and inside the
// Harness Web UI without touching the Host application's font families.
// Run: node build.cjs   (from anywhere; paths are relative to this file)
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ASSETS = path.join(ROOT, 'assets');
const TEMPLATE = path.join(ROOT, 'src', 'client.template.js');
const OUTPUT = path.join(ROOT, 'client.js');

const FACES = [
  { file: 'dm-sans-400.woff2', family: 'PosterSans', weight: 400 },
  { file: 'dm-sans-500.woff2', family: 'PosterSans', weight: 500 },
  { file: 'dm-sans-700.woff2', family: 'PosterSans', weight: 700 },
  { file: 'montserrat-500.woff2', family: 'PosterGrotesk', weight: 500 },
];

const rules = FACES.map((face) => {
  const bytes = fs.readFileSync(path.join(ASSETS, face.file));
  const data = bytes.toString('base64');
  return `@font-face{font-family:"${face.family}";font-style:normal;font-weight:${face.weight};`
    + `font-display:swap;src:url(data:font/woff2;base64,${data}) format("woff2")}`;
});

const css = rules.join('\n');
if (css.includes('`') || css.includes('${')) throw new Error('font CSS would break the template literal');

const template = fs.readFileSync(TEMPLATE, 'utf8');
if (!template.includes('__FONT_FACE_CSS__')) throw new Error('template placeholder missing');
const output = template.replace('__FONT_FACE_CSS__', '`' + css + '`');
fs.writeFileSync(OUTPUT, output, 'utf8');

console.log('wrote', OUTPUT, (output.length / 1024).toFixed(1), 'KiB');
