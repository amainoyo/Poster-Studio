/**
 * Host half of the Poster Studio bundle.
 *
 * The Host owns one poster specification. The agent tool, the Client
 * workbench, and the export route all operate on that single document, so a
 * change made in either place is the same change.
 */

import { mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Canvas presets the studio can render. */
export const SIZES = {
  '1080x1350': { width: 1080, height: 1350, label: '3:4 竖版' },
  '1080x1920': { width: 1080, height: 1920, label: '9:16 竖屏' },
  '1920x1080': { width: 1920, height: 1080, label: '16:9 横版' },
  '1080x1080': { width: 1080, height: 1080, label: '1:1 方图' },
  '1200x628': { width: 1200, height: 628, label: 'Banner' },
};

/** Custom canvas size spelling, e.g. 1200x800. */
const CUSTOM_SIZE_RE = /^(\d{3,4})x(\d{3,4})$/;

/**
 * Validate a canvas size: preset key, or a custom WxH clamped to 200..4000.
 * @param {unknown} value - the candidate size.
 * @param {string} fallbackValue - returned when the candidate is invalid.
 * @returns {string} a size key like '1080x1350' or '1200x800'.
 */
function normalizeSizeKey(value, fallbackValue) {
  if (typeof value === 'string' && SIZES[value]) return value;
  const match = CUSTOM_SIZE_RE.exec(typeof value === 'string' ? value : '');
  if (match) {
    const width = Math.min(4000, Math.max(200, Number(match[1])));
    const height = Math.min(4000, Math.max(200, Number(match[2])));
    return `${width}x${height}`;
  }
  return fallbackValue;
}

/** Shader colour slots, in the order the shader mixes them. */
const COLOR_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5'];

/** Accepted colour spelling for every slot. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Version of the persisted specification document. */
const SPEC_VERSION = 1;

/** Largest request body the export route accepts. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** Default headline of the studio. */
const DEFAULT_TITLE = '一切皆插件';

/** Default colours, taken from the official DeepSeek Harness page. */
const DEFAULT_COLORS = {
  c1: '#000000',
  c2: '#000000',
  c3: '#204a7e',
  c4: '#cec8bb',
  c5: '#000000',
};

/** Default shader tuning, matching the official page. */
const DEFAULT_SHADER = {
  scale: 1.19,
  offsetX: -1.24,
  offsetY: -0.48,
  grain: 0.005,
  bloom: 0.4,
  vignette: 0.38,
  lightCore: 0.14,
  lightHalo: 0.2,
  speed: 1,
  paused: false,
};

/** Services this plugin needs. */
export const inject = ['tools', 'commands'];

/**
 * Build the default specification.
 * @param {Record<string, unknown>} config - plugin configuration.
 * @returns {Record<string, unknown>} the default specification.
 */
function defaultSpec(config = {}) {
  const size = normalizeSizeKey(config.size, '1080x1350');
  const colors = { ...DEFAULT_COLORS };
  if (config.colors && typeof config.colors === 'object') {
    for (const key of COLOR_KEYS) {
      const value = config.colors[key];
      if (typeof value === 'string' && HEX_COLOR.test(value)) colors[key] = value.toLowerCase();
    }
  }
  return {
    version: SPEC_VERSION,
    size,
    layers: [
      {
        id: 'title',
        text: typeof config.title === 'string' ? config.title : DEFAULT_TITLE,
        size: 96,
        weight: 500,
        align: 'center',
        x: 0.5,
        y: 0.42,
        color: '#ffffff',
        lineHeight: 1.16,
        letterSpacing: 0,
        maxWidth: 0.8,
      },
      {
        id: 'subtitle',
        text: typeof config.text === 'string' ? config.text : '',
        size: 34,
        weight: 400,
        align: 'center',
        x: 0.5,
        y: 0.56,
        color: '#ffffffc2',
        lineHeight: 1.6,
        letterSpacing: 0,
        maxWidth: 0.7,
      },
      {
        id: 'footer',
        text: typeof config.footer === 'string' ? config.footer : '',
        size: 24,
        weight: 400,
        align: 'center',
        x: 0.5,
        y: 0.92,
        color: '#ffffff8c',
        lineHeight: 1.4,
        letterSpacing: 0,
        maxWidth: 0.8,
      },
    ],
    colors,
    shader: { ...DEFAULT_SHADER },
  };
}

/**
 * Clamp one number into a range.
 * @param {unknown} value - candidate number.
 * @param {number} min - lower bound.
 * @param {number} max - upper bound.
 * @param {number} fallback - value used when the candidate is unusable.
 * @returns {number} the clamped number.
 */
function clamp(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * Layer font ids accepted by the studio (client maps them to web fonts).
 */
const FONT_KEYS = ['', 'noto-sans-sc', 'noto-serif-sc', 'zcool-xiaowei', 'zcool-huangyou', 'ma-shan-zheng', 'playfair'];

/**
 * Fallback used for layers whose id is not one of the three defaults.
 */
const GENERIC_LAYER = {
  id: 'text',
  text: '',
  size: 28,
  weight: 400,
  align: 'center',
  x: 0.5,
  y: 0.68,
  color: '#ffffff',
  lineHeight: 1.4,
  letterSpacing: 0,
  maxWidth: 0.8,
};

/**
 * Normalize one layer.
 * @param {unknown} value - candidate layer.
 * @param {Record<string, unknown>} fallback - the layer to start from.
 * @returns {Record<string, unknown>} the normalized layer.
 */
function normalizeLayer(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  const align = source.align === 'left' || source.align === 'right' ? source.align : fallback.align;
  return {
    id: typeof source.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(source.id) ? source.id : fallback.id,
    text: typeof source.text === 'string' ? source.text : fallback.text,
    size: Math.round(clamp(source.size, 8, 400, fallback.size)),
    weight: typeof source.weight === 'number' && source.weight >= 100 && source.weight <= 900
      ? Math.round(source.weight)
      : fallback.weight,
    italic: typeof source.italic === 'boolean' ? source.italic : Boolean(fallback.italic),
    underline: typeof source.underline === 'boolean' ? source.underline : Boolean(fallback.underline),
    font: FONT_KEYS.includes(source.font)
      ? source.font
      : (FONT_KEYS.includes(fallback.font) ? fallback.font : ''),
    align,
    x: clamp(source.x, 0, 1, fallback.x),
    y: clamp(source.y, 0, 1, fallback.y),
    color: typeof source.color === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(source.color)
      ? source.color.toLowerCase()
      : fallback.color,
    lineHeight: clamp(source.lineHeight, 0.8, 3, fallback.lineHeight),
    letterSpacing: clamp(source.letterSpacing, -10, 40, fallback.letterSpacing),
    maxWidth: clamp(source.maxWidth, 0.2, 1, fallback.maxWidth),
    kind: source.kind === 'image' || source.kind === 'qr' || source.kind === 'badge'
      ? source.kind
      : (source.kind === 'text' ? 'text' : (fallback.kind === 'image' || fallback.kind === 'qr' || fallback.kind === 'badge' ? fallback.kind : 'text')),
    textColor: typeof source.textColor === 'string' && HEX_COLOR.test(source.textColor.trim())
      ? source.textColor.trim().toLowerCase()
      : (typeof fallback.textColor === 'string' ? fallback.textColor : '#141414'),
    value: typeof source.value === 'string' && source.value.length <= 2000
      ? source.value
      : (typeof fallback.value === 'string' ? fallback.value : ''),
    src: typeof source.src === 'string'
      && /^data:image\/(png|jpeg|webp|gif);base64,/.test(source.src)
      && source.src.length <= 2500000
      ? source.src
      : (typeof fallback.src === 'string' ? fallback.src : ''),
    width: clamp(source.width, 0.02, 1.5, typeof fallback.width === 'number' ? fallback.width : 0.3),
    opacity: clamp(source.opacity, 0, 1, typeof fallback.opacity === 'number' ? fallback.opacity : 1),
  };
}

/**
 * Normalize a complete specification.
 * @param {unknown} value - candidate specification.
 * @param {Record<string, unknown>} base - specification to start from.
 * @returns {Record<string, unknown>} the normalized specification.
 */
function normalizeSpec(value, base) {
  const source = value && typeof value === 'object' ? value : {};
  const sourceLayers = Array.isArray(source.layers) ? source.layers : base.layers;
  const seen = new Set();
  const layers = [];
  for (const entry of sourceLayers) {
    if (!entry || typeof entry !== 'object') continue;
    const baseLayer = typeof entry.id === 'string'
      ? base.layers.find((candidate) => candidate.id === entry.id)
      : undefined;
    const layer = normalizeLayer(entry, baseLayer ?? GENERIC_LAYER);
    if (seen.has(layer.id)) continue;
    seen.add(layer.id);
    layers.push(layer);
    if (layers.length >= 12) break;
  }
  if (layers.length === 0) {
    for (const layer of base.layers) layers.push(normalizeLayer(undefined, layer));
  }
  const colors = { ...base.colors };
  if (source.colors && typeof source.colors === 'object') {
    for (const key of COLOR_KEYS) {
      const candidate = source.colors[key];
      if (typeof candidate === 'string' && HEX_COLOR.test(candidate)) colors[key] = candidate.toLowerCase();
    }
  }
  const shader = { ...base.shader };
  if (source.shader && typeof source.shader === 'object') {
    shader.scale = clamp(source.shader.scale, 0.2, 4, shader.scale);
    shader.offsetX = clamp(source.shader.offsetX, -4, 4, shader.offsetX);
    shader.offsetY = clamp(source.shader.offsetY, -4, 4, shader.offsetY);
    shader.grain = clamp(source.shader.grain, 0, 0.05, shader.grain);
    shader.bloom = clamp(source.shader.bloom, 0, 1.5, shader.bloom);
    shader.vignette = clamp(source.shader.vignette, 0, 1, shader.vignette);
    shader.lightCore = clamp(source.shader.lightCore, 0, 1, shader.lightCore);
    shader.lightHalo = clamp(source.shader.lightHalo, 0, 1, shader.lightHalo);
    shader.speed = clamp(source.shader.speed, 0, 4, shader.speed);
    shader.paused = typeof source.shader.paused === 'boolean' ? source.shader.paused : shader.paused;
  }
  return {
    version: SPEC_VERSION,
    size: normalizeSizeKey(source.size, base.size),
    layers,
    colors,
    shader,
  };
}

/**
 * Friendly tool parameter names and the text layer each one drives.
 */
const FRIENDLY_LAYERS = { title: 'title', text: 'subtitle', footer: 'footer' };

/**
 * Merge one friendly patch into the specification.
 * @param {Record<string, any>} base - current specification.
 * @param {Record<string, any>} patch - friendly patch.
 * @returns {Record<string, unknown>} the patched specification.
 */
function applyPatch(base, patch) {
  const next = {
    version: SPEC_VERSION,
    size: base.size,
    layers: base.layers.map((layer) => ({ ...layer })),
    colors: { ...base.colors },
    shader: { ...base.shader },
  };
  if (patch.size !== undefined) {
    const sizeKey = normalizeSizeKey(patch.size, '');
    if (sizeKey) next.size = sizeKey;
  }
  if (patch.colors && typeof patch.colors === 'object') {
    for (const key of COLOR_KEYS) {
      const value = patch.colors[key];
      if (typeof value === 'string' && HEX_COLOR.test(value)) next.colors[key] = value.toLowerCase();
    }
  }
  if (patch.shader && typeof patch.shader === 'object') {
    next.shader = normalizeSpec({ shader: patch.shader }, base).shader;
  }
  for (const layer of next.layers) {
    const friendly = Object.keys(FRIENDLY_LAYERS).find((name) => FRIENDLY_LAYERS[name] === layer.id);
    if (friendly !== undefined && typeof patch[friendly] === 'string') layer.text = patch[friendly];
  }
  if (Array.isArray(patch.layers)) {
    for (const entry of patch.layers) {
      if (!entry || typeof entry !== 'object') continue;
      const existing = next.layers.find((layer) => entry.id !== undefined && layer.id === entry.id);
      if (existing) Object.assign(existing, normalizeLayer(entry, existing));
      else next.layers.push(normalizeLayer(entry, GENERIC_LAYER));
    }
    if (next.layers.length > 12) next.layers.length = 12;
  }
  return next;
}

/**
 * Read one bounded request body as bytes.
 * @param {import('node:http').IncomingMessage} req - the request.
 * @returns {Promise<Buffer | null>} the body, or null past the ceiling.
 */
async function readBoundedBytes(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

/**
 * Send a JSON response.
 * @param {import('node:http').ServerResponse} res - the response.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - response body.
 */
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

/**
 * Register the poster specification, export route, and tools.
 * @param {Record<string, any>} ctx - plugin-owned Host context.
 * @param {Record<string, unknown>} config - plugin configuration.
 */
export function apply(ctx, config = {}) {
  const base = defaultSpec(config);
  let spec = base;
  let saveTimer = null;
  const exports = [];

  const profileRoot = process.env.DSH_PROFILE_DIR
    ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'poster-studio');
  const exportDir = join(profileRoot, 'exports');
  const statePath = join(profileRoot, 'spec.json');

  /**
   * Write the specification to the profile directory.
   * @param {Record<string, unknown>} value - specification to write.
   */
  const writeState = async (value) => {
    await mkdir(profileRoot, { recursive: true });
    await writeFile(statePath, JSON.stringify(value, null, 2), 'utf8');
  };

  /** Persist the current specification, coalescing rapid edits. */
  const persist = () => {
    if (saveTimer !== null) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void writeState(spec).catch((error) => {
        console.warn('poster-studio: the poster design could not be persisted', error);
      });
    }, 400);
  };

  /**
   * Read the persisted specification.
   * @returns {Promise<Record<string, unknown> | undefined>} the stored specification.
   */
  const readState = async () => {
    try {
      const text = await readFile(statePath, 'utf8');
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  };

  void readState().then((stored) => {
    if (stored) spec = normalizeSpec(stored, base);
  });

  void (async () => {
    try {
      const names = await readdir(exportDir);
      const found = [];
      for (const name of names) {
        if (!name.endsWith('.png')) continue;
        const path = join(exportDir, name);
        const info = await stat(path);
        const entry = { name, path, bytes: info.size };
        try {
          const meta = JSON.parse(await readFile(`${path}.json`, 'utf8'));
          entry.spec = normalizeSpec(meta, base);
        } catch {
          /* older exports have no snapshot beside the file */
        }
        found.push(entry);
      }      found.sort((left, right) => right.name.localeCompare(left.name));
      exports.push(...found.slice(0, 20));
    } catch {
      /* no exports directory yet */
    }
  })();

  const connection = ctx.get('connection');
  const webServer = ctx.get('webServer');

  ctx.effect(() => {
    if (!webServer) return undefined;
    const disposeSpec = webServer.register({
      kind: 'exact',
      path: '/poster-studio/spec',
      handler: async (req, res) => {
        const rejection = connection?.requestRejection(req);
        if (rejection !== undefined) {
          res.statusCode = rejection;
          res.end();
          return;
        }
        if (req.method === 'GET') {
          sendJson(res, 200, spec);
          return;
        }
        if (req.method === 'POST') {
          const body = await readBoundedBytes(req);
          if (body === null) {
            sendJson(res, 413, { message: 'poster design too large' });
            return;
          }
          try {
            spec = normalizeSpec(JSON.parse(body.toString('utf8')), base);
          } catch {
            sendJson(res, 400, { message: 'poster design must be a JSON object' });
            return;
          }
          persist();
          sendJson(res, 200, spec);
          return;
        }
        res.statusCode = 405;
        res.setHeader('allow', 'GET, POST');
        res.end();
      },
    });

    const disposeExport = webServer.register({
      kind: 'exact',
      path: '/poster-studio/export',
      handler: async (req, res) => {
        const rejection = connection?.requestRejection(req);
        if (rejection !== undefined) {
          res.statusCode = rejection;
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('allow', 'POST');
          res.end();
          return;
        }
        const body = await readBoundedBytes(req);
        if (body === null || body.length === 0) {
          sendJson(res, 413, { message: 'poster image too large' });
          return;
        }
        await mkdir(exportDir, { recursive: true });
        const name = `poster-${Date.now()}.png`;
        const target = join(exportDir, name);
        await writeFile(target, body);
        const encoded = req.headers['x-poster-spec'];
        let snapshot;
        if (typeof encoded === 'string' && encoded.length > 0) {
          try {
            snapshot = normalizeSpec(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')), base);
          } catch {
            snapshot = undefined;
          }
        }
        if (snapshot) {
          await writeFile(`${target}.json`, JSON.stringify(snapshot), 'utf8').catch(() => {});
        }
        exports.unshift({ name, path: target, bytes: body.length, spec: snapshot });
        exports.length = Math.min(exports.length, 20);
        sendJson(res, 200, { name, path: target, bytes: body.length });
      },
    });

    const disposeLibrary = webServer.register({
      kind: 'exact',
      path: '/poster-studio/exports',
      handler: async (req, res) => {
        const rejection = connection?.requestRejection(req);
        if (rejection !== undefined) {
          res.statusCode = rejection;
          res.end();
          return;
        }
        if (req.method === 'DELETE') {
          const cleared = exports.length;
          exports.length = 0;
          try {
            const found = await readdir(exportDir);
            for (const file of found) {
              if (file.endsWith('.png') || file.endsWith('.png.json')) await rm(join(exportDir, file), { force: true });
            }
          } catch { /* the directory may not exist yet */ }
          sendJson(res, 200, { cleared });
          return;
        }
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('allow', 'GET, DELETE');
          res.end();
          return;
        }
        const query = new URL(req.url ?? '', 'http://localhost').searchParams.get('file');
        if (query) {
          const safe = String(query).replace(/[^A-Za-z0-9._-]/g, '');
          if (!safe.endsWith('.png')) {
            res.statusCode = 400;
            res.end();
            return;
          }
          try {
            const data = await readFile(join(exportDir, safe));
            res.statusCode = 200;
            res.setHeader('content-type', 'image/png');
            res.setHeader('cache-control', 'no-store');
            res.end(data);
          } catch {
            res.statusCode = 404;
            res.end();
          }
          return;
        }
        sendJson(res, 200, exports);
      },
    });

    return () => {
      disposeSpec();
      disposeExport();
      disposeLibrary();
    };
  });

  ctx.effect(() => {
    const disposeTool = ctx.tools.register({
      name: 'poster_design',
      description:
        'Design the poster shown by the Poster Studio plugin. Use it when the user asks for a poster, '
        + 'wants the poster title, subtitle, footer, canvas size, shader colours, or backdrop tuning '
        + 'changed, or asks what the poster currently shows. Omit a field to keep its current value; '
        + 'pass reset to restore the default design.',
      parameters: {
        title: {
          type: 'string',
          required: false,
          description: 'Headline. Chinese and Latin text are both supported.',
        },
        text: {
          type: 'string',
          required: false,
          description: 'Supporting line under the headline. Keep it empty for a headline-only poster.',
        },
        footer: {
          type: 'string',
          required: false,
          description: 'Small line near the bottom edge, for a date, handle, or credit.',
        },
        size: {
          type: 'string',
          required: false,
          description: 'Canvas size: a preset like 1080x1350, or custom WxH with each side between 200 and 4000.',
        },
        colors: {
          type: 'object',
          required: false,
          description: 'Shader colour overrides as #rrggbb values. The backdrop mixes these five slots.',
          properties: {
            c1: { type: 'string', required: false, description: 'Deepest backdrop colour.' },
            c2: { type: 'string', required: false, description: 'Low backdrop colour.' },
            c3: { type: 'string', required: false, description: 'Primary backdrop colour.' },
            c4: { type: 'string', required: false, description: 'Highlight colour.' },
            c5: { type: 'string', required: false, description: 'Shading colour.' },
          },
        },
        shader: {
          type: 'object',
          required: false,
          description: 'Backdrop tuning.',
          properties: {
            scale: { type: 'number', required: false, description: 'Noise scale, 0.2 to 4.' },
            offsetX: { type: 'number', required: false, description: 'Horizontal noise offset.' },
            offsetY: { type: 'number', required: false, description: 'Vertical noise offset.' },
            grain: { type: 'number', required: false, description: 'Film grain amount, 0 to 0.05.' },
            bloom: { type: 'number', required: false, description: 'Glow strength, 0 to 1.5.' },
            vignette: { type: 'number', required: false, description: 'Edge darkening, 0 to 1.' },
            lightCore: { type: 'number', required: false, description: 'Warm light core, 0 to 1.' },
            lightHalo: { type: 'number', required: false, description: 'Cool light halo, 0 to 1.' },
            speed: { type: 'number', required: false, description: 'Animation speed, 0 to 4.' },
            paused: { type: 'boolean', required: false, description: 'Freeze the backdrop animation.' },
          },
        },
        reset: {
          type: 'boolean',
          required: false,
          description: 'Restore the default poster design and discard every customisation.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['size', 'layers', 'colors', 'shader'],
          properties: {
            version: { type: 'number' },
            size: { type: 'string' },
            layers: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id'],
                properties: {
                  id: { type: 'string' },
                  text: { type: 'string' },
                  size: { type: 'number' },
                  weight: { type: 'number' },
                  italic: { type: 'boolean' },
                  underline: { type: 'boolean' },
                  font: { type: 'string', enum: ['', 'noto-sans-sc', 'noto-serif-sc', 'zcool-xiaowei', 'zcool-huangyou', 'ma-shan-zheng', 'playfair'] },
                  src: { type: 'string' },
                  align: { type: 'string' },
                  x: { type: 'number', description: 'Horizontal anchor, 0 to 1.' },
                  y: { type: 'number', description: 'Vertical anchor, 0 to 1.' },
                  color: { type: 'string' },
                  lineHeight: { type: 'number' },
                  letterSpacing: { type: 'number', description: 'Letter spacing in pixels, -10 to 40.' },
                  maxWidth: { type: 'number' },
                  kind: { type: 'string', enum: ['text', 'image', 'qr', 'badge'] },
                  value: { type: 'string' },
                  textColor: { type: 'string' },
                  width: { type: 'number' },
                  opacity: { type: 'number' },
                },
              },
            },
            colors: {
              type: 'object',
              additionalProperties: false,
              required: ['c1', 'c2', 'c3', 'c4', 'c5'],
              properties: {
                c1: { type: 'string' },
                c2: { type: 'string' },
                c3: { type: 'string' },
                c4: { type: 'string' },
                c5: { type: 'string' },
              },
            },
            shader: {
              type: 'object',
              additionalProperties: false,
              required: ['scale', 'offsetX', 'offsetY', 'grain', 'bloom', 'vignette', 'lightCore', 'lightHalo', 'speed', 'paused'],
              properties: {
                scale: { type: 'number' },
                offsetX: { type: 'number' },
                offsetY: { type: 'number' },
                grain: { type: 'number' },
                bloom: { type: 'number' },
                vignette: { type: 'number' },
                lightCore: { type: 'number' },
                lightHalo: { type: 'number' },
                speed: { type: 'number' },
                paused: { type: 'boolean' },
              },
            },
          },
        },
        render: (_args, value) => {
          const headline = value.layers?.find((layer) => layer.id === 'title');
          const subtitle = value.layers?.find((layer) => layer.id === 'subtitle');
          const parts = [`Poster ${value.size}: ${headline?.text ?? ''}`];
          if (subtitle?.text) parts.push(subtitle.text);
          return [{ type: 'text', text: parts.join(' — ') }];
        },
      },
      async execute(args) {
        const patch = args && typeof args === 'object' ? args : {};
        if (patch.reset === true) {
          spec = {
            ...base,
            layers: base.layers.map((layer) => ({ ...layer })),
            colors: { ...base.colors },
            shader: { ...base.shader },
          };
        } else {
          spec = applyPatch(spec, patch);
        }
        persist();
        return spec;
      },
      presentCall(args) {
        const title = args && typeof args.title === 'string' ? args.title.trim() : '';
        return { card: 'generic', title: title.length > 0 ? title : 'Poster' };
      },
    });

    const disposeCommand = ctx.commands.register({
      name: 'poster',
      description: 'Read or update the poster design shown by the Poster Studio plugin.',
      input: {
        hint: '{"title":"...","text":"...","colors":{"c3":"#204a7e"}}; omit the payload to read the current design',
      },
      handler(invocation) {
        const raw = String(invocation.rawInput ?? '').trim();
        if (raw.length === 0) return { kind: 'success', text: JSON.stringify(spec) };
        let patch;
        try {
          patch = JSON.parse(raw);
        } catch {
          return { kind: 'error', text: 'The poster payload must be a JSON object.' };
        }
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
          return { kind: 'error', text: 'The poster payload must be a JSON object.' };
        }
        spec = patch.reset === true
          ? {
            ...base,
            layers: base.layers.map((layer) => ({ ...layer })),
            colors: { ...base.colors },
            shader: { ...base.shader },
          }
          : applyPatch(spec, patch);
        persist();
        return { kind: 'success', text: JSON.stringify(spec) };
      },
    });

    return () => {
      disposeTool();
      disposeCommand();
    };
  });

  // The export tool needs the filesystem and the session working directory,
  // which some host compositions do not provide.
  ctx.inject(['fs', 'workingDirectory'], (child) => {
    ctx.effect(() => {
      const dispose = ctx.tools.register({
        name: 'poster_export',
        description:
          'Deliver the poster image the Poster Studio plugin rendered. Use it when the user asks for the '
          + 'poster as a file or image. The file is copied into the session working directory and the path '
          + 'is returned so it can be presented to the user.',
        parameters: {
          name: {
            type: 'string',
            required: false,
            description: 'File name to write, without the .png suffix. Defaults to a timestamped name.',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['path'],
            properties: {
              path: { type: 'string' },
              bytes: { type: 'number' },
            },
          },
          render: (_args, value) => [{ type: 'text', text: `Poster exported to ${value.path}` }],
        },
        async execute(args, exec) {
          if (exec.agent === undefined) throw new Error('poster export requires an agent session');
          if (exports.length === 0) throw new Error('no poster has been exported from the studio yet');
          const latest = exports[0];
          const wanted = args && typeof args.name === 'string' && args.name.trim().length > 0
            ? args.name.trim().replace(/[^\p{L}\p{N}_-]/gu, '-')
            : 'poster';
          const cwd = await child.workingDirectory.ensure(exec.agent, exec.signal);
          const bytes = await readFile(latest.path);
          const target = join(cwd, `${wanted}.png`);
          await writeFile(target, bytes);
          return { path: target, bytes: bytes.length };
        },
      });
      return dispose;
    });
  });
}
