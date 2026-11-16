/* Host-side smoke test for the poster-studio HTTP routes. */
import http from 'node:http';
import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'poster-smoke-'));
process.env.DSH_PROFILE_DIR = root;

const { apply } = await import('../index.js');

const registrations = [];
const noop = { register() {} };
const fakeCtx = {
  tools: noop,
  commands: noop,
  get(key) {
    if (key === 'connection') return { requestRejection: () => undefined };
    if (key === 'webServer') {      return {
        register(item) {
          registrations.push(item);
          return () => {};
        },
      };
    }
    if (key === 'tools') return { register() {} };
    if (key === 'commands') return { register() {} };
    return undefined;
  },
  effect(fn) {
    fn();
  },
  inject(deps, cb) {
    // The routes mount through ctx.inject(['connection','webServer'], child => …).
    const child = {
      get: (key) => fakeCtx.get(key),
      effect: (fn) => fakeCtx.effect(fn),
      tools: noop,
      commands: noop,
    };
    for (const dep of deps) child[dep] = fakeCtx.get(dep);
    cb(child);
    return { dispose() {} };
  },
};

apply(fakeCtx, {});

// Give the effect a tick to run if the host defers it.
await new Promise((resolve) => setTimeout(resolve, 50));

const routes = new Map();
for (const item of registrations) routes.set(item.path, item.handler);

const server = http.createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const handler = routes.get(path);
  if (!handler) {
    res.statusCode = 404;
    res.end();
    return;
  }
  void handler(req, res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
};

const get = async (path) => {
  const response = await fetch(base + path);
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
};
const post = async (path, payload) => {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const del = async (path) => {
  const response = await fetch(base + path, { method: 'DELETE' });
  return { status: response.status, body: await response.json().catch(() => null) };
};

// 1. spec round trip
{
  const first = await get('/poster-studio/spec');
  check('GET /spec', first.status === 200 && typeof first.body === 'object', String(first.status));
  const saved = await post('/poster-studio/spec', { ...first.body, title: '烟雾测试', background: { image: 'data:image/jpeg;base64,AAAA', opacity: 0.4 } });
  const ok = saved.status === 200 && saved.body.background && saved.body.background.opacity === 0.4;
  check('POST /spec background persists', ok, JSON.stringify(saved.body && saved.body.background));
}

// 2. version save / list / load / delete
{
  const saved = await post('/poster-studio/versions', { name: '测试版本', thumb: 'QUJDRA==', spec: { size: '1080x1920' } });
  const listOk = saved.status === 200 && Array.isArray(saved.body.versions) && saved.body.versions.length === 1 && saved.body.versions[0].thumb === 'QUJDRA==';
  check('POST /versions', listOk, String(saved.status));
  const id = saved.body.versions[0].id;
  const loaded = await get(`/poster-studio/version?id=${id}`);
  check('GET /version', loaded.status === 200 && loaded.body.spec.size === '1080x1920', JSON.stringify(loaded.body).slice(0, 80));
  const listed = await get('/poster-studio/versions');
  check('GET /versions', listed.status === 200 && listed.body.versions.length === 1, String(listed.status));
  const gone = await del(`/poster-studio/version?id=${id}`);
  const after = await get('/poster-studio/versions');
  check('DELETE /version', gone.status === 200 && after.body.versions.length === 0, String(after.body.versions.length));
}

// 3. palette save / list / delete
{
  const saved = await post('/poster-studio/palettes', { name: '测试盘', colors: { c1: '#010101', c2: '#020202', c3: '#030303', c4: '#040404', c5: '#050505' } });
  check('POST /palettes', saved.status === 200 && saved.body.palettes.length === 1, String(saved.status));
  const listed = await get('/poster-studio/palettes');
  const first = listed.body.palettes[0];
  check('GET /palettes', listed.status === 200 && first.name === '测试盘' && first.colors.c3 === '#030303', JSON.stringify(first && first.colors));
  const gone = await del('/poster-studio/palettes?name=测试盘');
  check('DELETE /palettes', gone.status === 200 && gone.body.palettes.length === 0, JSON.stringify(gone.body));
}

// 4. export round trip: png -> spec snapshot -> light list -> fetch snapshot
{
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const sent = await fetch(base + '/poster-studio/export', { method: 'POST', headers: { 'content-type': 'image/png' }, body: png });
  const sentBody = await sent.json().catch(() => null);
  check('POST /export stores png', sent.status === 200 && typeof (sentBody && sentBody.name) === 'string', String(sent.status));
  const listed = await get('/poster-studio/exports');
  const entry = Array.isArray(listed.body) ? listed.body[0] : null;
  check('GET /exports lists hasSpec without spec payload', listed.status === 200 && Boolean(entry) && entry.hasSpec === true && entry.spec === undefined, JSON.stringify(entry && Object.keys(entry)));
  const thumb = await fetch(base + `/poster-studio/exports?file=${encodeURIComponent(entry.name)}`);
  check('GET /exports?file returns image', thumb.status === 200 && thumb.headers.get('content-type') === 'image/png', String(thumb.status));
  const specRes = await get(`/poster-studio/exports?file=${encodeURIComponent(entry.name)}&spec=1`);
  check('GET /exports?file&spec=1 returns snapshot', specRes.status === 200 && Boolean(specRes.body.spec) && typeof specRes.body.spec.size === 'string', String(specRes.body && specRes.body.spec && specRes.body.spec.size));
  const cleared = await del('/poster-studio/exports');
  check('DELETE /exports', cleared.status === 200, String(cleared.status));
}

// 5. rolling cap deletes the spilled files (png + snapshot)
{
  for (let i = 0; i < 21; i += 1) {
    await fetch(base + '/poster-studio/export', { method: 'POST', headers: { 'content-type': 'image/png' }, body: Buffer.from('89504e470d0a1a0a', 'hex') });
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  const listed = await get('/poster-studio/exports');
  const files = readdirSync(join(root, 'exports'));
  const pngs = files.filter((f) => f.endsWith('.png')).length;
  check(
    'exports rolling cap keeps 20 and deletes spilled files',
    listed.body.length === 20 && pngs === 20 && files.length === 40,
    `entries=${listed.body.length} pngs=${pngs} files=${files.length}`,
  );
}

// 6. bad payloads rejected
{
  const bad = await fetch(base + '/poster-studio/versions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  check('POST /versions invalid json -> 400', bad.status === 400, String(bad.status));
}

// 7. preview round trip: tick visible, panel POST accepted
{
  const tick = await get('/poster-studio/preview-tick');
  check('GET /preview-tick', tick.status === 200 && typeof tick.body.tick === 'number', JSON.stringify(tick.body));
  const sent = await fetch(base + '/poster-studio/preview?tick=1', { method: 'POST', headers: { 'content-type': 'image/png' }, body: Buffer.from('89504e470d0a1a0a', 'hex') });
  const sentBody = await sent.json().catch(() => null);
  check('POST /preview stores png', sent.status === 200 && sentBody && sentBody.ok === true, String(sent.status));
  const saved = existsSync(join(root, 'preview.png'));
  check('preview.png written', saved);
}

server.close();
rmSync(root, { recursive: true, force: true });

let failed = 0;
for (const item of results) {
  if (!item.ok) failed += 1;
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}  ${item.detail}`);
}
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
