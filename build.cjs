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
  { file: 'dm-sans-var.woff2', family: 'PosterSans', style: 'normal', weight: '100 900' },
  { file: 'dm-sans-var-italic.woff2', family: 'PosterSans', style: 'italic', weight: '100 900' },
  { file: 'montserrat-500.woff2', family: 'PosterGrotesk', style: 'normal', weight: '500' },
];

const rules = FACES.map((face) => {
  const bytes = fs.readFileSync(path.join(ASSETS, face.file));
  const data = bytes.toString('base64');
  return `@font-face{font-family:"${face.family}";font-style:${face.style};font-weight:${face.weight};`
    + `font-display:swap;src:url(data:font/woff2;base64,${data}) format("woff2")}`;
});

const css = rules.join('\n');
if (css.includes('`') || css.includes('${')) throw new Error('font CSS would break the template literal');

// qrcode-generator (MIT): UMD wrapped into one expression with the UTF-8
// string encoding enabled, matching the qrcode_UTF8.js extension.
const qrcodeSource = fs.readFileSync(path.join(ASSETS, 'qrcode.min.js'), 'utf8');
const qrcodeExpr = '(function(){' + qrcodeSource
  + ';(function(P){if(P.stringToBytesFuncs&&P.stringToBytesFuncs[\'UTF-8\']){P.stringToBytes=P.stringToBytesFuncs[\'UTF-8\'];}}(qrcode));'
  + 'return qrcode;})()';

const template = fs.readFileSync(TEMPLATE, 'utf8');
if (!template.includes('__FONT_FACE_CSS__')) throw new Error('template placeholder missing');
if (!template.includes('__QRCODE_LIB__')) throw new Error('qrcode placeholder missing');

// Vendored React pair (UMD builds): the plugin mounts its own trees to stay
// immune to host/module React copy drift (React #321).
const reactUmd = fs.readFileSync(path.join(ROOT, 'node_modules', 'react', 'umd', 'react.production.min.js'), 'utf8');
const reactDomUmd = fs.readFileSync(path.join(ROOT, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js'), 'utf8');

const output = template
  .replace('__FONT_FACE_CSS__', '`' + css + '`')
  .replace('__QRCODE_LIB__', () => qrcodeExpr)
  .replace('__REACT_UMD__', () => reactUmd)
  .replace('__REACT_DOM_UMD__', () => reactDomUmd);
fs.writeFileSync(OUTPUT, output, 'utf8');

console.log('wrote', OUTPUT, (output.length / 1024).toFixed(1), 'KiB');
