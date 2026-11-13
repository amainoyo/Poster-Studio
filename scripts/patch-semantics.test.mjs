import { applyPatch } from '../index.js';

const base = {
  size: '1080x1350',
  layers: [
    { id: 'title', kind: 'text', text: 'A', size: 100, weight: 400, align: 'center', x: 0.5, y: 0.1, color: '#ffffff', lineHeight: 1.4, letterSpacing: 0, maxWidth: 0.8, outline: 0, shadow: 0, opacity: 1, italic: false, underline: false, locked: false },
    { id: 'footer', kind: 'text', text: 'B', size: 30, weight: 400, align: 'center', x: 0.5, y: 0.9, color: '#ffffff', lineHeight: 1.4, letterSpacing: 0, maxWidth: 0.8, outline: 0, shadow: 0, opacity: 1, italic: false, underline: false, locked: false },
    { id: 'img1', kind: 'image', src: 'data:image/png;base64,xx', width: 0.3, opacity: 1 },
  ],
  colors: { c1: '#111111', c2: '#222222', c3: '#333333', c4: '#444444', c5: '#555555' },
  shader: { scale: 1, offsetX: 0, offsetY: 0, grain: 0, bloom: 0, vignette: 0, lightCore: 0, lightHalo: 0, speed: 1, paused: false },
  background: { image: 'data:image/png;base64,yy', opacity: 0.8 },
};

let pass = 0;
const check = (name, ok) => { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name); if (ok) pass += 1; };

const r1 = applyPatch(base, { remove: ['footer', 'nope'] });
check('remove deletes by id and tolerates unknown ids', r1.layers.map((l) => l.id).join(',') === 'title,img1');

const r2 = applyPatch(base, { layers: [{ id: 'year', text: 2027, size: 300 }] });
const year = r2.layers.find((l) => l.id === 'year');
check('layers patch is incremental (keeps unlisted layers)', r2.layers.length === 4);
check('numeric layer text survives as string', year && year.text === '2027');
check('incremental patch updates matching layer in place', (() => {
  const r = applyPatch(base, { layers: [{ id: 'title', size: 120 }] });
  const t = r.layers.find((l) => l.id === 'title');
  return r.layers.length === 3 && t.size === 120 && t.text === 'A';
})());

const r3 = applyPatch(base, { layers: [{ id: 'only', kind: 'text', text: 'X' }], replace: true });
check('replace:true swaps the whole layer set', r3.layers.length === 1 && r3.layers[0].id === 'only');

const r4 = applyPatch(base, { background: { image: '' } });
check('empty backdrop image removes the backdrop', r4.background.image === '');

check('base is never mutated', base.layers.length === 3 && base.layers[0].size === 100);

console.log(pass === 7 ? 'ALL PASS' : 'FAILED ' + (7 - pass));
process.exit(pass === 7 ? 0 : 1);
