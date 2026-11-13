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
    text: typeof source.text === 'string'
      ? source.text
      : (typeof source.text === 'number' && Number.isFinite(source.text) ? String(source.text) : fallback.text),
    size: Math.round(clamp(source.size, 8, 2000, fallback.size)),
    weight: typeof source.weight === 'number' && source.weight >= 100 && source.weight <= 900
      ? Math.round(source.weight)
      : fallback.weight,
    italic: typeof source.italic === 'boolean' ? source.italic : Boolean(fallback.italic),
    underline: typeof source.underline === 'boolean' ? source.underline : Boolean(fallback.underline),
    locked: typeof source.locked === 'boolean' ? source.locked : Boolean(fallback.locked),
    outline: typeof source.outline === 'number' && source.outline >= 0 && source.outline <= 1 ? source.outline : (typeof fallback.outline === 'number' ? fallback.outline : 0),
    shadow: typeof source.shadow === 'number' && source.shadow >= 0 && source.shadow <= 1 ? source.shadow : (typeof fallback.shadow === 'number' ? fallback.shadow : 0),
    outlineColor: typeof source.outlineColor === 'string' && /^#[0-9a-f]{6}$/i.test(source.outlineColor)
      ? source.outlineColor.toLowerCase()
      : (typeof fallback.outlineColor === 'string' ? fallback.outlineColor.toLowerCase() : '#000000'),
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
  const background = { ...(base.background ?? {}) };
  if (source.background && typeof source.background === 'object') {
    if (typeof source.background.image === 'string' && (source.background.image.length === 0 || source.background.image.startsWith('data:image/'))) {
      background.image = source.background.image;
    }
    background.opacity = clamp(source.background.opacity, 0, 1, background.opacity ?? 1);
  }
  return {
    version: SPEC_VERSION,
    size: normalizeSizeKey(source.size, base.size),
    layers,
    colors,
    shader,
    background,
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
export function applyPatch(base, patch) {
  const next = {
    version: SPEC_VERSION,
    size: base.size,
    layers: base.layers.map((layer) => ({ ...layer })),
    colors: { ...base.colors },
    shader: { ...base.shader },
    background: { ...(base.background ?? {}) },
  };
  if (patch.background && typeof patch.background === 'object') {
    next.background = normalizeSpec({ background: patch.background, size: base.size }, { ...base, background: next.background }).background;
  }
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
    if (friendly === undefined) continue;
    const value = patch[friendly];
    // The call layer rewrites numeric-looking strings ("2027") into numbers,
    // so a headline may arrive as a number. Keep the text either way.
    if (typeof value === 'string') layer.text = value;
    else if (typeof value === 'number' && Number.isFinite(value)) layer.text = String(value);
  }
  if (Array.isArray(patch.remove)) {
    const doomed = new Set(patch.remove.filter((id) => typeof id === 'string'));
    next.layers = next.layers.filter((layer) => !doomed.has(layer.id));
  }
  if (Array.isArray(patch.layers)) {
    if (patch.replace === true) next.layers = [];
    for (const entry of patch.layers) {
      if (!entry || typeof entry !== 'object') continue;
      const existing = next.layers.find((layer) => entry.id !== undefined && layer.id === entry.id);
      if (existing) Object.assign(existing, normalizeLayer(entry, existing));
      else if (next.layers.length < 12) next.layers.push(normalizeLayer(entry, GENERIC_LAYER));
    }
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

const IMAGE_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
const MAX_BG_BYTES = 4 * 1024 * 1024;

/**
 * Let an agent give a local file path for the backdrop image: read the file
 * and embed it as a data URL so every render path keeps seeing a data URL.
 * @param {Record<string, any>} patch - the tool arguments.
 * @returns {Promise<Record<string, any>>} patch with background.image resolved.
 */
async function resolveBackground(patch) {
  const bg = patch.background;
  if (!bg || typeof bg !== 'object' || typeof bg.image !== 'string') return patch;
  const value = bg.image.trim();
  if (value.length === 0 || value.startsWith('data:')) return patch;
  const path = value.replace(/^file:\/\/\/?/i, '');
  let bytes;
  try {
    bytes = await readFile(path);
  } catch {
    throw new Error(
      `poster background: cannot read image file "${path}" — pass an absolute path to a jpg/png/webp/gif image, `
      + 'an existing data:image/… URL, or an empty string to remove the backdrop image.',
    );
  }
  if (bytes.length > MAX_BG_BYTES) {
    throw new Error(
      `poster background: "${path}" is ${(bytes.length / 1048576).toFixed(1)} MB, over the 4 MB limit — `
      + 'downscale or recompress it first (a ~1920px JPEG under 4 MB works well).',
    );
  }
  const ext = (path.match(/\.[a-z]+$/i) ?? [''])[0].toLowerCase();
  const mime = IMAGE_MIME[ext] ?? 'image/jpeg';
  return { ...patch, background: { ...bg, image: `data:${mime};base64,${bytes.toString('base64')}` } };
}

/**
 * Copy a spec for agent-visible output with embedded images redacted so a
 * 35 KB base64 blob never floods the model context; the poster panel keeps
 * the real data through spec.json.
 * @param {Record<string, any>} value - the poster specification.
 * @returns {Record<string, any>} agent-safe summary copy.
 */
function summarizeForAgent(value) {
  const redact = (text) => `<image dataURL, ~${Math.round(text.length / 1024)} KB, shown in the poster panel>`;
  const copy = {
    ...value,
    layers: (value.layers ?? []).map((layer) => (
      typeof layer.src === 'string' && layer.src.length > 120 ? { ...layer, src: redact(layer.src) } : layer
    )),
  };
  if (copy.background && typeof copy.background.image === 'string' && copy.background.image.length > 120) {
    copy.background = { ...copy.background, image: redact(copy.background.image) };
  }
  return copy;
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
  const versionsPath = join(profileRoot, 'versions.json');
  const versionsDir = join(profileRoot, 'versions');
  const palettesPath = join(profileRoot, 'palettes.json');
  const PALETTE_COLOR_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5'];

  /**
   * Read the persisted custom palette list.
   * @returns {Promise<Array<Record<string, any>>>} stored palettes.
   */
  const readPalettes = async () => {
    try {
      const parsed = JSON.parse(await readFile(palettesPath, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.name === 'string') : [];
    } catch {
      return [];
    }
  };

  /**
   * Persist the custom palette list.
   * @param {Array<Record<string, any>>} entries - palette entries.
   * @returns {Promise<void>} resolves when written.
   */
  const writePalettes = async (entries) => {
    await mkdir(profileRoot, { recursive: true });
    await writeFile(palettesPath, JSON.stringify(entries, null, 2), 'utf8');
  };

  /**
   * Read the persisted version index.
   * @returns {Promise<Array<Record<string, any>>>} stored version entries.
   */
  const readVersions = async () => {
    try {
      const parsed = JSON.parse(await readFile(versionsPath, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.id === 'string') : [];
    } catch {
      return [];
    }
  };

  /**
   * Persist the version index.
   * @param {Array<Record<string, any>>} entries - version entries.
   * @returns {Promise<void>} resolves when written.
   */
  const writeVersions = async (entries) => {
    await mkdir(profileRoot, { recursive: true });
    await writeFile(versionsPath, JSON.stringify(entries, null, 2), 'utf8');
  };

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

  // The Host routes must be mounted once the web server and the client
  // connection exist. Reading the services once at load time silently skipped
  // every route (the studio then showed the client-side default design), so
  // the registration waits for both services instead.
  ctx.inject(['connection', 'webServer'], (child) => {
  const connection = child.connection;
  const webServer = child.webServer;

  child.effect(() => {
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

    const disposeVersions = webServer.register({
      kind: 'exact',
      path: '/poster-studio/versions',
      handler: async (req, res) => {
        const rejection = connection?.requestRejection(req);
        if (rejection !== undefined) {
          res.statusCode = rejection;
          res.end();
          return;
        }
        if (req.method === 'GET') {
          sendJson(res, 200, { versions: await readVersions() });
          return;
        }
        if (req.method === 'POST') {
          const body = await readBoundedBytes(req);
          if (body === null) {
            sendJson(res, 413, { message: 'version payload too large' });
            return;
          }
          let payload;
          try {
            payload = JSON.parse(body.toString('utf8'));
          } catch {
            sendJson(res, 400, { message: 'version payload must be a JSON object' });
            return;
          }
          if (!payload || typeof payload !== 'object' || !payload.spec) {
            sendJson(res, 400, { message: 'version payload needs a spec' });
            return;
          }
          const name = typeof payload.name === 'string' ? payload.name.slice(0, 40) : '';
          const thumb = typeof payload.thumb === 'string' && payload.thumb.length < 400000 && /^[A-Za-z0-9+/=]+$/.test(payload.thumb) ? payload.thumb : '';
          const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: name.length > 0 ? name : new Date().toLocaleString(),
            savedAt: new Date().toISOString(),
            thumb,
          };
          await mkdir(versionsDir, { recursive: true });
          await writeFile(join(versionsDir, `${entry.id}.json`), JSON.stringify({ spec: normalizeSpec(payload.spec, base), thumb }), 'utf8');
          const entries = [entry, ...await readVersions()].slice(0, 50);
          await writeVersions(entries);
          sendJson(res, 200, { versions: entries });
          return;
        }
        res.statusCode = 405;
        res.setHeader('allow', 'GET, POST');
        res.end();
      },
    });

    const disposeVersionOne = webServer.register({
      kind: 'exact',
      path: '/poster-studio/version',
      handler: async (req, res) => {
        const rejection = connection?.requestRejection(req);
        if (rejection !== undefined) {
          res.statusCode = rejection;
          res.end();
          return;
        }
        const query = new URL(req.url ?? '', 'http://localhost').searchParams.get('id') ?? '';
        const safe = query.replace(/[^A-Za-z0-9_-]/g, '');
        if (safe.length === 0) {
          res.statusCode = 400;
          res.end();
          return;
        }
        if (req.method === 'GET') {
          try {
            const data = await readFile(join(versionsDir, `${safe}.json`));
            const parsed = JSON.parse(data.toString('utf8'));
            const inner = parsed && parsed.spec ? parsed.spec : parsed;
            sendJson(res, 200, { spec: inner });
          } catch {
            res.statusCode = 404;
            res.end();
          }
          return;
        }
        if (req.method === 'DELETE') {
          await rm(join(versionsDir, `${safe}.json`), { force: true }).catch(() => {});
          const entries = (await readVersions()).filter((entry) => entry.id !== safe);
          await writeVersions(entries);
          sendJson(res, 200, { versions: entries });
          return;
        }
        res.statusCode = 405;
        res.setHeader('allow', 'GET, DELETE');
        res.end();
      },
    });

    const disposePalettes = webServer.register({
      kind: 'exact',
      path: '/poster-studio/palettes',
      handler: async (req, res) => {
        const rejection = connection?.requestRejection(req);
        if (rejection !== undefined) {
          res.statusCode = rejection;
          res.end();
          return;
        }
        if (req.method === 'GET') {
          sendJson(res, 200, { palettes: await readPalettes() });
          return;
        }
        if (req.method === 'POST') {
          const body = await readBoundedBytes(req);
          if (body === null) {
            sendJson(res, 413, { message: 'palette payload too large' });
            return;
          }
          let payload;
          try {
            payload = JSON.parse(body.toString('utf8'));
          } catch {
            sendJson(res, 400, { message: 'palette payload must be a JSON object' });
            return;
          }
          if (!payload || typeof payload !== 'object' || typeof payload.name !== 'string') {
            sendJson(res, 400, { message: 'palette payload needs a name' });
            return;
          }
          const name = payload.name.slice(0, 24);
          if (name.length === 0) {
            sendJson(res, 400, { message: 'palette name is empty' });
            return;
          }
          const colors = {};
          for (const key of PALETTE_COLOR_KEYS) {
            const value = payload.colors && payload.colors[key];
            colors[key] = typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : '#000000';
          }
          const entries = (await readPalettes()).filter((entry) => entry.name !== name);
          entries.unshift({ name, colors });
          entries.length = Math.min(entries.length, 24);
          await writePalettes(entries);
          sendJson(res, 200, { palettes: entries });
          return;
        }
        if (req.method === 'DELETE') {
          const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('name') ?? '';
          const entries = (await readPalettes()).filter((entry) => entry.name !== name);
          await writePalettes(entries);
          sendJson(res, 200, { palettes: entries });
          return;
        }
        res.statusCode = 405;
        res.setHeader('allow', 'GET, POST, DELETE');
        res.end();
      },
    });

    return () => {
      disposeSpec();
      disposeExport();
      disposeLibrary();
      disposeVersions();
      disposeVersionOne();
      disposePalettes();
    };
  });
  });

  ctx.effect(() => {
    const disposeTool = ctx.tools.register({
      name: 'poster_design',
      description:
        'Design the poster shown in the Poster Studio panel (海报创作). Use it whenever the user mentions '
        + 'a poster or 海报 in any language: making or changing one, setting its title (标题), subtitle, '
        + 'footer, canvas size, colours (配色), background image, or backdrop tuning, or asking what the '
        + 'poster currently shows. Changes apply live to the floating poster panel. '
        + 'Omit a field to keep its current value; pass reset to restore the default design.',
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
        background: {
          type: 'object',
          required: false,
          description: 'Optional backdrop image layered over the shader. Set image to an empty string to remove it.',
          properties: {
            image: { type: 'string', required: false, description: 'A data:image/… URL, or a local image file path (jpg/png/webp/gif, up to 4 MB) which is embedded automatically, or an empty string to remove the backdrop image.' },
            opacity: { type: 'number', required: false, description: 'Backdrop image opacity, 0 to 1.' },
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
        layers: {
          type: 'array',
          required: false,
          description: 'Layer patches. An entry whose id matches an existing layer updates it; an unknown id adds a new layer.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', required: false, description: 'Layer id, for example title, subtitle, footer, tag, year, seal.' },
              text: { type: 'string', required: false, description: 'Layer text.' },
              kind: { type: 'string', required: false, enum: ['text', 'image', 'qr', 'badge'] },
              size: { type: 'number', required: false, description: 'Font size in pixels.' },
              weight: { type: 'number', required: false, description: 'Font weight, 100 to 900.' },
              align: { type: 'string', required: false, enum: ['left', 'center', 'right'] },
              x: { type: 'number', required: false, description: 'Horizontal anchor, 0 to 1.' },
              y: { type: 'number', required: false, description: 'Vertical anchor, 0 to 1.' },
              color: { type: 'string', required: false, description: 'Text colour as #rrggbb or #rrggbbaa.' },
              outline: { type: 'number', required: false, description: 'Text outline strength, 0 to 1.' },
              outlineColor: { type: 'string', required: false, description: 'Outline colour as #rrggbb.' },
              shadow: { type: 'number', required: false, description: 'Text shadow strength, 0 to 1.' },
              font: { type: 'string', required: false, enum: ['', 'noto-sans-sc', 'noto-serif-sc', 'zcool-xiaowei', 'zcool-huangyou', 'ma-shan-zheng', 'playfair'] },
              src: { type: 'string', required: false, description: 'Image layer source as a data:image/… URL.' },
              value: { type: 'string', required: false, description: 'Badge or QR payload.' },
              textColor: { type: 'string', required: false, description: 'Badge text colour as #rrggbb.' },
              lineHeight: { type: 'number', required: false, description: 'Line height multiplier.' },
              letterSpacing: { type: 'number', required: false, description: 'Letter spacing in pixels, -10 to 40.' },
              maxWidth: { type: 'number', required: false, description: 'Text wrap width as a fraction of the canvas.' },
              width: { type: 'number', required: false, description: 'Image layer width as a fraction of the canvas.' },
              opacity: { type: 'number', required: false, description: 'Layer opacity, 0 to 1.' },
            },
          },
        },
        remove: {
          type: 'array',
          required: false,
          description: 'Layer ids to delete: ["footer"] removes the footer text layer, ["img1", "qr1"] removes image/QR layers. To drop the backdrop image use background.image "" instead.',
          items: { type: 'string' },
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
                  locked: { type: 'boolean' },
                  outline: { type: 'number', description: 'Text outline strength, 0 to 1.' },
                  outlineColor: { type: 'string', description: 'Outline color as #rrggbb.' },
                  shadow: { type: 'number', description: 'Text shadow strength, 0 to 1.' },
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
            background: {
              type: 'object',
              additionalProperties: false,
              required: [],
              properties: {
                image: { type: 'string' },
                opacity: { type: 'number' },
              },
            },
          },
        },
        render: (_args, value) => {
          const get = (id) => value.layers?.find((layer) => layer.id === id);
          const parts = [`Poster ${value.size}`];
          const headline = get('title');
          if (headline?.text) parts.push(`title "${headline.text}"`);
          const subtitle = get('subtitle');
          if (subtitle?.text) parts.push(`subtitle "${subtitle.text}"`);
          const footer = get('footer');
          if (footer?.text) parts.push(`footer "${footer.text}"`);
          const extra = (value.layers ?? []).filter((layer) => !['title', 'subtitle', 'footer'].includes(layer.id));
          if (extra.length > 0) parts.push(`${extra.length} extra layer(s): ${extra.map((layer) => `${layer.id ?? ''}(${layer.kind ?? 'text'})`).join(', ')}`);
          parts.push(value.background?.image
            ? `backdrop: image, opacity ${value.background.opacity ?? 1}`
            : 'backdrop: shader only');
          parts.push(`colours ${(value.colors ? Object.values(value.colors).join(' ') : '')}`);
          return [{ type: 'text', text: parts.join(' · ') }];
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
            background: { ...(base.background ?? {}) },
          };
        } else {
          spec = applyPatch(spec, await resolveBackground(patch));
        }
        persist();
        return summarizeForAgent(spec);
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
        if (raw.length === 0) return { kind: 'success', text: JSON.stringify(summarizeForAgent(spec)) };
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
            background: { ...(base.background ?? {}) },
          }
          : applyPatch(spec, patch);
        persist();
        return { kind: 'success', text: JSON.stringify(summarizeForAgent(spec)) };
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
          'Deliver the poster image the Poster Studio panel rendered (导出海报). Use it when the user asks '
          + 'for the poster as a file or image, or asks to export or save the poster (导出/保存海报). '
          + 'The file is copied into the session working directory and the path is returned so it can be '
          + 'presented to the user.',
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
