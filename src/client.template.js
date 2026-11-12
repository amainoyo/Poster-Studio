window.__ModuleLoader__.load({
  id: '@local/dsh-poster-studio',
  factory(require) {
    // Vendored React pair. The harness frame renders plugin occupants with
    // its own bundled React while the module loader may hand out a different
    // copy, so hook calls cross instances and die (React #321). Every plugin
    // tree therefore mounts through this private, coherent pair: occupants
    // stay hook-free (class shells) and the whole UI renders in our root.
    let React = null;
    let ReactDOM = null;
    try {
      const prevR = typeof window !== 'undefined' ? window.React : undefined;
      const prevD = typeof window !== 'undefined' ? window.ReactDOM : undefined;
      __REACT_UMD__;
      __REACT_DOM_UMD__;
      if (typeof window !== 'undefined' && window.React && window.ReactDOM) {
        React = window.React;
        ReactDOM = window.ReactDOM;
      }
      if (typeof window !== 'undefined') {
        if (prevR === undefined) delete window.React; else window.React = prevR;
        if (prevD === undefined) delete window.ReactDOM; else window.ReactDOM = prevD;
      }
    } catch (error) { void error; }
    if (!React) React = require('react');
    if (!ReactDOM) {
      try {
        ReactDOM = require('react-dom');
      } catch {
        ReactDOM = null;
      }
    }
    const h = React.createElement;
    // Diagnostic: record which react instance is rendering this module and
    // which instance owns the live dispatcher during render.
    try {
      if (typeof window !== 'undefined') {
        const own = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
        const dom = ReactDOM && ReactDOM.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
        window.__posterReactDiag = {
          ownDispatcher: Boolean(own && own.ReactCurrentDispatcher && own.ReactCurrentDispatcher.current),
          domSameAsOwn: Boolean(own && dom && own.ReactCurrentDispatcher === dom.ReactCurrentDispatcher),
          domDispatcher: Boolean(dom && dom.ReactCurrentDispatcher && dom.ReactCurrentDispatcher.current),
          reactVersion: React.version,
          domVersion: ReactDOM ? ReactDOM.version : null,
        };
      }
    } catch (error) { void error; }

    // ---------------------------------------------------------------------
    // Fonts: the Latin and Chinese faces of the official DeepSeek Harness
    // page, inlined so the poster renders identically offline.
    // ---------------------------------------------------------------------
    const FONT_FACE_CSS = __FONT_FACE_CSS__;

    const FONT_STACK = '"PosterSans", system-ui, -apple-system, BlinkMacSystemFont, '
      + '"Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", "PingFang SC", '
      + '"Microsoft YaHei", sans-serif';

    const LATIN_STACK = '"PosterGrotesk", ' + FONT_STACK;

    // Online font extensions, lazy-loaded through the Google Fonts mirror
    // (fonts.loli.net); the offline fallback chain is the built-in stack.
    const FONT_OPTIONS = {
      'noto-sans-sc': { css: '"Noto Sans SC"', label: '思源黑体', url: 'https://fonts.loli.net/css2?family=Noto+Sans+SC:wght@100..900&display=swap' },
      'noto-serif-sc': { css: '"Noto Serif SC"', label: '思源宋体', url: 'https://fonts.loli.net/css2?family=Noto+Serif+SC:wght@200..900&display=swap' },
      'zcool-xiaowei': { css: '"ZCOOL XiaoWei"', label: '站酷小薇', url: 'https://fonts.loli.net/css2?family=ZCOOL+XiaoWei&display=swap' },
      'zcool-huangyou': { css: '"ZCOOL QingKe HuangYou"', label: '站酷黄油', url: 'https://fonts.loli.net/css2?family=ZCOOL+QingKe+HuangYou&display=swap' },
      'ma-shan-zheng': { css: '"Ma Shan Zheng"', label: '毛笔楷书', url: 'https://fonts.loli.net/css2?family=Ma+Shan+Zheng&display=swap' },
      'playfair': { css: '"Playfair Display"', label: 'Playfair 衬线', url: 'https://fonts.loli.net/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap' },
    };

    /** Stylesheet links of the online fonts, keyed by font id. */
    const onlineFontLinks = new Map();

    /**
     * Start loading one layer's online font and report when glyphs are ready.
     * @param {Record<string, any>} layer - the layer.
     * @param {() => void} [onReady] - repaint hook while the sheet is still loading.
     * @returns {Promise<void> | null} the glyph download, if it started.
     */
    function ensureOnlineFont(layer, onReady) {
      const option = FONT_OPTIONS[layer.font];
      if (!option) return null;
      let entry = onlineFontLinks.get(layer.font);
      if (!entry) {
        entry = { ready: false, waiters: new Set() };
        entry.link = document.createElement('link');
        entry.link.rel = 'stylesheet';
        entry.link.href = option.url;
        entry.link.addEventListener('load', () => {
          entry.ready = true;
          for (const waiter of entry.waiters) waiter();
          entry.waiters.clear();
        }, { once: true });
        onlineFontLinks.set(layer.font, entry);
        document.head.appendChild(entry.link);
      }
      if (!entry.ready) {
        if (onReady) entry.waiters.add(onReady);
        return null;
      }
      if (!layer.text) return null;
      const fontSpec = `${layer.italic ? 'italic ' : ''}${layer.weight} ${layer.size}px ${option.css}`;
      return Promise.resolve(document.fonts.load(fontSpec, String(layer.text)))
        .then(() => undefined, () => undefined);
    }

    /**
     * Wait until the online fonts of a specification can be drawn.
     * @param {Record<string, any>} spec - the specification.
     * @returns {Promise<void>} resolves when ready or after a short grace.
     */
    function preloadSpecFonts(spec) {
      const waits = [];
      for (const layer of spec.layers ?? []) {
        if (!FONT_OPTIONS[layer.font] || !layer.text) continue;
        waits.push(new Promise((resolve) => {
          const pending = ensureOnlineFont(layer, resolve);
          if (pending) pending.then(resolve);
          setTimeout(resolve, 8000);
        }));
      }
      return Promise.all(waits).then(() => undefined);
    }

    // ---------------------------------------------------------------------
    // Canvas presets.
    // ---------------------------------------------------------------------
    const SIZES = {
      '1080x1350': { width: 1080, height: 1350, label: '3:4 竖版' },
      '1080x1920': { width: 1080, height: 1920, label: '9:16 竖屏' },
      '1920x1080': { width: 1920, height: 1080, label: '16:9 横版' },
      '1080x1080': { width: 1080, height: 1080, label: '1:1 方图' },
      '1200x628': { width: 1200, height: 628, label: 'Banner' },
    };

    const SIZE_ORDER = ['1080x1350', '1080x1920', '1920x1080', '1080x1080', '1200x628'];

    const CUSTOM_SIZE_RE = /^(\d{3,4})x(\d{3,4})$/;

    /**
     * Resolve any canvas size: a preset key, or a custom WxH clamped per side.
     * @param {string} size - the size key.
     * @returns {{ width: number, height: number }} the pixel dimensions.
     */
    function parseSize(size) {
      const preset = SIZES[size];
      if (preset) return preset;
      const match = CUSTOM_SIZE_RE.exec(typeof size === 'string' ? size : '');
      if (match) {
        return {
          width: Math.min(4000, Math.max(200, Number(match[1]))),
          height: Math.min(4000, Math.max(200, Number(match[2]))),
        };
      }
      return SIZES['1080x1350'];
    }

    const COLOR_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5'];

    const DEFAULT_COLORS = {
      c1: '#000000',
      c2: '#000000',
      c3: '#204a7e',
      c4: '#cec8bb',
      c5: '#000000',
    };

    const BUILTIN_PALETTES = [
      { name: '官网', colors: { c1: '#000000', c2: '#000000', c3: '#204a7e', c4: '#cec8bb', c5: '#000000' } },
      { name: '靛蓝金', colors: { c1: '#05070f', c2: '#0a1024', c3: '#2b4a9d', c4: '#e8b06a', c5: '#0b1020' } },
      { name: '墨绿', colors: { c1: '#040a08', c2: '#0a1410', c3: '#1f5a4a', c4: '#d8e2c0', c5: '#08120e' } },
      { name: '夜紫', colors: { c1: '#08060f', c2: '#0e0a1c', c3: '#4b2f8f', c4: '#e0c8f0', c5: '#0c0818' } },
      { name: '暗红', colors: { c1: '#0d0507', c2: '#170a0c', c3: '#8f2f39', c4: '#f0d0b0', c5: '#120708' } },
      { name: '石墨', colors: { c1: '#08090b', c2: '#101216', c3: '#4a5058', c4: '#e8e8e6', c5: '#0b0c0e' } },
    ];
    let PALETTES = BUILTIN_PALETTES;

    const LAYER_LABELS = { title: 'layerTitle', subtitle: 'layerSubtitle', footer: 'layerFooter' };

    // ---------------------------------------------------------------------
    // Shader: the backdrop of the official DeepSeek Harness page, with the
    // five colours and the tuning values turned into uniforms.
    // ---------------------------------------------------------------------
    const VERTEX_SHADER = `#version 300 es
in vec4 a_position;
void main() { gl_Position = a_position; }
`;

    const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform vec2 u_loop1, u_loop2, u_loop3, u_loop4;
uniform vec2 u_resolution;
uniform vec2 u_grainResolution;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_c4;
uniform vec3 u_c5;
uniform float u_scale;
uniform vec2 u_offset;
uniform float u_grain;
uniform float u_bloomStrength;
uniform float u_vignette;
const vec2 u_lightPos=vec2(.89,.46);
uniform float u_lightCore;
uniform float u_lightHalo;
const float u_bloomThreshold=.61;
const float u_bloomRange=.18;
out vec4 fragColor;

vec3 mod289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289v4(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289v4(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}

float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);
  const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289v3(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;
  vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

float hash(vec2 p){
  vec3 p3=fract(vec3(p.xyx)*.1031);
  p3+=dot(p3,p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}

float fbm(vec3 p){
  float v=0.,amp=.6;vec3 shift=vec3(100.);
  for(int i=0;i<1;i++){v+=amp*snoise(p);p=p*2.+shift;amp*=.4;}
  return v;
}

float fluidNoise(vec2 uv){
  float n1=fbm(vec3(uv*.6,0.) + vec3(u_loop1.y,0.,u_loop1.x));
  float n2=fbm(vec3(uv*.6+5.2,1.3) + vec3(0.,u_loop1.y,u_loop1.x));
  vec2 w1=vec2(n1,n2)*.6;
  float n3=fbm(vec3((uv+w1)*.7+1.7,3.1) + vec3(u_loop2.y,0.,u_loop2.x));
  float n4=fbm(vec3((uv+w1)*.7+9.2,5.7) + vec3(0.,u_loop2.y,u_loop2.x));
  vec2 w2=vec2(n3,n4)*.5;
  return fbm(vec3((uv+w1+w2)*.5,0.) + vec3(u_loop3.y,0.,u_loop3.x));
}

vec2 curlish(vec2 uv){
  float eps=.02;
  float n=snoise(vec3(uv*.8,0.) + vec3(0.,u_loop3.y,u_loop3.x));
  float nx=snoise(vec3((uv+vec2(eps,0.))*.8,0.) + vec3(0.,u_loop3.y,u_loop3.x));
  float ny=snoise(vec3((uv+vec2(0.,eps))*.8,0.) + vec3(0.,u_loop3.y,u_loop3.x));
  return vec2(-(ny-n)/eps,(nx-n)/eps)*.003;
}

void main(){
  float aspect=u_resolution.x/u_resolution.y;
  vec2 uv=gl_FragCoord.xy/u_resolution;
  vec2 suv=vec2(uv.x*aspect, uv.y) * u_scale + u_offset;

  vec2 curl=curlish(suv);
  vec2 uvD=suv+curl*12.;
  float f=fluidNoise(uvD);
  float swirl=snoise(vec3(uvD*.8+f*1.5,0.) + vec3(u_loop4.y,0.,u_loop4.x))*.5+.5;
  float n=f*.5+.5;
  vec3 col=mix(u_c1,u_c2,smoothstep(.2,.5,n));
  col=mix(col,u_c3,smoothstep(.35,.65,n+swirl*.25));
  col=mix(col,u_c4,smoothstep(.6,.85,swirl)*.55);
  col=mix(col,u_c5,smoothstep(.5,.8,n*swirl)*.35);

  if(u_grain>0.0){
    vec2 flowOffset = (uvD - suv) * u_grainResolution.y;
    vec2 gp = floor((uv * u_grainResolution + flowOffset) / 5.0);
    float gr=hash(gp)*2.-1.;
    col+=gr*u_grain;
  }

  float luma=dot(col,vec3(.299,.587,.114));
  float bloom=smoothstep(u_bloomThreshold-u_bloomRange,u_bloomThreshold+u_bloomRange,luma);
  col+=(col*.85+vec3(.15,.145,.13))*bloom*u_bloomStrength;

  float ld=length((uv-u_lightPos)*vec2(aspect,1.));
  float core=exp(-ld*ld*4.5);
  float halo=exp(-ld*1.8);
  col+=vec3(1.,.97,.9)*core*u_lightCore+vec3(.72,.8,1.)*halo*u_lightHalo;

  float vig=1.-smoothstep(.35,.75,length(uv-.5));
  col=mix(col*(1.-u_vignette),col,vig);
  fragColor=vec4(col,1.);
}
`;

    /** Loop periods and radii of the official animation. */
    const LOOP_PERIODS = [3000, 3300, 3900, 4200];
    const LOOP_RADII = [0.0102, 0.0085, 0.17 * 0.04, 0.17 * 0.035];
    const TWO_PI = Math.PI * 2;

    /** Frame budget of the official animation: 30 frames per second. */
    const FRAME_INTERVAL = 1000 / 30;

    /** Visible strings of the studio, per language. */
    const DICTIONARIES = {
      en: {
        open: 'Poster',
        openTitle: 'Open the poster studio',
        studio: 'Poster Studio',
        saved: 'Saved',
        clearLibrary: 'Clear library',
        libraryCleared: 'Export library cleared',
        exportAll: 'Export all sizes',
        exportAllHint: 'Render every preset size and save them all into one folder.',
        exportAllProgress: 'Rendering',
        exportAllDone: 'All sizes exported',
        lock: 'Lock layer',
        unlock: 'Unlock layer',
        lockedLayer: 'This layer is locked and cannot be dragged.',
        outline: 'Outline',
        outlineColor: 'Outline color',
        shadow: 'Shadow',
        bgImage: 'Background image',
        bgImageRemove: 'Remove',
        bgOpacity: 'Opacity',
        versions: 'Versions',
        saveVersion: 'Save this design as a named version',
        versionSaved: 'Version saved',
        versionLoaded: 'Version loaded',
        versionsEmpty: 'No saved versions yet.',
        applyPalette: 'Apply this palette.',
        deletePalette: 'Click to delete this custom palette.',
        savePalette: 'Save current colours as a palette',
        paletteSaved: 'Palette saved',
        weight: 'Weight',
        font: 'Font',
        fontDefault: 'Default',
        italic: 'Italic',
        underline: 'Underline',
        letterSpacing: 'Spacing',
        lineHeight: 'Height',
        opacity: 'Opacity',
        layerTitle: 'Title',
        layerSubtitle: 'Subtitle',
        layerFooter: 'Footer',
        textLayer: 'Text',
        addText: 'Add text',
        removeLayer: 'Remove layer',
        imageLayer: 'Image',
        addImage: 'Add image',
        replaceImage: 'Replace',
        moveUp: 'Move up',
        moveDown: 'Move down',
        imageWidth: 'Width',
        qrLayer: 'QR',
        addQr: 'Add QR',
        qrValue: 'Link or text',
        qrColor: 'QR color',
        badgeLayer: 'Badge',
        addBadge: 'Add badge',
        badgeText: 'Badge text',
        textColor: 'Text color',
        bgColor: 'Background',
        studioFloatHint: 'The poster studio opens as a floating window.',
        close: 'Close',
        export: 'Export PNG',
        reset: 'Reset',
        undo: 'Undo',
        redo: 'Redo',
        content: 'Content',
        palette: 'Palette',
        backdrop: 'Backdrop',
        allSizes: 'Show all size previews',
        customSize: 'Custom size',
        customSizeHint: 'Each side 200–4000 px',
        canvasWidth: 'Width',
        canvasHeight: 'Height',
        cancel: 'Cancel',
        apply: 'Apply',
        title: 'Headline',
        subtitle: 'Subtitle',
        footer: 'Footer',
        fontSize: 'Font size',
        exported: 'Saved to',
        askAi: 'AI copy',
        variants: 'Variants',
        variantsTab: 'Variants',
        library: 'Library',
        importPreset: 'Import',
        exportPreset: 'Export',
        applyVariant: 'Apply',
        noExports: 'Nothing exported yet.',
        fullscreen: 'Full screen',
        restore: 'Restore',
      },
      zh: {
        open: '海报',
        openTitle: '打开海报创作',
        studio: '海报创作',
        saved: '已保存',
        clearLibrary: '清空图库',
        exportAll: '导出全部尺寸',
        exportAllHint: '把 5 种预设尺寸全部渲染，一次性保存到同一个文件夹。',
        exportAllProgress: '正在渲染',
        exportAllDone: '全部尺寸已导出',
        lock: '锁定图层',
        unlock: '解锁图层',
        lockedLayer: '图层已锁定，不能拖动。',
        outline: '描边',
        outlineColor: '描边颜色',
        shadow: '阴影',
        bgImage: '背景图',
        bgImageRemove: '移除背景',
        bgOpacity: '背景透明度',
        versions: '历史版本',
        saveVersion: '把当前设计保存为命名版本',
        versionSaved: '版本已保存',
        versionLoaded: '版本已载入',
        versionsEmpty: '还没有保存的版本。',
        applyPalette: '应用此配色。',
        deletePalette: '点击删除此自定义配色。',
        savePalette: '把当前颜色保存为配色方案',
        paletteSaved: '配色已保存',
        libraryCleared: '图库已清空',
        weight: '字重',
        font: '字体',
        fontDefault: '默认（官方）',
        italic: '斜体',
        underline: '下划线',
        letterSpacing: '字距',
        lineHeight: '行高',
        opacity: '透明度',
        layerTitle: '标题',
        layerSubtitle: '副标题',
        layerFooter: '落款',
        textLayer: '文本',
        addText: '添加文本',
        removeLayer: '删除该层',
        imageLayer: '图片',
        addImage: '添加图片',
        replaceImage: '更换图片',
        moveUp: '上移',
        moveDown: '下移',
        imageWidth: '宽度',
        qrLayer: '二维码',
        addQr: '添加二维码',
        qrValue: '链接或文本',
        qrColor: '二维码颜色',
        badgeLayer: '角标',
        addBadge: '添加角标',
        badgeText: '角标文字',
        textColor: '文字颜色',
        bgColor: '背景色',
        studioFloatHint: '海报创作以浮动窗口打开，不会占用会话区。',
        close: '关闭',
        export: '导出 PNG',
        reset: '重置',
        undo: '撤销',
        redo: '重做',
        content: '内容',
        palette: '配色',
        backdrop: '背景',
        allSizes: '显示全部尺寸画面',
        customSize: '自定义尺寸',
        customSizeHint: '每边 200–4000 像素',
        canvasWidth: '宽',
        canvasHeight: '高',
        cancel: '取消',
        apply: '应用',
        title: '标题',
        subtitle: '副标题',
        footer: '落款',
        fontSize: '字号',
        exported: '已保存到',
        askAi: 'AI 文案',
        variants: '批量变体',
        variantsTab: '变体',
        library: '图库',
        importPreset: '导入',
        exportPreset: '导出',
        applyVariant: '应用',
        noExports: '还没有导出过海报。',
        fullscreen: '全屏',
        restore: '还原',
      },
    };

    /** Split Latin runs out of a line, the way the official page does. */
    const LATIN_RUN = /([\p{Script=Latin}\p{M}\p{N}]+)/u;

    /** A CJK character counts as its own wrapping token. */
    const CJK_CHAR = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;

    /**
     * Normalise one colour value.
     * @param {unknown} value - candidate colour.
     * @returns {string | undefined} a #rrggbb or #rrggbbaa colour, when the value is one.
     */
    function normalizeColor(value) {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(trimmed) ? trimmed.toLowerCase() : undefined;
    }

    /**
     * Merge one partial specification into a complete one.
     * @param {Record<string, any>} base - specification to start from.
     * @param {Record<string, any>} patch - partial specification.
     * @returns {Record<string, any>} the merged specification.
     */
    function mergeSpec(base, patch) {
      const next = {
        version: 1,
        size: base.size,
        layers: base.layers.map((layer) => ({ ...layer })),
        colors: { ...base.colors },
        shader: { ...base.shader },
        background: { ...(base.background ?? {}) },
      };
      if (!patch || typeof patch !== 'object') return next;
      if (patch.background && typeof patch.background === 'object') {
        if (typeof patch.background.image === 'string' && patch.background.image.startsWith('data:image/')) {
          next.background.image = patch.background.image;
        }
        if (typeof patch.background.opacity === 'number' && Number.isFinite(patch.background.opacity)) {
          next.background.opacity = Math.min(1, Math.max(0, patch.background.opacity));
        }
      }
      if (typeof patch.size === 'string' && (SIZES[patch.size] || CUSTOM_SIZE_RE.test(patch.size))) next.size = patch.size;
      if (patch.colors && typeof patch.colors === 'object') {
        for (const key of COLOR_KEYS) {
          const color = normalizeColor(patch.colors[key]);
          if (color !== undefined) next.colors[key] = color;
        }
      }
      if (patch.shader && typeof patch.shader === 'object') {
        for (const key of Object.keys(next.shader)) {
          const value = patch.shader[key];
          if (typeof next.shader[key] === 'boolean') {
            if (typeof value === 'boolean') next.shader[key] = value;
          } else if (typeof value === 'number' && Number.isFinite(value)) {
            next.shader[key] = value;
          }
        }
      }
      if (Array.isArray(patch.layers)) {
        const GENERIC = { id: 'text', text: '', size: 28, weight: 400, align: 'center', x: 0.5, y: 0.68, color: '#ffffff', lineHeight: 1.4, letterSpacing: 0, maxWidth: 0.8 };
        const merged = [];
        for (const entry of patch.layers) {
          if (!entry || typeof entry !== 'object') continue;
          const fallback = base.layers.find((candidate) => candidate.id === entry.id) ?? GENERIC;
          const layer = { ...fallback };
          if (typeof entry.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(entry.id)) layer.id = entry.id;
          if (typeof entry.text === 'string') layer.text = entry.text;
          if (typeof entry.size === 'number' && Number.isFinite(entry.size)) layer.size = Math.min(400, Math.max(8, Math.round(entry.size)));
          if (typeof entry.weight === 'number' && entry.weight >= 100 && entry.weight <= 900) layer.weight = Math.round(entry.weight);
          if (entry.align === 'left' || entry.align === 'center' || entry.align === 'right') layer.align = entry.align;
          if (typeof entry.x === 'number' && entry.x >= 0 && entry.x <= 1) layer.x = entry.x;
          if (typeof entry.y === 'number' && entry.y >= 0 && entry.y <= 1) layer.y = entry.y;
          const color = normalizeColor(entry.color);
          if (color !== undefined) layer.color = color;
          if (typeof entry.lineHeight === 'number' && entry.lineHeight >= 0.8 && entry.lineHeight <= 3) layer.lineHeight = entry.lineHeight;
          if (typeof entry.letterSpacing === 'number' && entry.letterSpacing >= -10 && entry.letterSpacing <= 40) layer.letterSpacing = entry.letterSpacing;
          if (typeof entry.maxWidth === 'number' && entry.maxWidth >= 0.2 && entry.maxWidth <= 1) layer.maxWidth = entry.maxWidth;
          if (entry.kind === 'text' || entry.kind === 'image' || entry.kind === 'qr' || entry.kind === 'badge') layer.kind = entry.kind;
          if (typeof entry.src === 'string' && entry.src.startsWith('data:image/')) layer.src = entry.src;
          if (typeof entry.width === 'number' && entry.width >= 0.02 && entry.width <= 1.5) layer.width = entry.width;
          if (typeof entry.opacity === 'number' && entry.opacity >= 0 && entry.opacity <= 1) layer.opacity = entry.opacity;
          if (typeof entry.value === 'string' && entry.value.length <= 2000) layer.value = entry.value;
          const textColor = normalizeColor(entry.textColor);
          if (textColor !== undefined) layer.textColor = textColor;
          if (typeof entry.italic === 'boolean') layer.italic = entry.italic;
          if (typeof entry.underline === 'boolean') layer.underline = entry.underline;
          if (typeof entry.locked === 'boolean') layer.locked = entry.locked;
          if (typeof entry.outline === 'number' && Number.isFinite(entry.outline)) layer.outline = Math.min(1, Math.max(0, entry.outline));
          if (typeof entry.shadow === 'number' && Number.isFinite(entry.shadow)) layer.shadow = Math.min(1, Math.max(0, entry.shadow));
          const outlineColor = normalizeColor(entry.outlineColor);
          if (outlineColor !== undefined) layer.outlineColor = outlineColor;
          if (typeof entry.font === 'string') layer.font = entry.font;
          if (merged.some((done) => done.id === layer.id)) continue;
          merged.push(layer);
          if (merged.length >= 12) break;
        }
        if (merged.length > 0) next.layers = merged;
      }
      return next;
    }

    /**
     * Build a default specification.
     * @returns {Record<string, any>} the default specification.
     */
    function defaultSpec() {
      return {
        version: 1,
        size: '1080x1350',
        layers: [
          { id: 'title', text: '一切皆插件', size: 96, weight: 500, align: 'center', x: 0.5, y: 0.42, color: '#ffffff', lineHeight: 1.16, letterSpacing: 0, maxWidth: 0.8 },
          { id: 'subtitle', text: '', size: 34, weight: 400, align: 'center', x: 0.5, y: 0.56, color: '#ffffffc2', lineHeight: 1.6, letterSpacing: 0, maxWidth: 0.7 },
          { id: 'footer', text: '', size: 24, weight: 400, align: 'center', x: 0.5, y: 0.92, color: '#ffffff8c', lineHeight: 1.4, letterSpacing: 0, maxWidth: 0.8 },
        ],
        colors: { ...DEFAULT_COLORS },
        shader: {
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
        },
      };
    }

    /**
     * The studio store shared by the panel, the composer control, and the
     * tool view.
     */
    const store = {
      spec: defaultSpec(),
      remote: undefined,
      lastRemote: '',
      history: [],
      future: [],
      /** Named snapshots kept across sessions. */
      versions: [],
      versionsLoaded: false,
      customPaletteMap: {},
      customPalettes: [],
      library: [],
      variants: [],
      listeners: new Set(),
      translate: (key) => key,
      pickerActive: false,
      lastPickerAt: 0,
      /**
       * Subscribe to store changes.
       * @param {() => void} listener - change listener.
       * @returns {() => void} the unsubscribe function.
       */
      subscribe(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
      },
      /** Notify every listener. */
      emit() {
        for (const listener of Array.from(this.listeners)) {
          try { listener(); } catch { /* one broken listener must not stop the rest */ }
        }
      },
      /**
       * Replace the specification and notify every listener.
       * @param {Record<string, any>} patch - partial specification.
       * @param {boolean} remember - whether the change joins the undo history.
       * @param {boolean} sync - whether the change is pushed to the Host.
       */
      applySpec(patch, remember = true, sync = true) {
        const next = mergeSpec(this.spec, patch);
        if (JSON.stringify(next) === JSON.stringify(this.spec)) return;
        if (remember) {
          this.history.push(JSON.stringify(this.spec));
          if (this.history.length > 60) this.history.shift();
          this.future.length = 0;
        }
        this.spec = next;
        this.emit();
        if (sync) void this.push();
      },
      /**
       * Start a drag transaction: the next changes join one undo step.
       */
      beginTransaction() {
        this.transaction = JSON.stringify(this.spec);
      },
      /**
       * Finish a drag transaction and push it to the Host once.
       */
      commitTransaction() {
        const start = this.transaction;
        this.transaction = undefined;
        if (start === undefined) return;
        if (start === JSON.stringify(this.spec)) return;
        this.history.push(start);
        if (this.history.length > 60) this.history.shift();
        this.future.length = 0;
        void this.push();
      },
      /**
       * Replace the whole specification without touching the history.
       * @param {Record<string, any>} spec - complete specification.
       */
      replaceSpec(spec) {
        const next = mergeSpec(defaultSpec(), spec);
        if (JSON.stringify(next) === JSON.stringify(this.spec)) return;
        this.spec = next;
        this.emit();
      },
      /** Undo the last committed change. */
      undo() {
        const previous = this.history.pop();
        if (previous === undefined) return;
        this.future.push(JSON.stringify(this.spec));
        this.spec = JSON.parse(previous);
        this.emit();
        void this.push();
      },
      /** Redo the last undone change. */
      redo() {
        const next = this.future.pop();
        if (next === undefined) return;
        this.history.push(JSON.stringify(this.spec));
        this.spec = JSON.parse(next);
        this.emit();
        void this.push();
      },
      /** Fetch named versions from the Host once. */
      async loadVersions() {
        if (this.versionsLoaded || !this.remote) return;
        try {
          const response = await fetch('/poster-studio/versions');
          if (response.ok) {
            const data = await response.json();
            this.versions = Array.isArray(data.versions) ? data.versions : [];
            this.versionsLoaded = true;
            this.emit();
          }
        } catch { /* versions stay unavailable */ }
      },
      /**
       * Save the current specification as a named version.
       * @param {string} name - version name.
       * @param {string} thumb - small preview data URL for the picker.
       * @returns {Promise<boolean>} whether the Host accepted it.
       */
      async saveVersion(name, thumb = '') {
        try {
          const response = await fetch('/poster-studio/versions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, spec: this.spec, thumb }),
          });
          if (!response.ok) return false;
          const data = await response.json();
          this.versions = Array.isArray(data.versions) ? data.versions : this.versions;
          this.versionsLoaded = true;
          this.emit();
          return true;
        } catch { return false; }
      },
      /**
       * Remove one named version.
       * @param {string} id - version id.
       * @returns {Promise<void>} resolves when the Host replied.
       */
      async deleteVersion(id) {
        try {
          const response = await fetch(`/poster-studio/version?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
          if (response.ok) {
            const data = await response.json();
            this.versions = Array.isArray(data.versions) ? data.versions : this.versions;
            this.emit();
          }
        } catch { /* keep the list */ }
      },
      /**
       * Send the current specification to the Host.
       * @returns {Promise<boolean>} whether the Host accepted it.
       */
      async push() {
        if (!this.remote) return false;
        const payload = JSON.stringify(this.spec);
        try {
          const response = await fetch('/poster-studio/spec', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: payload,
          });
          if (!response.ok) return false;
          this.lastRemote = await response.text();
          return true;
        } catch (error) {
          console.warn('poster-studio: the poster design could not be saved', error);
          return false;
        }
      },
      /**
       * Read the current specification from the Host.
       * @returns {Promise<boolean>} whether the Host answered with a change.
       */
      async pull() {
        if (!this.remote) return false;
        try {
          const response = await fetch('/poster-studio/spec', { headers: { accept: 'application/json' } });
          if (!response.ok) return false;
          const text = await response.text();
          if (text === this.lastRemote) return false;
          this.lastRemote = text;
          this.spec = mergeSpec(defaultSpec(), JSON.parse(text));
          this.emit();
          return true;
        } catch (error) {
          if (!this.warned) {
            this.warned = true;
            console.warn('poster-studio: the poster design could not be read', error);
          }
          return false;
        }
      },
    };

    /**
     * Build one batch of poster variants: palette rotation crossed with a
     * few layout moves.
     * @param {Record<string, any>} spec - the specification to vary.
     * @param {number} count - how many variants to build.
     * @returns {Record<string, any>[]} the variant specifications.
     */
    function buildVariants(spec, count) {
      const layouts = [
        { align: 'center', x: 0.5, y: 0.42, scale: 1 },
        { align: 'left', x: 0.28, y: 0.72, scale: 0.86 },
        { align: 'right', x: 0.72, y: 0.34, scale: 0.94 },
        { align: 'center', x: 0.5, y: 0.5, scale: 1.18 },
        { align: 'left', x: 0.22, y: 0.3, scale: 1.06 },
        { align: 'right', x: 0.78, y: 0.78, scale: 0.8 },
      ];
      const variants = [];
      for (let index = 0; index < count; index += 1) {
        const palette = PALETTES[index % PALETTES.length];
        const layout = layouts[index % layouts.length];
        variants.push({
          ...spec,
          colors: { ...palette.colors },
          layers: spec.layers.map((layer) => (
            layer.id === 'title'
              ? { ...layer, align: layout.align, x: layout.x, y: layout.y, size: Math.round(layer.size * layout.scale) }
              : { ...layer, align: layout.align, x: layout.x }
          )),
        });
      }
      return variants;
    }

    /**
     * Render one batch of variants into small preview canvases. One WebGL
     * context renders them in turn, so a batch never exhausts the browser's
     * context budget.
     * @param {Record<string, any>[]} variants - the variant specifications.
     * @param {number} width - the preview width.
     * @param {number} height - the preview height.
     * @returns {Promise<HTMLCanvasElement[]>} one canvas per variant.
     */
    async function renderVariants(variants, width, height) {
      const preset = parseSize(variants[0]?.size);
      await Promise.all([
        ...variants.map((variant) => preloadSpecImages(variant)),
        ...variants.map((variant) => preloadSpecFonts(variant)),
      ]);
      const renderer = createRenderer();
      const outputs = [];
      try {
        for (const variant of variants) {
          renderer.setSize(width, height, preset.width, preset.height);
          renderer.applySpec(variant);
          // Give WebGL one animation frame to paint, otherwise the canvas
          // copy below comes back black.
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const output = document.createElement('canvas');
          output.width = width;
          output.height = height;
          const context = output.getContext('2d');
          context.drawImage(renderer.background, 0, 0, width, height);
          context.drawImage(renderer.text, 0, 0, width, height);
          outputs.push(output);
        }
      } finally {
        renderer.dispose();
      }
      return outputs;
    }

    /**
     * Build the font shorthand for one segment.
     * @param {Record<string, any>} layer - the text layer.
     * @param {boolean} latin - whether the segment is a Latin run.
     * @returns {string} the CSS font shorthand.
     */
    function fontFor(layer, latin) {
      const base = latin ? LATIN_STACK : FONT_STACK;
      const option = FONT_OPTIONS[layer.font];
      return `${layer.italic ? 'italic ' : ''}${layer.weight} ${layer.size}px ${option ? `${option.css}, ${base}` : base}`;
    }

    /**
     * Split one line into Latin and non-Latin runs.
     * @param {string} text - the line.
     * @returns {Array<[string, boolean]>} the runs with their Latin flag.
     */
    function segmentsOf(text) {
      const parts = String(text).split(LATIN_RUN);
      const runs = [];
      parts.forEach((part, index) => {
        if (part.length > 0) runs.push([part, index % 2 === 1]);
      });
      return runs;
    }

    /**
     * Split one paragraph into wrapping tokens.
     * @param {string} text - the paragraph.
     * @returns {string[]} the tokens.
     */
    function tokenize(text) {
      const tokens = [];
      let buffer = '';
      for (const character of text) {
        if (CJK_CHAR.test(character)) {
          if (buffer.length > 0) { tokens.push(buffer); buffer = ''; }
          tokens.push(character);
        } else {
          buffer += character;
        }
      }
      if (buffer.length > 0) tokens.push(buffer);
      return tokens;
    }

    /**
     * Measure the width of one line.
     * @param {CanvasRenderingContext2D} ctx - the drawing context.
     * @param {Record<string, any>} layer - the text layer.
     * @param {string} line - the line to measure.
     * @returns {number} the width in pixels.
     */
    function measureLine(ctx, layer, line) {
      let total = 0;
      for (const [text, latin] of segmentsOf(line)) {
        ctx.font = fontFor(layer, latin);
        total += ctx.measureText(text).width;
      }
      return total;
    }

    /**
     * Wrap one layer's text into lines.
     * @param {CanvasRenderingContext2D} ctx - the drawing context.
     * @param {Record<string, any>} layer - the text layer.
     * @param {number} width - the canvas width.
     * @returns {string[]} the wrapped lines.
     */
    function wrapLines(ctx, layer, width) {
      const limit = Math.max(40, width * layer.maxWidth);
      const lines = [];
      for (const paragraph of String(layer.text).split('\n')) {
        if (paragraph.length === 0) { lines.push(''); continue; }
        let current = '';
        for (const token of tokenize(paragraph)) {
          const candidate = current + token;
          if (current.length > 0 && measureLine(ctx, layer, candidate) > limit) {
            lines.push(current);
            current = token;
          } else {
            current = candidate;
          }
        }
        lines.push(current);
      }
      return lines;
    }

    /**
     * Draw one layer's text.
     * @param {CanvasRenderingContext2D} ctx - the drawing context.
     * @param {Record<string, any>} layer - the text layer.
     * @param {string[]} lines - the wrapped lines.
     * @param {number} width - the canvas width.
     * @param {number} height - the canvas height.
     * @returns {{ x: number, y: number, width: number, height: number }} the drawn bounds.
     */
    function drawLayer(ctx, layer, lines, width, height) {
      const lineHeight = layer.size * layer.lineHeight;
      const blockHeight = lines.length * lineHeight;
      const top = layer.y * height - blockHeight / 2;
      let baseline = top + layer.size * 0.78;
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      const outline = Math.max(0, Number(layer.outline) || 0);
      const shadow = Math.max(0, Number(layer.shadow) || 0);
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      if (shadow > 0) {
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = layer.size * 0.22 * shadow;
        ctx.shadowOffsetY = layer.size * 0.05;
      }
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${layer.letterSpacing}px`;
      for (const line of lines) {
        const lineWidth = measureLine(ctx, layer, line);
        let x = layer.align === 'left' ? width * (layer.x - layer.maxWidth / 2)
          : layer.align === 'right' ? width * (layer.x + layer.maxWidth / 2) - lineWidth
            : width * layer.x - lineWidth / 2;
        const lineStart = x;
        for (const [text, latin] of segmentsOf(line)) {
          ctx.font = fontFor(layer, latin);
          if (outline > 0) {
            ctx.lineJoin = 'round';
            ctx.strokeStyle = layer.outlineColor || '#000000';
            ctx.lineWidth = outline * layer.size * 0.1;
            ctx.textAlign = 'left';
            ctx.strokeText(text, x, baseline);
          }
          ctx.fillStyle = layer.color;
          ctx.textAlign = 'left';
          ctx.fillText(text, x, baseline);
          x += ctx.measureText(text).width;
        }
        if (layer.underline && line.length > 0) {
          ctx.save();
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.fillStyle = layer.color;
          ctx.fillRect(lineStart, baseline + layer.size * 0.14, x - lineStart, Math.max(1, layer.size * 0.06));
          ctx.restore();
        }
        if (lineStart < minX) minX = lineStart;
        if (x > maxX) maxX = x;
        baseline += lineHeight;
      }
      ctx.restore();
      const bottom = baseline - lineHeight + layer.size * 0.26;
      const left = Number.isFinite(minX) ? minX : 0;
      const right = Number.isFinite(maxX) ? maxX : left;
      return {
        x: left,
        y: top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
    }

    /** Decoded images shared across renderers, keyed by data URL. */
    const imageCache = new Map();

    /** qrcode-generator (MIT), inlined at build time; see NOTICE. */
    const qrcodeLib = __QRCODE_LIB__;

    /** Encoded QR matrices keyed by text. */
    const qrCache = new Map();

    /**
     * Encode text into a QR module matrix once and share it.
     * @param {string} value - the text to encode.
     * @returns {{ count: number, rows: boolean[][] } | null} the matrix, or null when empty or too long.
     */
    function cachedQr(value) {
      const text = typeof value === 'string' ? value.trim() : '';
      if (text.length === 0) return null;
      if (qrCache.has(text)) return qrCache.get(text);
      let matrix = null;
      try {
        const code = qrcodeLib(0, 'M');
        code.addData(text);
        code.make();
        const count = code.getModuleCount();
        const rows = [];
        for (let row = 0; row < count; row += 1) {
          const line = [];
          for (let col = 0; col < count; col += 1) line.push(code.isDark(row, col));
          rows.push(line);
        }
        matrix = { count, rows };
      } catch (error) {
        matrix = null;
      }
      qrCache.set(text, matrix);
      return matrix;
    }

    /**
     * Decode one data-URL image once and share it across renderers.
     * @param {string} src - the data URL.
     * @param {() => void} [onReady] - called once when decoding finished.
     * @returns {HTMLImageElement | null} the image when already decoded.
     */
    function cachedImage(src, onReady) {
      if (typeof src !== 'string' || src.length === 0) return null;
      let entry = imageCache.get(src);
      if (!entry) {
        entry = { image: new Image(), ready: false, waiters: new Set() };
        entry.image.onload = () => {
          entry.ready = true;
          for (const waiter of entry.waiters) waiter();
          entry.waiters.clear();
        };
        entry.image.src = src;
        imageCache.set(src, entry);
      }
      if (entry.ready) return entry.image;
      if (onReady) entry.waiters.add(onReady);
      return null;
    }

    /**
     * Wait until every image layer of a specification can be drawn.
     * @param {Record<string, any>} spec - the specification.
     * @returns {Promise<void>} resolves when decoded or failed.
     */
    function preloadSpecImages(spec) {
      const sources = (spec.layers ?? [])
        .filter((layer) => layer.kind === 'image' && typeof layer.src === 'string' && layer.src.length > 0)
        .map((layer) => layer.src);
      if (spec.background && typeof spec.background.image === 'string' && spec.background.image.length > 0) {
        sources.push(spec.background.image);
      }
      return Promise.all(sources.map((src) => new Promise((resolve) => {
        if (cachedImage(src, resolve)) resolve();
      }))).then(() => undefined);
    }

    /**
     * Render every layer (text and image) of one specification.
     * @param {CanvasRenderingContext2D} ctx - the drawing context.
     * @param {Record<string, any>} spec - the specification.
     * @param {number} width - the canvas width.
     * @param {number} height - the canvas height.
     * @param {() => void} [onImageReady] - repaint hook for late images.
     * @returns {Array<{ id: string, x: number, y: number, width: number, height: number }>} the layer bounds.
     */
    function renderText(ctx, spec, width, height, onImageReady, loadedFonts) {
      ctx.clearRect(0, 0, width, height);
      const layout = [];
      const fontState = loadedFonts ?? new Set();
      for (const layer of spec.layers) {
        if (layer.text && FONT_OPTIONS[layer.font] && onImageReady && !fontState.has(layer.font)) {
          const pending = ensureOnlineFont(layer, onImageReady);
          if (pending) {
            fontState.add(layer.font);
            pending.then(onImageReady);
          }
        }
        if (layer.kind === 'image') {
          const image = cachedImage(layer.src, onImageReady);
          if (!image) continue;
          const drawWidth = Math.max(4, (layer.width ?? 0.3) * width);
          const ratio = image.naturalWidth > 0 ? image.naturalHeight / image.naturalWidth : 1;
          const drawHeight = Math.max(4, drawWidth * ratio);
          const left = layer.x * width - drawWidth / 2;
          const top = layer.y * height - drawHeight / 2;
          ctx.save();
          ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity ?? 1));
          ctx.drawImage(image, left, top, drawWidth, drawHeight);
          ctx.restore();
          layout.push({ id: layer.id, x: left, y: top, width: drawWidth, height: drawHeight });
          continue;
        }
        if (layer.kind === 'badge') {
          if (!layer.text) continue;
          const padding = layer.size * 0.62;
          const badgeWidth = Math.max(layer.size, measureLine(ctx, layer, layer.text)) + padding * 2;
          const badgeHeight = layer.size * 1.34;
          const badgeLeft = layer.x * width - badgeWidth / 2;
          const badgeTop = layer.y * height - badgeHeight / 2;
          ctx.save();
          ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity ?? 1));
          ctx.beginPath();
          ctx.roundRect(badgeLeft, badgeTop, badgeWidth, badgeHeight, badgeHeight / 2);
          ctx.fillStyle = normalizeColor(layer.color) || '#ffffff';
          ctx.fill();
          ctx.fillStyle = normalizeColor(layer.textColor) || '#141414';
          ctx.font = fontFor(layer, false);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(layer.text, layer.x * width, badgeTop + badgeHeight / 2 + layer.size * 0.06);
          ctx.restore();
          layout.push({ id: layer.id, x: badgeLeft, y: badgeTop, width: badgeWidth, height: badgeHeight });
          continue;
        }
        if (layer.kind === 'qr') {
          const qr = cachedQr(layer.value);
          if (!qr) continue;
          const quiet = 2;
          const cell = Math.max(1, Math.max(24, (layer.width ?? 0.25) * width) / (qr.count + quiet * 2));
          const drawWidth = cell * (qr.count + quiet * 2);
          const qrLeft = layer.x * width - drawWidth / 2;
          const qrTop = layer.y * height - drawWidth / 2;
          ctx.save();
          ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity ?? 1));
          const background = layer.bg === 'none' ? '' : normalizeColor(layer.bg) || '#ffffff';
          if (background !== '') {
            ctx.fillStyle = background;
            ctx.fillRect(qrLeft, qrTop, drawWidth, drawWidth);
          }
          ctx.fillStyle = normalizeColor(layer.color) || '#000000';
          for (let row = 0; row < qr.count; row += 1) {
            for (let col = 0; col < qr.count; col += 1) {
              if (!qr.rows[row][col]) continue;
              ctx.fillRect(qrLeft + (col + quiet) * cell, qrTop + (row + quiet) * cell, cell + 0.4, cell + 0.4);
            }
          }
          ctx.restore();
          layout.push({ id: layer.id, x: qrLeft, y: qrTop, width: drawWidth, height: drawWidth });
          continue;
        }
        if (!layer.text) continue;
        const lines = wrapLines(ctx, layer, width);
        const bounds = drawLayer(ctx, layer, lines, width, height);
        layout.push({ id: layer.id, ...bounds });
      }
      return layout;
    }

    /**
     * Create one renderer: a WebGL backdrop plus a Canvas 2D text layer.
     * @returns {Record<string, any>} the renderer.
     */
    function createRenderer() {
      const background = document.createElement('canvas');
      const text = document.createElement('canvas');
      background.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      text.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      let gl = null;
      let program = null;
      let locations = null;
      let width = 0;
      let height = 0;
      let posterWidth = 0;
      let posterHeight = 0;
      let layout = [];
      let spec = defaultSpec();
      let raf = 0;
      let aligned = 0;
      let previous = 0;
      let onScreen = true;
      let running = true;
      const loops = LOOP_PERIODS.map((period, index) => ({
        period,
        elapsed: 0,
        radius: LOOP_RADII[index] * period / TWO_PI,
      }));
      const textContext = text.getContext('2d');
      const loadedFonts = new Set();

      const compile = (type, source) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const initGl = () => {
        gl = background.getContext('webgl2', {
          alpha: true,
          premultipliedAlpha: false,
          antialias: false,
          depth: false,
          powerPreference: 'low-power',
          failIfMajorPerformanceCaveat: true,
        });
        if (!gl) return false;
        const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
        const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        if (!vertex || !fragment) return false;
        program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
        gl.useProgram(program);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        locations = {
          resolution: gl.getUniformLocation(program, 'u_resolution'),
          grainResolution: gl.getUniformLocation(program, 'u_grainResolution'),
          lightCore: gl.getUniformLocation(program, 'u_lightCore'),
          lightHalo: gl.getUniformLocation(program, 'u_lightHalo'),
          scale: gl.getUniformLocation(program, 'u_scale'),
          offset: gl.getUniformLocation(program, 'u_offset'),
          grain: gl.getUniformLocation(program, 'u_grain'),
          bloom: gl.getUniformLocation(program, 'u_bloomStrength'),
          vignette: gl.getUniformLocation(program, 'u_vignette'),
          loops: LOOP_PERIODS.map((_, index) => gl.getUniformLocation(program, `u_loop${index + 1}`)),
          colors: COLOR_KEYS.map((key) => gl.getUniformLocation(program, `u_${key}`)),
        };
        return true;
      };

      const applyColors = () => {
        if (!gl || !locations) return;
        COLOR_KEYS.forEach((key, index) => {
          const value = normalizeColor(spec.colors[key]) || DEFAULT_COLORS[key];
          gl.uniform3f(
            locations.colors[index],
            parseInt(value.slice(1, 3), 16) / 255,
            parseInt(value.slice(3, 5), 16) / 255,
            parseInt(value.slice(5, 7), 16) / 255,
          );
        });
      };

      const applyTuning = () => {
        if (!gl || !locations) return;
        gl.uniform1f(locations.scale, spec.shader.scale);
        gl.uniform2f(locations.offset, spec.shader.offsetX, spec.shader.offsetY);
        gl.uniform1f(locations.grain, spec.shader.grain);
        gl.uniform1f(locations.bloom, spec.shader.bloom);
        gl.uniform1f(locations.vignette, spec.shader.vignette);
        gl.uniform1f(locations.lightCore, spec.shader.lightCore);
        gl.uniform1f(locations.lightHalo, spec.shader.lightHalo);
      };

      const advance = (delta) => {
        loops.forEach((loop, index) => {
          loop.elapsed = ((loop.elapsed + delta) % loop.period + loop.period) % loop.period;
          const angle = loop.elapsed / loop.period * TWO_PI;
          const sine = Math.sin(angle);
          const cosine = Math.cos(angle);
          gl.uniform2f(locations.loops[index], loop.radius * sine, loop.radius * (1 - cosine));
        });
      };

      const drawFrame = () => {
        if (!gl || !locations) return;
        applyColors();
        applyTuning();
        gl.viewport(0, 0, width, height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        drawBgImage();
      };

      let bgSrc = '';
      let bgImage = null;

      /** Composite the optional background image over the shader at cover fit. */
      const drawBgImage = () => {
        const src = (spec.background && spec.background.image) || '';
        const alpha = Math.min(1, Math.max(0, Number((spec.background && spec.background.opacity !== undefined ? spec.background.opacity : 1))));
        if (!src || alpha <= 0.01) return;
        if (src !== bgSrc) {
          bgSrc = src;
          bgImage = cachedImage(src, repaint);
        }
        if (!bgImage) return;
        const ratio = bgImage.naturalHeight / bgImage.naturalWidth;
        const box = width / height;
        let scale;
        if (ratio > box) {
          scale = (width * ratio / height);
        } else {
          scale = (height / ratio) / width;
        }
        const drawWidth = width / scale;
        const drawHeight = drawWidth * ratio;
        const ctx = background.getContext('2d');
        if (!ctx) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(bgImage, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
        ctx.restore();
      };

      const repaint = () => {
        layout = renderText(textContext, spec, posterWidth || width, posterHeight || height, repaint, loadedFonts);
        drawFrame();
        if (layoutChange) layoutChange();
      };

      /** Listener notified after repaints recompute the text layout. */
      let layoutChange = null;

      const onVisibility = () => {
        if (!document.hidden && raf === 0) raf = requestAnimationFrame(tick);
      };

      const tick = (now) => {
        raf = 0;
        if (!running || !onScreen || document.hidden || width === 0 || height === 0) return;
        if (aligned !== 0 && now - aligned < FRAME_INTERVAL) {
          raf = requestAnimationFrame(tick);
          return;
        }
        const delta = previous !== 0 ? 0.001 * Math.min(now - previous, 100) : 0;
        aligned = aligned !== 0 ? now - ((now - aligned) % FRAME_INTERVAL) : now;
        previous = now;
        if (!spec.shader.paused) advance(delta * spec.shader.speed);
        drawFrame();
        raf = requestAnimationFrame(tick);
      };

      const observer = new IntersectionObserver((entries) => {
        onScreen = entries.length > 0 ? entries[0].isIntersecting : true;
        if (onScreen && raf === 0) raf = requestAnimationFrame(tick);
      });

      return {
        background,
        text,
        /**
         * Resize both layers. The backdrop renders at the given resolution;
         * the text layer always renders at the poster's logical size, so the
         * browser scales type exactly like the exported image does.
         * @param {number} nextWidth - the backdrop width.
         * @param {number} nextHeight - the backdrop height.
         * @param {number} logicalWidth - the poster width in poster pixels.
         * @param {number} logicalHeight - the poster height in poster pixels.
         */
        setSize(nextWidth, nextHeight, logicalWidth, logicalHeight) {
          width = Math.max(1, Math.round(nextWidth));
          height = Math.max(1, Math.round(nextHeight));
          background.width = width;
          background.height = height;
          const logicalW = Math.max(1, Math.round(logicalWidth ?? width));
          const logicalH = Math.max(1, Math.round(logicalHeight ?? height));
          posterWidth = logicalW;
          posterHeight = logicalH;
          text.width = logicalW;
          text.height = logicalH;
          if (!gl) initGl();
          if (gl && locations) {
            gl.uniform2f(locations.resolution, width, height);
            gl.uniform2f(locations.grainResolution, width, height);
          }
          layout = renderText(textContext, spec, logicalW, logicalH, repaint, loadedFonts);
          drawFrame();
        },
        /**
         * Adopt one specification and repaint.
         * @param {Record<string, any>} next - the specification.
         */
        applySpec(next) {
          spec = next;
          layout = renderText(textContext, spec, posterWidth || width, posterHeight || height, repaint, loadedFonts);
          drawFrame();
        },
        /**
         * The bounds of every drawn text layer, in poster pixels.
         * @returns {Array<{ id: string, x: number, y: number, width: number, height: number }>} the layer bounds.
         */
        layout() {
          return layout.map((entry) => {
            const layer = spec.layers.find((item) => item.id === entry.id);
            return { ...entry, locked: Boolean(layer && layer.locked) };
          });
        },
        /**
         * Subscribe to layout recomputation after asynchronous repaints.
         * @param {(() => void) | null} callback - the listener, or null to clear.
         */
        onLayoutChange(callback) {
          layoutChange = callback;
        },
        /** Start the animation loop and the visibility observer. */
        start() {
          if (!gl) initGl();
          observer.observe(background);
          document.addEventListener('visibilitychange', onVisibility);
          raf = requestAnimationFrame(tick);
        },
        /** Stop the animation loop and release every resource. */
        dispose() {
          running = false;
          if (raf !== 0) cancelAnimationFrame(raf);
          observer.disconnect();
          document.removeEventListener('visibilitychange', onVisibility);
          if (gl) {
            if (program) gl.deleteProgram(program);
            const lose = gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
          }
          gl = null;
          program = null;
          locations = null;
        },
      };
    }

    /**
     * Render one specification to a PNG blob at full resolution.
     * @param {Record<string, any>} spec - the specification.
     * @returns {Promise<Blob | null>} the rendered image.
     */
    async function renderPng(spec) {
      const preset = parseSize(spec.size);
      await Promise.all([preloadSpecImages(spec), preloadSpecFonts(spec)]);
      const renderer = createRenderer();
      try {
        renderer.setSize(preset.width, preset.height, preset.width, preset.height);
        renderer.applySpec(spec);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        renderer.setSize(preset.width, preset.height, preset.width, preset.height);
        const output = document.createElement('canvas');
        output.width = preset.width;
        output.height = preset.height;
        const context = output.getContext('2d');
        context.drawImage(renderer.background, 0, 0, preset.width, preset.height);
        context.drawImage(renderer.text, 0, 0, preset.width, preset.height);
        return await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
      } finally {
        renderer.dispose();
      }
    }

    /**
     * The poster canvas, mounted as a React component.
     * @param {{ spec: Record<string, any>, width: number, height: number }} props - component props.
     * @returns {React.ReactElement} the canvas element.
     */
    function PosterCanvas(props) {
      const hostRef = React.useRef(null);
      const rendererRef = React.useRef(null);
      const preset = parseSize(props.spec.size);

      React.useEffect(() => {
        const renderer = createRenderer();
        rendererRef.current = renderer;
        const host = hostRef.current;
        if (host) {
          host.appendChild(renderer.background);
          host.appendChild(renderer.text);
        }
        renderer.setSize(props.width, props.height, preset.width, preset.height);
        renderer.applySpec(props.spec);
        renderer.start();
        renderer.onLayoutChange(() => {
          if (props.onLayout) props.onLayout(renderer.layout());
        });
        if (props.onLayout) props.onLayout(renderer.layout());
        return () => {
          renderer.dispose();
          rendererRef.current = null;
          if (host) host.innerHTML = '';
        };
      }, []);

      React.useEffect(() => {
        rendererRef.current?.applySpec(props.spec);
        if (props.onLayout) props.onLayout(rendererRef.current?.layout() ?? []);
      }, [props.spec]);

      React.useEffect(() => {
        rendererRef.current?.setSize(props.width, props.height, preset.width, preset.height);
        if (props.onLayout) props.onLayout(rendererRef.current?.layout() ?? []);
      }, [props.width, props.height, preset.width, preset.height]);

      return h('div', {
        ref: hostRef,
        style: { position: 'relative', width: '100%', height: '100%', overflow: 'hidden' },
      });
    }

    /**
     * A labelled range control.
     * @param {{ label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void }} props - component props.
     * @returns {React.ReactElement} the control element.
     */
    function Slider(props) {
      return h('label', {
        style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
      }, [
        h('div', { key: 'head', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
          h('span', { key: 'label' }, props.label),
          h('span', { key: 'value', style: { color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums' } }, Math.round(props.value * 100) / 100),
        ]),
        h('input', {
          key: 'range',
          type: 'range',
          min: props.min,
          max: props.max,
          step: props.step,
          value: props.value,
          onChange: (event) => props.onChange(Number(event.target.value)),
          style: { width: '100%' },
        }),
      ]);
    }

    /**
     * A segmented button group.
     * @param {{ options: Array<{ value: string, label: string }>, value: string, onChange: (value: string) => void }} props - component props.
     * @returns {React.ReactElement} the control element.
     */
    function Segmented(props) {
      return h('div', {
        style: {
          display: 'inline-flex',
          padding: 2,
          gap: 2,
          borderRadius: 7,
          border: '1px solid var(--dsw-alias-border-l1)',
          background: 'var(--dsw-alias-bg-layer-1)',
          flex: '0 0 auto',
        },
      }, props.options.map((option) => h('button', {
        key: option.value,
        type: 'button',
        onClick: () => props.onChange(option.value),
        style: {
          padding: '2px 10px',
          borderRadius: 5,
          fontSize: 11,
          border: 'none',
          cursor: 'pointer',
          background: props.value === option.value ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
          color: props.value === option.value ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
        },
      }, option.label)));
    }

    /**
     * The poster stage: the poster scaled to the space it has, with every
     * text layer draggable to a new position.
     * @param {{ spec: Record<string, any> }} props - component props.
     * @returns {React.ReactElement} the stage element.
     */
    /**
     * The all-sizes comparison grid; cards scale to the available stage box.
     * @param {{ spec: Record<string, any>, onSelect: (key: string) => void, onTipMove: (event: any, item: Record<string, any>) => void, onTipLeave: () => void }} props - component props.
     * @returns {React.ReactElement} the grid element.
     */
    function GridStage(props) {
      const boxRef = React.useRef(null);
      const [box, setBox] = React.useState({ width: 0, height: 0 });

      React.useEffect(() => {
        const node = boxRef.current;
        if (!node || typeof ResizeObserver === 'undefined') return undefined;
        const measure = () => {
          const rect = node.getBoundingClientRect();
          setBox({ width: rect.width, height: rect.height });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
      }, []);

      const keys = React.useMemo(() => {
        const list = [...SIZE_ORDER];
        const custom = props.spec && props.spec.size;
        if (typeof custom === 'string' && CUSTOM_SIZE_RE.test(custom) && !SIZE_ORDER.includes(custom)) list.push(custom);
        return list;
      }, [props.spec]);

      const specs = React.useMemo(() => {
        const map = {};
        for (const key of keys) map[key] = { ...props.spec, size: key };
        return map;
      }, [props.spec, keys]);

      const [layouts, setLayouts] = React.useState({});

      const columns = 3;
      const gap = 6;
      const pad = 8;
      const rows = keys.length > columns * 2 ? 3 : 2;
      const cellW = Math.max(96, (box.width - pad * 2 - gap * (columns - 1)) / columns);
      const cellH = Math.max(150, (box.height - pad * 2 - gap * (rows - 1)) / rows);

      return h('div', {
        ref: boxRef,
        style: { flex: '1 1 auto', minWidth: 0, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, gap, padding: pad, overflowY: 'auto' },
      }, keys.map((key) => {
        const item = parseSize(key);
        const maxW = cellW - 16;
        const maxH = cellH - 16;
        const fit = Math.min(maxW / item.width, maxH / item.height);
        const width = Math.max(1, Math.round(item.width * fit));
        const height = Math.max(1, Math.round(item.height * fit));
        return h('button', {
          key,
          type: 'button',
          onClick: () => props.onSelect(key),
          onMouseMove: (event) => props.onTipMove(event, item),
          onMouseLeave: props.onTipLeave,
          style: { padding: 0, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, overflow: 'hidden', background: 'transparent', cursor: 'pointer', position: 'relative', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, h('div', { key: 'wrap', style: { position: 'relative', width, height } }, [
          h(PosterCanvas, {
            spec: specs[key],
            width,
            height,
            onLayout: (entries) => setLayouts((current) => ({ ...current, [key]: entries })),
          }),
          ...(layouts[key] ?? []).map((entry) => h('div', {
            key: entry.id,
            style: {
              position: 'absolute',
              left: `${(entry.x / item.width) * 100}%`,
              top: `${(entry.y / item.height) * 100}%`,
              width: `${(entry.width / item.width) * 100}%`,
              height: `${(entry.height / item.height) * 100}%`,
              border: '1px dashed rgba(255,255,255,0.32)',
              pointerEvents: 'none',
            },
          })),
        ]));
      }));
    }

    function PosterStage(props) {
      const stageRef = React.useRef(null);
      const posterRef = React.useRef(null);
      const [box, setBox] = React.useState({ width: 0, height: 0 });
      const [layout, setLayout] = React.useState([]);
      const [guides, setGuides] = React.useState([]);
      const layoutRef = React.useRef([]);
      const dragRef = React.useRef(null);

      React.useEffect(() => {
        const node = stageRef.current;
        if (!node) return undefined;
        const observer = new ResizeObserver((entries) => {
          const rect = entries[0].contentRect;
          setBox({ width: rect.width, height: rect.height });
        });
        observer.observe(node);
        return () => observer.disconnect();
      }, []);

      const preset = parseSize(props.spec.size);
      const scale = box.width > 0 && box.height > 0
        ? Math.min(box.width / preset.width, box.height / preset.height)
        : 0;
      const width = Math.max(1, Math.floor(preset.width * scale));
      const height = Math.max(1, Math.floor(preset.height * scale));

      const snapRef = React.useRef(null);

      const startDrag = (event, id) => {
        event.preventDefault();
        const poster = posterRef.current;
        if (!poster) return;
        const rect = poster.getBoundingClientRect();
        const layer = store.spec.layers.find((entry) => entry.id === id);
        if (!layer) return;
        dragRef.current = {
          id,
          rect,
          dx: event.clientX - rect.left - layer.x * rect.width,
          dy: event.clientY - rect.top - layer.y * rect.height,
        };
        store.beginTransaction();
        const move = (moveEvent) => {
          const current = dragRef.current;
          if (!current) return;
          const w = current.rect.width;
          const h = current.rect.height;
          let x = (moveEvent.clientX - current.rect.left - current.dx) / w;
          let y = (moveEvent.clientY - current.rect.top - current.dy) / h;
          // Alignment snapping: edges and mid-lines of this layer vs the canvas
          // and the other layers, in logical poster pixels.
          const preset = parseSize(store.spec.size);
          const entry = layoutRef.current.find((item) => item.id === current.id);
          const lw = entry ? entry.width / preset.width : 0;
          const lh = entry ? entry.height / preset.height : 0;
          const xTargets = [0, 0.5, 1];
          const yTargets = [0, 0.5, 1];
          const snapPx = 6;
          const xTol = snapPx / w;
          const yTol = snapPx / h;
          const others = layoutRef.current.filter((item) => item.id !== current.id);
          for (const other of others) {
            const otherW = other.width / preset.width;
            const otherH = other.height / preset.height;
            xTargets.push(other.x / preset.width, other.x / preset.width + otherW / 2, (other.x + other.width) / preset.width);
            yTargets.push(other.y / preset.height, other.y / preset.height + otherH / 2, (other.y + other.height) / preset.height);
          }
          let snappedX = null;
          let snappedY = null;
          const anchorsX = [x, x + lw / 2, x + lw];
          const anchorsY = [y, y + lh / 2, y + lh];
          for (const t of xTargets) {
            for (let i = 0; i < 3; i += 1) {
              if (Math.abs(anchorsX[i] - t) <= xTol) { snappedX = t - (i === 1 ? lw / 2 : i === 2 ? lw : 0); break; }
            }
            if (snappedX !== null) break;
          }
          for (const t of yTargets) {
            for (let i = 0; i < 3; i += 1) {
              if (Math.abs(anchorsY[i] - t) <= yTol) { snappedY = t - (i === 1 ? lh / 2 : i === 2 ? lh : 0); break; }
            }
            if (snappedY !== null) break;
          }
          const guides = [];
          if (snappedX !== null) { x = snappedX; guides.push({ axis: 'x', pos: snappedX + lw / 2 }); }
          if (snappedY !== null) { y = snappedY; guides.push({ axis: 'y', pos: snappedY + lh / 2 }); }
          snapRef.current = guides;
          setGuides(guides);
          store.applySpec({
            layers: store.spec.layers.map((entryItem) => (entryItem.id === current.id
              ? { ...entryItem, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
              : entryItem)),
          }, false, false);
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          dragRef.current = null;
          snapRef.current = null;
          store.commitTransaction();
          setGuides([]);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };

      const handles = layout.map((entry) => {
        const layer = store.spec.layers.find((item) => item.id === entry.id);
        if (!layer) return null;
        const left = (entry.x / preset.width) * width;
        const top = (entry.y / preset.height) * height;
        const boxWidth = Math.max((entry.width / preset.width) * width, 26);
        const boxHeight = Math.max((entry.height / preset.height) * height, 22);
        const locked = Boolean(entry.locked);
        return h('div', {
          key: entry.id,
          title: locked ? store.translate('lockedLayer') : layer.text,
          onPointerDown: locked ? undefined : (event) => startDrag(event, entry.id),
          style: {
            position: 'absolute',
            left,
            top,
            width: boxWidth,
            height: boxHeight,
            boxSizing: 'border-box',
            cursor: locked ? 'default' : 'move',
            border: `1px dashed ${locked ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.32)'}`,
            borderRadius: 4,
            touchAction: 'none',
          },
        }, locked ? h('span', {
          key: 'padlock',
          style: { position: 'absolute', right: 3, top: 1, fontSize: 9, lineHeight: '12px', color: 'rgba(255,255,255,0.85)', pointerEvents: 'none' },
        }, '🔒') : null);
      });

      const guideLines = guides.map((guide, index) => (guide.axis === 'x'
        ? h('div', { key: `g${index}`, style: { position: 'absolute', left: `${guide.pos * 100}%`, top: 0, bottom: 0, width: 0, borderLeft: '1px solid rgba(80,190,255,0.9)', pointerEvents: 'none' } })
        : h('div', { key: `g${index}`, style: { position: 'absolute', top: `${guide.pos * 100}%`, left: 0, right: 0, height: 0, borderTop: '1px solid rgba(80,190,255,0.9)', pointerEvents: 'none' } })));

      return h('div', {
        ref: stageRef,
        style: {
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          background: 'var(--dsw-alias-bg-layer-1)',
          overflow: 'hidden',
        },
      }, h('div', {
        ref: posterRef,
        style: {
          position: 'relative',
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid var(--dsw-alias-border-l1)',
          touchAction: 'none',
        },
      }, [
        h(PosterCanvas, { key: 'canvas', spec: props.spec, width, height, onLayout: (entries) => { layoutRef.current = entries; setLayout(entries); } }),
        ...handles,
        ...guideLines,
      ]));
    }

    /**
     * A number field with up and down buttons.
     * @param {{ label: string, value: number, min: number, max: number, step: number, scale?: number, precision?: number, onChange: (value: number) => void }} props - component props.
     * @returns {React.ReactElement} the control element.
     */
    function Stepper(props) {
      const scale = props.scale ?? 1;
      const precision = props.precision ?? 0;
      const shown = (value) => Number((value * scale).toFixed(precision));
      const emit = (value) => {
        if (!Number.isFinite(value)) return;
        props.onChange(Math.min(props.max, Math.max(props.min, value)));
      };
      return h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: 'var(--dsw-alias-label-tertiary)',
          flex: props.stretch ? '1 1 0' : '0 0 auto',
          minWidth: 0,
        },
      }, [
        h('span', { key: 'label', style: { flex: '0 0 auto' } }, props.label),
        // A plain number input: the browser's own up/down arrows (shown on
        // hover and on keyboard arrows) are the adjuster, no extra buttons.
        h('input', {
          key: 'input',
          type: 'number',
          value: shown(props.value),
          min: shown(props.min),
          max: shown(props.max),
          step: props.step * scale,
          onChange: (event) => emit(Number(event.target.value) / scale),
          style: {
            width: props.stretch ? '100%' : 64,
            flex: props.stretch ? '1 1 auto' : '0 0 auto',
            textAlign: 'center',
            padding: '3px 4px',
            borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'var(--dsw-alias-bg-layer-1)',
            color: 'var(--dsw-alias-label-primary)',
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box',
          },
        }),
      ]);
    }

    /**
     * The poster studio.
     * @param {{ embedded?: boolean }} [props] - renders inside the main panel when embedded.
     * @returns {React.ReactElement | null} the panel element.
     */
    // Floating panel host lease. Several slots can host the single floating
    // panel; the first host whose effects actually commit claims the lease,
    // the rest stay idle. A host frozen by a strict reconciler never runs its
    // lifecycle, so it never claims and never blocks the panel. Idle hosts
    // poll cheaply so a released lease is picked up after route changes.
    let panelLeaseOwner = null;
    let panelLeaseSeq = 0;
    const posterHosts = new Set();
    class PosterPanelHost extends React.Component {
      constructor(props) {
        super(props);
        this.state = { claimed: false };
        this.id = ++panelLeaseSeq;
        this.timer = null;
        this.node = null;
      }
      claim() {
        if (panelLeaseOwner !== null) return false;
        panelLeaseOwner = this.id;
        this.setState({ claimed: true });
        return true;
      }
      componentDidMount() {
        posterHosts.add(this);
        if (this.claim()) return;
        this.timer = setInterval(() => { if (this.claim() && this.timer) { clearInterval(this.timer); this.timer = null; } }, 900);
      }
      componentDidUpdate() {
        if (this.state.claimed && !this.node && typeof document !== 'undefined' && document.body) {
          this.node = document.createElement('div');
          this.node.setAttribute('data-poster-studio-root', '');
          document.body.appendChild(this.node);
          ReactDOM.render(h(PosterPanel, {}), this.node);
        }
      }
      componentWillUnmount() {
        posterHosts.delete(this);
        if (this.timer) clearInterval(this.timer);
        if (panelLeaseOwner === this.id) {
          panelLeaseOwner = null;
          for (const peer of posterHosts) { if (peer !== this && !peer.state.claimed && peer.claim()) break; }
        }
        if (this.node) {
          const node = this.node;
          this.node = null;
          ReactDOM.unmountComponentAtNode(node);
          node.remove();
        }
      }
      render() {
        return h('div', { style: { display: 'none' } });
      }
    }

    // Hook-free mount shell for host-rendered occupants: renders an anchor
    // and mounts the real (hook-heavy) tree through the vendored pair.
    function makeMountedShell(elementFactory, anchorStyle) {
      return class MountedShell extends React.Component {
        constructor(props) {
          super(props);
          this.anchor = null;
          this.node = null;
        }
        attach(el) { this.anchor = el; }
        paint() {
          if (!this.node && this.anchor && this.anchor.parentNode && typeof document !== 'undefined') {
            this.node = document.createElement('div');
            this.node.setAttribute('data-poster-studio-mount', '');
            this.anchor.parentNode.insertBefore(this.node, this.anchor);
            ReactDOM.render(elementFactory(this.props), this.node);
          }
        }
        componentDidMount() { this.paint(); }
        componentDidUpdate() { if (this.node) ReactDOM.render(elementFactory(this.props), this.node); else this.paint(); }
        componentWillUnmount() {
          if (this.node) {
            const node = this.node;
            this.node = null;
            ReactDOM.unmountComponentAtNode(node);
            node.remove();
          }
        }
        render() {
          return h('div', { ref: (el) => this.attach(el), style: anchorStyle || { display: 'contents' } });
        }
      };
    }

    function PosterPanel(props) {
      try {
        return PosterPanelInner(props);
      } catch (error) {
        try { window.__posterRenderError = String(error && error.stack || error).slice(0, 800); } catch (ignored) { void ignored; }
        throw error;
      }
    }

    function PosterPanelInner(props) {
      try {
        const own = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
        const dom = ReactDOM && ReactDOM.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
        window.__posterRenderDiag = {
          ownDispatcher: Boolean(own && own.ReactCurrentDispatcher && own.ReactCurrentDispatcher.current),
          domSameAsOwn: Boolean(own && dom && own.ReactCurrentDispatcher === dom.ReactCurrentDispatcher),
          domDispatcher: Boolean(dom && dom.ReactCurrentDispatcher && dom.ReactCurrentDispatcher.current),
        };
      } catch (error) { void error; }
      const embedded = Boolean(props && props.embedded);
      const [spec, setSpec] = React.useState(store.spec);
      const [tab, setTab] = React.useState('content');
      const [mode, setMode] = React.useState('single');
      const [fullscreen, setFullscreen] = React.useState(false);
      const [customSize, setCustomSize] = React.useState(null);
      const [collapsedIds, setCollapsedIds] = React.useState([]);
      const [sizeTip, setSizeTip] = React.useState(null);
      const [versionsOpen, setVersionsOpen] = React.useState(false);
      const [status, setStatus] = React.useState('');
      const [openTick, setOpenTick] = React.useState(0);
      const [drafts, setDrafts] = React.useState({});
      const imageFileInput = React.useRef(null);
      const pendingImageLayer = React.useRef(null);
      const [variants, setVariants] = React.useState([]);
      const [library, setLibrary] = React.useState([]);
      const [position, setPosition] = React.useState(() => {
        try {
          const stored = JSON.parse(localStorage.getItem('poster-studio-panel') || 'null');
          if (stored && typeof stored.left === 'number' && typeof stored.top === 'number') {
            return {
              left: Math.max(0, Math.min(window.innerWidth - 320, stored.left)),
              top: Math.max(0, Math.min(window.innerHeight - 120, stored.top)),
            };
          }
        } catch { /* fall back to the docked corner */ }
        return null;
      });
      const [size, setSize] = React.useState(() => {
        try {
          const stored = JSON.parse(localStorage.getItem('poster-studio-size') || 'null');
          if (stored && typeof stored.width === 'number' && typeof stored.height === 'number') {
            return {
              width: Math.max(480, Math.min(window.innerWidth - 24, stored.width)),
              height: Math.max(320, Math.min(window.innerHeight - 24, stored.height)),
            };
          }
        } catch { /* fall back to the default */ }
        return { width: 820, height: Math.min(Math.round(window.innerHeight * 0.94), 880) };
      });
      const panelRef = React.useRef(null);
      const dragRef = React.useRef(null);
      const resizeRef = React.useRef(null);

      const startResize = (event, dir) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect) return;
        const docked = !position;
        const maxW = docked ? window.innerWidth - 24 : Math.max(240, window.innerWidth - rect.left - 12);
        const maxH = docked ? window.innerHeight - 24 : Math.max(240, window.innerHeight - rect.top - 12);
        resizeRef.current = { startX: event.clientX, startY: event.clientY, startW: rect.width, startH: rect.height, dir, docked, maxW, maxH };
        const move = (moveEvent) => {
          const drag = resizeRef.current;
          if (!drag) return;
          const dx = moveEvent.clientX - drag.startX;
          const dy = moveEvent.clientY - drag.startY;
          setSize(() => ({
            width: drag.dir === 's' ? drag.startW : Math.max(480, Math.min(drag.maxW, drag.startW + dx)),
            height: drag.dir === 'e' ? drag.startH : Math.max(320, Math.min(drag.maxH, drag.startH + (drag.docked ? -dy : dy))),
          }));
        };
        const up = () => {
          resizeRef.current = null;
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          setSize((current) => {
            try { localStorage.setItem('poster-studio-size', JSON.stringify(current)); } catch { /* storage is optional */ }
            return current;
          });
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      };

      const startDrag = (event) => {
        if (event.target.closest('button, select, input')) return;
        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect) return;
        dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
        const move = (moveEvent) => {
          if (!dragRef.current) return;
          const left = Math.max(0, Math.min(window.innerWidth - 320, moveEvent.clientX - dragRef.current.dx));
          const top = Math.max(0, Math.min(window.innerHeight - 120, moveEvent.clientY - dragRef.current.dy));
          setPosition({ left, top });
        };
        const up = () => {
          dragRef.current = null;
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          setPosition((current) => {
            if (current) {
              try { localStorage.setItem('poster-studio-panel', JSON.stringify(current)); } catch { /* storage is optional */ }
            }
            return current;
          });
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      };

      // The host may keep a null-returning occupant out of commit, so the
      // panel never returns null when hidden and subscribes synchronously.
      const openFlag = React.useSyncExternalStore
        ? React.useSyncExternalStore(store.subscribe, () => embedded || store.open, () => true)
        : true;
      React.useEffect(() => {
        const unsubscribe = store.subscribe(() => {
          setSpec({ ...store.spec });
          if (!React.useSyncExternalStore) {
            setOpenTick((value) => value + 1);
          }
        });
        setOpenTick((value) => value + 1);
        return unsubscribe;
      }, []);

      // Click anywhere on the sidebar row opens the float; the native
      // capture listener runs before React handlers, so the shell never
      // navigates the main column to the studio placeholder.
      React.useEffect(() => {
        const onClick = (event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (!target) return;
          const button = target.closest('button');
          if (!button || !button.querySelector('[data-poster-icon]')) return;
          event.stopPropagation();
          event.preventDefault();
          store.open = true;
          store.emit();
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
      }, []);

      // Escape exits fullscreen first, then closes the floating studio.
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'Escape' || embedded || !store.open) return;
          // The Save As dialog forwards its Escape to the page when it
          // closes; that must not also close the studio window.
          if (store.pickerActive || Date.now() - store.lastPickerAt < 500) return;
          if (fullscreen) { setFullscreen(false); return; }
          store.open = false;
          store.emit();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [embedded, fullscreen]);

      React.useEffect(() => {
        const timer = setInterval(() => { void store.pull(); }, 3000);
        void store.pull();
        return () => clearInterval(timer);
      }, []);

      React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
          try {
            const response = await fetch('/poster-studio/exports', { headers: { accept: 'application/json' } });
            if (!response.ok) return;
            const entries = await response.json();
            if (cancelled || !Array.isArray(entries)) return;
            setLibrary(entries);
          } catch (error) {
            console.warn('poster-studio: the export library could not be read', error);
          }
        };
        void load();
        return () => { cancelled = true; };
      }, [library.length]);

      const preset = parseSize(spec.size);

      const patchLayer = (id, changes) => {
        store.applySpec({
          layers: spec.layers.map((layer) => (layer.id === id ? { ...layer, ...changes } : layer)),
        });
      };

      const imageToCompactDataUrl = async (file) => {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('the image could not be read'));
          reader.readAsDataURL(file);
        });
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('the image could not be decoded'));
          image.src = dataUrl;
        });
        const maxSide = 800;
        const scale = Math.min(1, maxSide / Math.max(1, image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/webp', 0.92);
      };

      const onImageFile = async (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
          const src = await imageToCompactDataUrl(file);
          const target = pendingImageLayer.current;
          pendingImageLayer.current = null;
          if (target !== null) {
            patchLayer(target, { src });
            return;
          }
          const used = new Set(spec.layers.map((layer) => layer.id));
          let n = 1;
          while (used.has(`img-${n}`)) n += 1;
          store.applySpec({
            layers: [
              ...spec.layers,
              { id: `img-${n}`, kind: 'image', src, text: '', size: 28, weight: 400, align: 'center', x: 0.5, y: 0.5, width: 0.25, opacity: 1, color: '#ffffff', lineHeight: 1.4, letterSpacing: 0, maxWidth: 0.8 },
            ],
          });
        } catch (error) {
          console.warn('poster-studio: the image could not be added', error);
          setStatus(String(error && error.message ? error.message : error));
        }
      };

      const onBackgroundFile = async (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
          const image = new Image();
          const objectUrl = URL.createObjectURL(file);
          await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error('the image could not be decoded'));
            image.src = objectUrl;
          });
          const maxSide = 2400;
          const scale = Math.min(1, maxSide / Math.max(1, image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(objectUrl);
          const src = canvas.toDataURL('image/jpeg', 0.85);
          store.applySpec({ background: { image: src, opacity: spec.background?.opacity ?? 1 } });
          setStatus(store.translate('bgImage') + ' ✓');
        } catch (error) {
          console.warn('poster-studio: the background image could not be loaded', error);
          setStatus(String(error && error.message ? error.message : error));
        }
      };

      const exportPng = async () => {
        setStatus(store.translate('export') + '…');
        try {
          const blob = await renderPng(store.spec);
          if (!blob) throw new Error('the poster could not be rendered');
          const suggested = `poster-${spec.size}.png`;
          if (typeof window.showSaveFilePicker === 'function') {
            // Native Save As dialog: the user picks the folder and file name.
            store.pickerActive = true;
            store.lastPickerAt = 0;
            let handle;
            try {
              handle = await window.showSaveFilePicker({
                suggestedName: suggested,
                types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
              });
            } finally {
              store.pickerActive = false;
              store.lastPickerAt = Date.now();
            }
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            setStatus(`${store.translate('saved')} ${handle.name}`);
            return;
          }
          // Fallback for browsers without the File System Access API.
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = suggested;
          link.click();
          URL.revokeObjectURL(link.href);
          setStatus(store.translate('exported'));
        } catch (error) {
          if (error && error.name === 'AbortError') { setStatus(''); return; }
          console.warn('poster-studio: the poster could not be exported', error);
          setStatus(String(error && error.message ? error.message : error));
        }
      };

      const exportAllSizes = async () => {
        if (typeof window.showDirectoryPicker !== 'function') {
          setStatus(store.translate('export'));
          return;
        }
        store.pickerActive = true;
        store.lastPickerAt = 0;
        let dir = null;
        try {
          dir = await window.showDirectoryPicker({ mode: 'readwrite' });
        } catch (error) {
          if (error && error.name === 'AbortError') { setStatus(''); return; }
          setStatus(String(error && error.message ? error.message : error));
          return;
        } finally {
          store.pickerActive = false;
          store.lastPickerAt = Date.now();
        }
        try {
          let done = 0;
          for (const key of SIZE_ORDER) {
            setStatus(`${store.translate('exportAllProgress')} ${done + 1}/${SIZE_ORDER.length} · ${key}`);
            const blob = await renderPng({ ...store.spec, size: key });
            if (!blob) continue;
            const handle = await dir.getFileHandle(`poster-${key}.png`, { create: true });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            done += 1;
          }
          setStatus(`${store.translate('exportAllDone')} (${done})`);
        } catch (error) {
          console.warn('poster-studio: the sizes could not be exported', error);
          setStatus(String(error && error.message ? error.message : error));
        }
      };

      const askAgent = async () => {
        const sessionId = store.sessionId;
        const client = store.ctx;
        if (!sessionId || !client || !client.sessions) { setStatus(store.translate('askAi')); return; }
        try {
          const binding = client.sessions.binding(sessionId);
          if (!binding) { setStatus(store.translate('askAi')); return; }
          await binding.session.prompt([{
            type: 'text',
            text: '请为这张海报写文案：给 3 个候选标题和 1 句副标题，中文为主、可带一句英文，然后调用 poster_design 工具把选定的标题和副标题应用到海报上。',
          }], 'queue');
          setStatus(store.translate('askAi') + ' ✓');
        } catch (error) {
          console.warn('poster-studio: the agent could not be asked for copy', error);
          setStatus(String(error && error.message ? error.message : error));
        }
      };

      const makeVariants = async () => {
        const list = buildVariants(store.spec, 6);
        const preset = parseSize(store.spec.size);
        const width = 170;
        const height = Math.round((width * preset.height) / preset.width);
        const canvases = await renderVariants(list, width, height);
        setVariants(canvases.map((canvas, index) => ({ canvas, spec: list[index] })));
        setTab('variants');
      };

      const exportPreset = () => {
        const blob = new Blob([JSON.stringify(store.spec, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `poster-preset-${store.spec.size}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
      };

      const importPreset = (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            store.applySpec(JSON.parse(String(reader.result)));
          } catch (error) {
            console.warn('poster-studio: the preset could not be read', error);
          }
        };
        reader.readAsText(file);
        event.target.value = '';
      };

      const fieldStyle = {
        width: '100%',
        boxSizing: 'border-box',
        padding: '5px 8px',
        borderRadius: 7,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: FONT_STACK,
        fontSize: 12,
        outline: 'none',
      };

      const layerLabel = (layer, index) => (LAYER_LABELS[layer.id]
        ? store.translate(LAYER_LABELS[layer.id])
        : `${store.translate(layer.kind === 'image' ? 'imageLayer' : layer.kind === 'qr' ? 'qrLayer' : layer.kind === 'badge' ? 'badgeLayer' : 'textLayer')} ${index + 1}`);

      const addLayer = () => {
        const used = new Set(spec.layers.map((layer) => layer.id));
        let n = 1;
        while (used.has(`text-${n}`)) n += 1;
        store.applySpec({
          layers: [
            ...spec.layers,
            { id: `text-${n}`, text: '', size: 28, weight: 400, align: 'center', x: 0.5, y: 0.68, color: '#ffffff', lineHeight: 1.4, letterSpacing: 0, maxWidth: 0.8 },
          ],
        });
      };

      const removeLayer = (id) => {
        if (spec.layers.length <= 1) return;
        store.applySpec({ layers: spec.layers.filter((layer) => layer.id !== id) });
      };

      const layerCardStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '9px 10px 11px',
        borderRadius: 10,
        background: 'var(--dsw-alias-bg-layer-2)',
      };

      const layerChipStyle = {
        width: 18,
        height: 18,
        padding: 0,
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 5,
        background: 'transparent',
        color: 'var(--dsw-alias-label-tertiary)',
        cursor: 'pointer',
        fontSize: 10,
        lineHeight: '16px',
      };

      const layerToggleStyle = (active) => ({
        width: 22,
        height: 22,
        flex: '0 0 auto',
        padding: 0,
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        background: active ? 'var(--dsw-alias-bg-layer-1)' : 'transparent',
        color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: FONT_STACK,
      });

      const layerMove = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= spec.layers.length) return;
        const layers = spec.layers.slice();
        const moved = layers.splice(index, 1)[0];
        layers.splice(target, 0, moved);
        store.applySpec({ layers });
      };

      const layerMoveButtons = (layer, index) => [
        h('button', {
          key: 'up',
          type: 'button',
          title: store.translate('moveUp'),
          disabled: index === 0,
          onClick: () => layerMove(index, -1),
          style: { ...layerChipStyle, opacity: index === 0 ? 0.35 : 1 },
        }, '↑'),
        h('button', {
          key: 'down',
          type: 'button',
          title: store.translate('moveDown'),
          disabled: index === spec.layers.length - 1,
          onClick: () => layerMove(index, 1),
          style: { ...layerChipStyle, opacity: index === spec.layers.length - 1 ? 0.35 : 1 },
        }, '↓'),
      ];

      const layerRemoveButton = (layer) => h('button', {
        key: 'remove',
        type: 'button',
        title: store.translate('removeLayer'),
        onClick: () => removeLayer(layer.id),
        style: layerChipStyle,
      }, '✕');

      const addQr = () => {
        const used = new Set(spec.layers.map((layer) => layer.id));
        let n = 1;
        while (used.has(`qr-${n}`)) n += 1;
        store.applySpec({
          layers: [
            ...spec.layers,
            { id: `qr-${n}`, kind: 'qr', value: 'https://', text: '', size: 28, weight: 400, align: 'center', x: 0.5, y: 0.5, width: 0.28, opacity: 1, color: '#000000', lineHeight: 1.4, letterSpacing: 0, maxWidth: 0.8 },
          ],
        });
      };

      const addBadge = () => {
        const used = new Set(spec.layers.map((layer) => layer.id));
        let n = 1;
        while (used.has(`badge-${n}`)) n += 1;
        store.applySpec({
          layers: [
            ...spec.layers,
            { id: `badge-${n}`, kind: 'badge', text: '', size: 26, weight: 500, align: 'center', x: 0.5, y: 0.86, width: 0.3, opacity: 1, color: '#ffffff', textColor: '#141414', lineHeight: 1.4, letterSpacing: 0, maxWidth: 0.8 },
          ],
        });
      };

      const toggleCollapse = (id) => setCollapsedIds((current) => (current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id]));

      /**
       * The collapsible header shared by every layer card.
       * @param {Record<string, any>} layer - the layer.
       * @param {number} index - the layer index.
       * @param {any[]} colorInputs - the colour swatch inputs for this kind.
       * @returns {any} the header element.
       */
      const layerHead = (layer, index, colorInputs) => h('div', {
        key: 'head',
        onClick: () => toggleCollapse(layer.id),
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' },
      }, [
        h('span', {
          key: 'label',
          style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' },
        }, [
          h('span', {
            key: 'chev',
            style: { width: 10, fontSize: 8, color: 'var(--dsw-alias-label-tertiary)' },
          }, collapsedIds.includes(layer.id) ? '▶' : '▼'),
          layerLabel(layer, index),
        ]),
        h('div', {
          key: 'actions',
          onClick: (event) => event.stopPropagation(),
          style: { display: 'flex', alignItems: 'center', gap: 6 },
        }, [
          h('button', {
            key: 'lock',
            type: 'button',
            title: layer.locked ? store.translate('unlock') : store.translate('lock'),
            onClick: () => patchLayer(layer.id, { locked: !layer.locked }),
            style: { padding: '0 4px', border: 'none', background: 'transparent', color: layer.locked ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-tertiary)', fontSize: 12, cursor: 'pointer' },
          }, layer.locked ? '🔒' : '🔓'),
          ...layerMoveButtons(layer, index),
          ...colorInputs,
          spec.layers.length > 1 ? layerRemoveButton(layer) : null,
        ]),
      ]);

      const layerControls = spec.layers.map((layer, index) => {
        const collapsed = collapsedIds.includes(layer.id);
        if (layer.kind === 'badge') {
          return h('div', { key: layer.id, style: layerCardStyle }, [
            layerHead(layer, index, [
              h('input', {
                key: 'textColor',
                type: 'color',
                value: normalizeColor(layer.textColor) || '#141414',
                title: store.translate('textColor'),
                onChange: (event) => patchLayer(layer.id, { textColor: event.target.value }),
                style: { width: 18, height: 18, padding: 0, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 5, background: 'transparent', cursor: 'pointer' },
              }),
              h('input', {
                key: 'color',
                type: 'color',
                value: (normalizeColor(layer.color) || '#ffffff').slice(0, 7),
                title: store.translate('bgColor'),
                onChange: (event) => patchLayer(layer.id, { color: event.target.value }),
                style: { width: 18, height: 18, padding: 0, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 5, background: 'transparent', cursor: 'pointer' },
              }),
            ]),
            ...(collapsed ? [] : [
            h('input', {
              key: 'text',
              type: 'text',
              value: drafts[layer.id] !== undefined ? drafts[layer.id] : layer.text,
              placeholder: store.translate('badgeText'),
              onChange: (event) => setDrafts((current) => ({ ...current, [layer.id]: event.target.value })),
              onBlur: (event) => {
                setDrafts((current) => { const next = { ...current }; delete next[layer.id]; return next; });
                patchLayer(layer.id, { text: event.target.value });
              },
              onKeyDown: (event) => { if (event.key === 'Enter') event.currentTarget.blur(); },
              style: fieldStyle,
            }),
            h('div', { key: 'rowFont', style: { display: 'flex', alignItems: 'center', gap: 6 } }, [
              h('span', { key: 'label', style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', flex: '0 0 auto' } }, store.translate('font')),
              h('select', {
                key: 'select',
                value: layer.font ?? '',
                onChange: (event) => patchLayer(layer.id, { font: event.target.value }),
                style: { flex: 1, minWidth: 0, padding: '3px 4px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12, outline: 'none' },
              }, [
                h('option', { key: '', value: '' }, store.translate('fontDefault')),
                ...Object.entries(FONT_OPTIONS).map(([key, option]) => h('option', { key, value: key }, option.label)),
              ]),
            ]),
            h('div', { key: 'row', style: { display: 'flex', gap: 10 } }, [
              h(Stepper, { key: 'size', label: store.translate('fontSize'), stretch: true, value: layer.size, min: 12, max: 200, step: 1, onChange: (value) => patchLayer(layer.id, { size: value }) }),
            ]),
            h('div', { key: 'pos', style: { display: 'flex', gap: 10 } }, [
              h(Stepper, { key: 'x', label: 'X%', stretch: true, value: layer.x, min: 0, max: 1, step: 0.01, scale: 100, precision: 0, onChange: (value) => patchLayer(layer.id, { x: value }) }),
              h(Stepper, { key: 'y', label: 'Y%', stretch: true, value: layer.y, min: 0, max: 1, step: 0.01, scale: 100, precision: 0, onChange: (value) => patchLayer(layer.id, { y: value }) }),
            ]),
            ]),
          ]);
        }
        if (layer.kind === 'qr') {
          return h('div', { key: layer.id, style: layerCardStyle }, [
            layerHead(layer, index, [
              h('input', {
                key: 'color',
                type: 'color',
                value: normalizeColor(layer.color) || '#000000',
                title: store.translate('qrColor'),
                onChange: (event) => patchLayer(layer.id, { color: event.target.value }),
                style: { width: 18, height: 18, padding: 0, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 5, background: 'transparent', cursor: 'pointer' },
              }),
            ]),
            ...(collapsed ? [] : [
            h('input', {
              key: 'value',
              type: 'text',
              value: drafts[`value:${layer.id}`] !== undefined ? drafts[`value:${layer.id}`] : (layer.value ?? ''),
              placeholder: store.translate('qrValue'),
              onChange: (event) => setDrafts((current) => ({ ...current, [`value:${layer.id}`]: event.target.value })),
              onBlur: (event) => {
                setDrafts((current) => { const next = { ...current }; delete next[`value:${layer.id}`]; return next; });
                patchLayer(layer.id, { value: event.target.value });
              },
              onKeyDown: (event) => { if (event.key === 'Enter') event.currentTarget.blur(); },
              style: fieldStyle,
            }),
            h('div', { key: 'size', style: { display: 'flex', gap: 10 } }, [
              h(Stepper, {
                key: 'w',
                label: store.translate('imageWidth'),
                stretch: true,
                value: layer.width ?? 0.28,
                min: 0.02,
                max: 1.5,
                step: 0.01,
                scale: 100,
                precision: 0,
                onChange: (value) => patchLayer(layer.id, { width: value }),
              }),
            ]),
            h('div', { key: 'pos', style: { display: 'flex', gap: 10 } }, [
              h(Stepper, { key: 'x', label: 'X%', stretch: true, value: layer.x, min: 0, max: 1, step: 0.01, scale: 100, precision: 0, onChange: (value) => patchLayer(layer.id, { x: value }) }),
              h(Stepper, { key: 'y', label: 'Y%', stretch: true, value: layer.y, min: 0, max: 1, step: 0.01, scale: 100, precision: 0, onChange: (value) => patchLayer(layer.id, { y: value }) }),
            ]),
            ]),
          ]);
        }
        if (layer.kind === 'image') {
          return h('div', { key: layer.id, style: layerCardStyle }, [
            layerHead(layer, index, []),
            ...(collapsed ? [] : [
            h('div', { key: 'thumbRow', style: { display: 'flex', alignItems: 'center', gap: 8 } }, [
              h('img', {
                key: 'preview',
                src: layer.src,
                alt: '',
                style: { maxWidth: 110, maxHeight: 52, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)' },
              }),
              h('button', {
                key: 'replace',
                type: 'button',
                onClick: () => { pendingImageLayer.current = layer.id; imageFileInput.current?.click(); },
                style: { padding: '4px 8px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: FONT_STACK },
              }, store.translate('replaceImage')),
            ]),
            h('div', { key: 'size', style: { display: 'flex', gap: 10 } }, [
              h(Stepper, {
                key: 'w',
                label: store.translate('imageWidth'),
                stretch: true,
                value: layer.width,
                min: 0.02,
                max: 1.5,
                step: 0.01,
                scale: 100,
                precision: 0,
                onChange: (value) => patchLayer(layer.id, { width: value }),
              }),
            ]),
            h('div', { key: 'pos', style: { display: 'flex', gap: 10 } }, [
              h(Stepper, { key: 'x', label: 'X%', stretch: true, value: layer.x, min: 0, max: 1, step: 0.01, scale: 100, precision: 0, onChange: (value) => patchLayer(layer.id, { x: value }) }),
              h(Stepper, { key: 'y', label: 'Y%', stretch: true, value: layer.y, min: 0, max: 1, step: 0.01, scale: 100, precision: 0, onChange: (value) => patchLayer(layer.id, { y: value }) }),
            ]),
            h('div', { key: 'opacityRow', style: { display: 'flex', gap: 10 } }, [
              h(Stepper, {
                key: 'opacity',
                label: store.translate('opacity'),
                stretch: true,
                value: layer.opacity ?? 1,
                min: 0,
                max: 1,
                step: 0.05,
                scale: 100,
                precision: 0,
                onChange: (value) => patchLayer(layer.id, { opacity: value }),
              }),
            ]),
            ]),
          ]);
        }
        return h('div', {
          key: layer.id,
          style: layerCardStyle,
        }, [
          layerHead(layer, index, [
            h('input', {
              key: 'color',
              type: 'color',
              value: layer.color.slice(0, 7),
              title: store.translate('palette'),
              onChange: (event) => patchLayer(layer.id, { color: event.target.value }),
              style: { width: 18, height: 18, padding: 0, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 5, background: 'transparent', cursor: 'pointer' },
            }),
          ]),
          ...(collapsed ? [] : [
          h('input', {
            key: 'text',
          type: 'text',
          value: drafts[layer.id] !== undefined ? drafts[layer.id] : layer.text,
          placeholder: layerLabel(layer, index),
          onChange: (event) => setDrafts((current) => ({ ...current, [layer.id]: event.target.value })),
          onBlur: (event) => {
            setDrafts((current) => { const next = { ...current }; delete next[layer.id]; return next; });
            patchLayer(layer.id, { text: event.target.value });
          },
          onKeyDown: (event) => { if (event.key === 'Enter') event.currentTarget.blur(); },
          style: fieldStyle,
        }),
        h('div', { key: 'rowFont', style: { display: 'flex', alignItems: 'center', gap: 6 } }, [
          h('span', { key: 'label', style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', flex: '0 0 auto' } }, store.translate('font')),
          h('select', {
            key: 'select',
            value: layer.font ?? '',
            onChange: (event) => patchLayer(layer.id, { font: event.target.value }),
            style: { flex: 1, minWidth: 0, padding: '3px 4px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12, outline: 'none' },
          }, [
            h('option', { key: '', value: '' }, store.translate('fontDefault')),
            ...Object.entries(FONT_OPTIONS).map(([key, option]) => h('option', { key, value: key }, option.label)),
          ]),
        ]),
        h('div', { key: 'row', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } }, [
          h(Stepper, {
            key: 'size',
            label: store.translate('fontSize'),
            value: layer.size,
            min: 10,
            max: 200,
            step: 1,
            onChange: (value) => patchLayer(layer.id, { size: value }),
          }),
          h(Segmented, {
            key: 'align',
            options: [{ value: 'left', label: '左' }, { value: 'center', label: '中' }, { value: 'right', label: '右' }],
            value: layer.align,
            onChange: (value) => patchLayer(layer.id, { align: value }),
          }),
        ]),
        h('div', { key: 'rowWeight', style: { display: 'flex', alignItems: 'center', gap: 6 } }, [
          h('label', {
            key: 'weightWrap',
            style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', flex: '0 0 auto' },
          }, [
            h('span', { key: 'label' }, store.translate('weight')),
            h('select', {
              key: 'select',
              value: String(layer.weight),
              onChange: (event) => patchLayer(layer.id, { weight: Number(event.target.value) }),
              style: { width: 52, padding: '3px 2px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12, outline: 'none' },
            }, [100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => h('option', { key: weight, value: weight }, String(weight)))),
          ]),
          h('button', {
            key: 'italic',
            type: 'button',
            title: store.translate('italic'),
            onClick: () => patchLayer(layer.id, { italic: !layer.italic }),
            style: { ...layerToggleStyle(Boolean(layer.italic)), fontStyle: 'italic' },
          }, 'I'),
          h('button', {
            key: 'underline',
            type: 'button',
            title: store.translate('underline'),
            onClick: () => patchLayer(layer.id, { underline: !layer.underline }),
            style: { ...layerToggleStyle(Boolean(layer.underline)), textDecoration: 'underline' },
          }, 'U'),
          h(Stepper, {
            key: 'spacing',
            label: store.translate('letterSpacing'),
            stretch: true,
            value: layer.letterSpacing,
            min: -10,
            max: 40,
            step: 0.5,
            precision: 1,
            onChange: (value) => patchLayer(layer.id, { letterSpacing: value }),
          }),
        ]),
        h('div', { key: 'rowFlow', style: { display: 'flex', gap: 10 } }, [
          h(Stepper, {
            key: 'lineHeight',
            label: store.translate('lineHeight'),
            stretch: true,
            value: layer.lineHeight,
            min: 0.8,
            max: 3,
            step: 0.05,
            precision: 2,
            onChange: (value) => patchLayer(layer.id, { lineHeight: value }),
          }),
          h(Stepper, {
            key: 'opacity',
            label: store.translate('opacity'),
            stretch: true,
            value: layer.color.length === 9 ? parseInt(layer.color.slice(7, 9), 16) / 255 : 1,
            min: 0.05,
            max: 1,
            step: 0.05,
            scale: 100,
            precision: 0,
            onChange: (value) => patchLayer(layer.id, {
              color: value >= 1
                ? layer.color.slice(0, 7)
                : layer.color.slice(0, 7) + Math.round(value * 255).toString(16).padStart(2, '0'),
            }),
          }),
        ]),
        h('div', { key: 'effects', style: { display: 'flex', gap: 6, alignItems: 'center' } }, [
          h(Stepper, {
            key: 'outline',
            label: store.translate('outline'),
            stretch: true,
            value: layer.outline ?? 0,
            min: 0,
            max: 1,
            step: 0.05,
            scale: 100,
            precision: 0,
            onChange: (value) => patchLayer(layer.id, { outline: value }),
          }),
          h('input', {
            key: 'outlineColor',
            type: 'color',
            value: normalizeColor(layer.outlineColor) || '#000000',
            title: store.translate('outlineColor'),
            onChange: (event) => patchLayer(layer.id, { outlineColor: event.target.value }),
            style: { width: 20, height: 20, padding: 0, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 5, background: 'transparent', cursor: 'pointer' },
          }),
          h(Stepper, {
            key: 'shadow',
            label: store.translate('shadow'),
            stretch: true,
            value: layer.shadow ?? 0,
            min: 0,
            max: 1,
            step: 0.05,
            scale: 100,
            precision: 0,
            onChange: (value) => patchLayer(layer.id, { shadow: value }),
          }),
        ]),
        h('div', { key: 'pos', style: { display: 'flex', gap: 10 } }, [
          h(Stepper, {
            key: 'x',
            label: 'X%',
            stretch: true,
            value: layer.x,
            min: 0,
            max: 1,
            step: 0.01,
            scale: 100,
            precision: 0,
            onChange: (value) => patchLayer(layer.id, { x: value }),
          }),
          h(Stepper, {
            key: 'y',
            label: 'Y%',
            stretch: true,
            value: layer.y,
            min: 0,
            max: 1,
            step: 0.01,
            scale: 100,
            precision: 0,
            onChange: (value) => patchLayer(layer.id, { y: value }),
          }),
        ]),
        ]),
        ]);
      });

      const actionStyle = {
        padding: '5px 0',
        borderRadius: 7,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
      };
      const content = h('div', { key: 'pane-content', style: { display: 'flex', flexDirection: 'column', gap: 10 } }, [
        h('div', { key: 'actions', style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 } }, [
          h('button', {
            key: 'ai',
            type: 'button',
            onClick: () => { void askAgent(); },
            style: { ...actionStyle, border: '1px solid var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-brand-primary)' },
          }, store.translate('askAi')),
          h('button', {
            key: 'variants',
            type: 'button',
            onClick: makeVariants,
            style: actionStyle,
          }, store.translate('variants')),
          h('button', {
            key: 'import',
            type: 'button',
            onClick: () => document.getElementById('poster-studio-import')?.click(),
            style: actionStyle,
          }, store.translate('importPreset')),
          h('button', {
            key: 'export',
            type: 'button',
            onClick: exportPreset,
            style: actionStyle,
          }, store.translate('exportPreset')),
          h('input', {
            key: 'file',
            id: 'poster-studio-import',
            type: 'file',
            accept: 'application/json',
            onChange: importPreset,
            style: { display: 'none' },
          }),
        ]),
        ...layerControls,
        h('div', { key: 'addRow', style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 } }, [
          h('button', {
            key: 'addText',
            type: 'button',
            onClick: addLayer,
            disabled: spec.layers.length >= 12,
            style: { padding: '6px 0', borderRadius: 10, border: '1px dashed var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: FONT_STACK },
          }, `+ ${store.translate('addText')}`),
          h('button', {
            key: 'addImage',
            type: 'button',
            disabled: spec.layers.length >= 12,
            onClick: () => { pendingImageLayer.current = null; imageFileInput.current?.click(); },
            style: { padding: '6px 0', borderRadius: 10, border: '1px dashed var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: FONT_STACK },
          }, `+ ${store.translate('addImage')}`),
          h('button', {
            key: 'addQr',
            type: 'button',
            disabled: spec.layers.length >= 12,
            onClick: addQr,
            style: { padding: '6px 0', borderRadius: 10, border: '1px dashed var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: FONT_STACK },
          }, `+ ${store.translate('addQr')}`),
          h('button', {
            key: 'addBadge',
            type: 'button',
            disabled: spec.layers.length >= 12,
            onClick: addBadge,
            style: { padding: '6px 0', borderRadius: 10, border: '1px dashed var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: FONT_STACK },
          }, `+ ${store.translate('addBadge')}`),
        ]),
        h('input', {
          key: 'imageFile',
          ref: imageFileInput,
          type: 'file',
          accept: 'image/png,image/jpeg,image/webp,image/gif',
          onChange: (event) => { void onImageFile(event); },
          style: { display: 'none' },
        }),
      ]);

      const refreshPalettes = () => {
        store.customPalettes = Object.keys(store.customPaletteMap ?? {});
        PALETTES = BUILTIN_PALETTES.concat(store.customPalettes.map((name) => ({ name, colors: store.customPaletteMap[name] })));
      };

      const loadCustomPalettes = async () => {
        try {
          const response = await fetch('/poster-studio/palettes');
          if (!response.ok) return;
          const data = await response.json();
          const map = {};
          for (const entry of Array.isArray(data.palettes) ? data.palettes : []) {
            if (!entry || typeof entry.name !== 'string' || !entry.colors) continue;
            const colors = {};
            for (const key of COLOR_KEYS) {
              const value = normalizeColor(entry.colors[key]);
              colors[key] = value ?? '#000000';
            }
            map[entry.name] = colors;
          }
          store.customPaletteMap = map;
          refreshPalettes();
          store.emit();
        } catch { /* built-in palettes stay available */ }
      };

      const saveCustomPalette = async (name, colors) => {
        const next = { ...colors };
        for (const key of COLOR_KEYS) {
          const value = normalizeColor(next[key]);
          next[key] = value ?? '#000000';
        }
        try {
          const response = await fetch('/poster-studio/palettes', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, colors: next }),
          });
          if (!response.ok) return;
          const data = await response.json();
          const map = {};
          for (const entry of Array.isArray(data.palettes) ? data.palettes : []) {
            if (!entry || typeof entry.name !== 'string' || !entry.colors) continue;
            const fixed = {};
            for (const key of COLOR_KEYS) {
              const value = normalizeColor(entry.colors[key]);
              fixed[key] = value ?? '#000000';
            }
            map[entry.name] = fixed;
          }
          store.customPaletteMap = map;
          refreshPalettes();
          store.emit();
          setStatus(store.translate('paletteSaved'));
        } catch { /* the palette stays local */ }
      };

      const deleteCustomPalette = async (name) => {
        try {
          const response = await fetch(`/poster-studio/palettes?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
          if (!response.ok) return;
          const data = await response.json();
          const map = { ...(store.customPaletteMap ?? {}) };
          delete map[name];
          for (const entry of Array.isArray(data.palettes) ? data.palettes : []) {
            if (entry && typeof entry.name === 'string' && entry.colors) map[entry.name] = entry.colors;
          }
          store.customPaletteMap = map;
          refreshPalettes();
          store.emit();
        } catch { /* keep the list */ }
      };

      React.useEffect(() => {
        void loadCustomPalettes();
      }, []);

      const palette = h('div', { key: 'pane-palette', style: { display: 'flex', flexDirection: 'column', gap: 10 } }, [
        h('div', { key: 'palettes', style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, PALETTES.map((item) => h('button', {
          key: item.name,
          type: 'button',
          title: (store.customPalettes ?? []).includes(item.name) ? store.translate('deletePalette') : store.translate('applyPalette'),
          onClick: () => {
            if ((store.customPalettes ?? []).includes(item.name)) {
              void deleteCustomPalette(item.name);
              return;
            }
            store.applySpec({ colors: { ...item.colors } });
          },
          onContextMenu: (event) => {
            if ((store.customPalettes ?? []).includes(item.name)) return;
            event.preventDefault();
            const saved = window.prompt(store.translate('savePalette'), item.name);
            if (saved !== null) void saveCustomPalette(saved.trim() || item.name, item.colors);
          },
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 8px',
            borderRadius: 7,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'transparent',
            color: 'var(--dsw-alias-label-secondary)',
            fontSize: 11,
            cursor: 'pointer',
          },
        }, [
          h('span', {
            key: 'dot',
            style: { width: 10, height: 10, borderRadius: 3, background: item.colors.c3, border: `1px solid ${item.colors.c4}` },
          }),
          item.name,
          (store.customPalettes ?? []).includes(item.name) ? h('span', { key: 'x', style: { color: 'var(--dsw-alias-label-tertiary)' } }, '✕') : null,
        ]))),
        h('div', { key: 'swatches', style: { display: 'flex', gap: 6 } }, COLOR_KEYS.map((key) => h('label', {
          key,
          title: key,
          style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--dsw-alias-label-secondary)' },
        }, [
          h('input', {
            key: 'input',
            type: 'color',
            value: spec.colors[key],
            onChange: (event) => store.applySpec({ colors: { [key]: event.target.value } }),
            style: { width: 28, height: 28, padding: 0, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, background: 'transparent' },
          }),
          h('span', { key: 'name' }, key),
        ]))),
        h('div', { key: 'palettes', style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, PALETTES.map((item) => h('button', {
          key: item.name,
          type: 'button',
          onClick: () => store.applySpec({ colors: { ...item.colors } }),
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 8px',
            borderRadius: 7,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'transparent',
            color: 'var(--dsw-alias-label-secondary)',
            fontSize: 11,
            cursor: 'pointer',
          },
        }, [
          h('span', {
            key: 'dot',
            style: { width: 10, height: 10, borderRadius: 3, background: item.colors.c3, border: `1px solid ${item.colors.c4}` },
          }),
          item.name,
        ]))),
      ]);

      const backdrop = h('div', { key: 'pane-backdrop', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } }, [
        h(Slider, { key: 'scale', label: 'scale', value: spec.shader.scale, min: 0.2, max: 4, step: 0.01, onChange: (value) => store.applySpec({ shader: { scale: value } }) }),
        h(Slider, { key: 'speed', label: 'speed', value: spec.shader.speed, min: 0, max: 4, step: 0.05, onChange: (value) => store.applySpec({ shader: { speed: value } }) }),
        h(Slider, { key: 'offsetX', label: 'offsetX', value: spec.shader.offsetX, min: -4, max: 4, step: 0.01, onChange: (value) => store.applySpec({ shader: { offsetX: value } }) }),
        h(Slider, { key: 'offsetY', label: 'offsetY', value: spec.shader.offsetY, min: -4, max: 4, step: 0.01, onChange: (value) => store.applySpec({ shader: { offsetY: value } }) }),
        h(Slider, { key: 'grain', label: 'grain', value: spec.shader.grain, min: 0, max: 0.05, step: 0.001, onChange: (value) => store.applySpec({ shader: { grain: value } }) }),
        h(Slider, { key: 'bloom', label: 'bloom', value: spec.shader.bloom, min: 0, max: 1.5, step: 0.01, onChange: (value) => store.applySpec({ shader: { bloom: value } }) }),
        h(Slider, { key: 'vignette', label: 'vignette', value: spec.shader.vignette, min: 0, max: 1, step: 0.01, onChange: (value) => store.applySpec({ shader: { vignette: value } }) }),
        h(Slider, { key: 'lightCore', label: 'lightCore', value: spec.shader.lightCore, min: 0, max: 1, step: 0.01, onChange: (value) => store.applySpec({ shader: { lightCore: value } }) }),
        h(Slider, { key: 'lightHalo', label: 'lightHalo', value: spec.shader.lightHalo, min: 0, max: 1, step: 0.01, onChange: (value) => store.applySpec({ shader: { lightHalo: value } }) }),
        h('button', {
          key: 'paused',
          type: 'button',
          onClick: () => store.applySpec({ shader: { paused: !spec.shader.paused } }),
          style: {
            padding: '4px 10px',
            borderRadius: 7,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: spec.shader.paused ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
            color: 'var(--dsw-alias-label-secondary)',
            fontSize: 11,
            cursor: 'pointer',
          },
        }, spec.shader.paused ? '▶' : '❚❚'),
        h('div', {
          key: 'bgRow',
          style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 },
        }, [
          h('button', {
            key: 'bgUpload',
            type: 'button',
            onClick: () => bgFileInput.current && bgFileInput.current.click(),
            style: { padding: '4px 10px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 11, cursor: 'pointer' },
          }, store.translate('bgImage')),
          spec.background && spec.background.image ? h('button', {
            key: 'bgRemove',
            type: 'button',
            onClick: () => store.applySpec({ background: { image: '', opacity: spec.background?.opacity ?? 1 } }),
            style: { padding: '4px 10px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, cursor: 'pointer' },
          }, store.translate('bgImageRemove')) : null,
          spec.background && spec.background.image ? h(Slider, {
            key: 'bgOpacity',
            label: store.translate('bgOpacity'),
            stretch: true,
            value: spec.background.opacity ?? 1,
            min: 0,
            max: 1,
            step: 0.05,
            onChange: (value) => store.applySpec({ background: { image: spec.background.image, opacity: value } }),
          }) : null,
          h('input', {
            key: 'bgFile',
            ref: bgFileInput,
            type: 'file',
            accept: 'image/png,image/jpeg,image/webp',
            onChange: (event) => { void onBackgroundFile(event); },
            style: { display: 'none' },
          }),
        ]),
      ]);

      const variantsView = variants.length === 0
        ? h('div', { key: 'pane-variants-empty', style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, store.translate('variants'))
        : h('div', { key: 'pane-variants', style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 } }, variants.map((variant, index) => h('button', {
          key: `variant-${index}`,
          type: 'button',
          title: store.translate('applyVariant'),
          onClick: () => { store.applySpec(variant.spec); setTab('content'); },
          style: { padding: 0, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, overflow: 'hidden', background: 'transparent', cursor: 'pointer' },
        }, h('canvas', {
          ref: (node) => {
            if (!node) return;
            node.width = variant.canvas.width;
            node.height = variant.canvas.height;
            const context = node.getContext('2d');
            context.drawImage(variant.canvas, 0, 0);
          },
          style: { width: '100%', display: 'block' },
        }))));

      const clearLibrary = async () => {
        try {
          const response = await fetch('/poster-studio/exports', { method: 'DELETE' });
          if (!response.ok) return;
          setLibrary([]);
          setStatus(store.translate('libraryCleared'));
        } catch (error) {
          console.warn('poster-studio: the export library could not be cleared', error);
        }
      };

      const libraryView = library.length === 0
        ? h('div', { key: 'pane-library-empty', style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, store.translate('noExports'))
        : h('div', { key: 'pane-library', style: { display: 'flex', flexDirection: 'column', gap: 6 } }, [
          h('button', {
            key: 'clear',
            type: 'button',
            onClick: () => { void clearLibrary(); },
            style: { padding: '4px 8px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, cursor: 'pointer', alignSelf: 'flex-start', fontFamily: FONT_STACK },
          }, store.translate('clearLibrary')),
          ...library.map((entry) => h('div', {
          key: `${entry.name}-${library.indexOf(entry)}`,
          style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
        }, [
          h('img', {
            key: 'thumb',
            src: `/poster-studio/exports?file=${encodeURIComponent(entry.name)}`,
            alt: entry.name,
            style: { width: 52, height: 65, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--dsw-alias-border-l1)', flex: '0 0 auto', display: 'block', background: 'var(--dsw-alias-bg-layer-1)' },
          }),
          h('span', { key: 'name', style: { flex: '1 1 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.name),
          entry.spec
            ? h('button', {
              key: 'apply',
              type: 'button',
              onClick: () => { store.applySpec(entry.spec); setTab('content'); },
              style: { padding: '2px 8px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 11, cursor: 'pointer' },
            }, store.translate('applyVariant'))
            : null,
          ]))]);

      const tabs = [
        { id: 'content', label: store.translate('content') },
        { id: 'palette', label: store.translate('palette') },
        { id: 'backdrop', label: store.translate('backdrop') },
        { id: 'variants', label: store.translate('variantsTab') },
        { id: 'library', label: store.translate('library') },
      ];

      const tipRaf = React.useRef(0);
      const tipPos = React.useRef(null);
      const bgFileInput = React.useRef(null);

      /**
       * Position the hover size tooltip, throttled to one animation frame.
       * @param {any} event - the pointer move event.
       * @param {{ label: string, width: number, height: number }} item - the size entry.
       */
      const moveSizeTip = (event, item) => {
        const rect = panelRef.current ? panelRef.current.getBoundingClientRect() : null;
        if (!rect) return;
        tipPos.current = {
          x: Math.min(event.clientX - rect.left + 14, rect.width - 150),
          y: event.clientY - rect.top + 18,
          text: `${item.label} · ${item.width}×${item.height}`,
        };
        if (tipRaf.current) return;
        tipRaf.current = requestAnimationFrame(() => {
          tipRaf.current = 0;
          setSizeTip(tipPos.current);
        });
      };

      const stage = mode === 'all'
        ? h(GridStage, {
          spec,
          onSelect: (key) => { store.applySpec({ size: key }); setMode('single'); },
          onTipMove: moveSizeTip,
          onTipLeave: () => setSizeTip(null),
        })
        : h(PosterStage, { spec });

      if (!embedded && !openFlag && !store.open) {
        void openTick;
        return h('div', { key: 'anchor', style: { display: 'none' } });
      }

      return h('div', {
        ref: panelRef,
        style: {
          ...(fullscreen
            ? { position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 2147483646 }
            : embedded
              ? { position: 'relative', width: '100%', height: '100%', minHeight: 0 }
              : {
                position: 'fixed',
                ...(position ? { left: position.left, top: position.top } : { right: 16, bottom: 16 }),
                width: size.width,
                height: size.height,
                maxWidth: 'calc(100vw - 24px)',
                maxHeight: 'calc(100vh - 24px)',
                zIndex: 2147483646,
              }),
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: fullscreen || embedded ? 0 : 14,
          border: fullscreen || embedded ? 'none' : '1px solid var(--dsw-alias-border-l1)',
          background: fullscreen ? '#0a0a0c' : 'var(--dsw-alias-bg-overlay)',
          boxShadow: fullscreen || embedded ? 'none' : '0 24px 64px rgba(0,0,0,0.38)',
          pointerEvents: 'auto',
          fontFamily: FONT_STACK,
        },
      }, [
        h('div', {
          key: 'header',
          onMouseDown: embedded ? undefined : startDrag,
          style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--dsw-alias-border-l1)', cursor: embedded ? 'default' : 'move' },
        }, [
          h('select', {
            key: 'size',
            value: mode === 'all' ? 'all' : (SIZES[spec.size] ? spec.size : '__custom'),
            onChange: (event) => {
              if (event.target.value === 'all') { setMode('all'); return; }
              if (event.target.value === '__custom') {
                const current = parseSize(spec.size);
                setCustomSize({ w: String(current.width), h: String(current.height) });
                return;
              }
              setMode('single');
              store.applySpec({ size: event.target.value });
            },
            style: {
              padding: '4px 8px',
              borderRadius: 7,
              border: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-layer-1)',
              color: 'var(--dsw-alias-label-primary)',
              fontSize: 12,
            },
          }, [
            ...SIZE_ORDER.map((key) => h('option', { key, value: key }, `${SIZES[key].label} ${key}`)),
            h('option', { key: '__custom', value: '__custom' }, SIZES[spec.size] ? store.translate('customSize') : `${store.translate('customSize')} ${preset.width}×${preset.height}`),
            h('option', { key: 'all', value: 'all' }, store.translate('allSizes')),
          ]),
          h('span', { key: 'dims', style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, `${preset.width}×${preset.height}`),
          h('button', {
            key: 'fullscreen',
            type: 'button',
            title: fullscreen ? store.translate('restore') : store.translate('fullscreen'),
            'aria-label': fullscreen ? store.translate('restore') : store.translate('fullscreen'),
            onClick: () => setFullscreen(!fullscreen),
            style: {
              marginLeft: embedded ? 'auto' : 0,
              width: 26,
              height: 26,
              borderRadius: 7,
              border: '1px solid var(--dsw-alias-border-l1)',
              background: 'transparent',
              color: 'var(--dsw-alias-label-secondary)',
              cursor: 'pointer',
              fontSize: 12,
            },
          }, fullscreen ? '⤡' : '⛶'),
          embedded ? null : h('button', {
            key: 'close',
            type: 'button',
            title: store.translate('close'),
            'aria-label': store.translate('close'),
            onClick: () => { store.open = false; store.emit(); },
            style: {
              marginLeft: 'auto',
              width: 26,
              height: 26,
              borderRadius: 7,
              border: '1px solid var(--dsw-alias-border-l1)',
              background: 'transparent',
              color: 'var(--dsw-alias-label-secondary)',
              cursor: 'pointer',
              fontSize: 13,
            },
          }, '✕'),
        ]),
        h('div', {
          key: 'workbench',
          style: { flex: '1 1 auto', minHeight: 0, display: 'flex', overflow: 'hidden' },
        }, [
          h('div', {
            key: 'stage',
            style: { flex: '1 1 auto', minWidth: 0, display: 'flex', overflow: 'hidden', background: 'var(--dsw-alias-bg-layer-1)' },
          }, stage),
          fullscreen ? null : h('div', {
            key: 'controls',
            style: {
              flex: '0 0 300px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              borderLeft: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-layer-1)',
            },
          }, [
            h('div', {
              key: 'tabs',
              style: {
                display: 'flex',
                gap: 2,
                margin: '8px 10px 0',
                padding: 2,
                borderRadius: 8,
                border: '1px solid var(--dsw-alias-border-l1)',
                background: 'var(--dsw-alias-bg-layer-2)',
              },
            }, tabs.map((item) => h('button', {
              key: item.id,
              type: 'button',
              onClick: () => setTab(item.id),
              style: {
                flex: '1 1 0',
                minWidth: 0,
                padding: '4px 0',
                borderRadius: 6,
                border: 'none',
                background: tab === item.id ? 'var(--dsw-alias-bg-overlay)' : 'transparent',
                color: tab === item.id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: FONT_STACK,
                whiteSpace: 'nowrap',
              },
            }, item.label))),
            h('div', {
              key: 'body',
              style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: 10 },
            }, tab === 'content' ? content
              : tab === 'palette' ? palette
                : tab === 'backdrop' ? backdrop
                  : tab === 'variants' ? variantsView : libraryView),
          ]),
        ]),
        fullscreen ? null : h('div', {
          key: 'footer',
          style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--dsw-alias-border-l1)' },
        }, [
          h('button', {
            key: 'export',
            type: 'button',
            onClick: () => { void exportPng(); },
            style: {
              padding: '5px 12px',
              borderRadius: 7,
              border: '1px solid var(--dsw-alias-brand-primary)',
              background: 'transparent',
              color: 'var(--dsw-alias-brand-primary)',
              fontSize: 12,
              cursor: 'pointer',
            },
          }, store.translate('export')),
          h('button', {
            key: 'exportAll',
            type: 'button',
            title: store.translate('exportAllHint'),
            onClick: () => { void exportAllSizes(); },
            style: {
              padding: '5px 12px',
              borderRadius: 7,
              border: '1px solid var(--dsw-alias-brand-primary)',
              background: 'transparent',
              color: 'var(--dsw-alias-brand-primary)',
              fontSize: 12,
              cursor: 'pointer',
            },
          }, store.translate('exportAll')),
          h('button', {
            key: 'saveVersion',
            type: 'button',
            title: store.translate('saveVersion'),
            onClick: () => {
              const name = window.prompt(store.translate('saveVersion'), '');
              if (name === null) return;
              void renderPng(store.spec).then((blob) => {
                let thumb = '';
                const done = (data) => {
                  const base64 = data.slice(data.indexOf(',') + 1);
                  void store.saveVersion(name, base64).then((ok) => { if (ok) setStatus(store.translate('versionSaved')); });
                };
                if (!blob) { done(''); return; }
                const image = new Image();
                const objectUrl = URL.createObjectURL(blob);
                image.onload = () => {
                  const canvas = document.createElement('canvas');
                  const ratio = image.naturalHeight / image.naturalWidth;
                  canvas.width = 128;
                  canvas.height = Math.max(1, Math.round(128 * ratio));
                  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                  URL.revokeObjectURL(objectUrl);
                  done(canvas.toDataURL('image/jpeg', 0.7));
                };
                image.onerror = () => { URL.revokeObjectURL(objectUrl); done(''); };
                image.src = objectUrl;
              });
            },
            style: { padding: '5px 10px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, cursor: 'pointer' },
          }, '💾'),
          h('button', {
            key: 'versions',
            type: 'button',
            title: store.translate('versions'),
            onClick: () => {
              void store.loadVersions();
              setVersionsOpen((current) => !current);
            },
            style: {
              padding: '5px 10px',
              borderRadius: 7,
              border: '1px solid var(--dsw-alias-border-l1)',
              background: versionsOpen ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
              color: 'var(--dsw-alias-label-secondary)',
              fontSize: 12,
              cursor: 'pointer',
            },
          }, '🕘'),
          h('button', {
            key: 'undo',
            type: 'button',
            title: store.translate('undo'),
            onClick: () => store.undo(),
            style: { padding: '5px 10px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, cursor: 'pointer' },
          }, '↶'),
          h('button', {
            key: 'redo',
            type: 'button',
            title: store.translate('redo'),
            onClick: () => store.redo(),
            style: { padding: '5px 10px', borderRadius: 12, border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, cursor: 'pointer' },
          }, '↷'),
          h('button', {
            key: 'reset',
            type: 'button',
            onClick: () => store.applySpec(defaultSpec()),
            style: { padding: '5px 10px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, cursor: 'pointer' },
          }, store.translate('reset')),
          h('span', {
            key: 'status',
            style: { marginLeft: 'auto', fontSize: 10, color: 'var(--dsw-alias-label-secondary)', maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          }, status),
        ]),
        fullscreen || embedded ? null : h('div', { key: 'rez', style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 } }, [
          h('div', { key: 'e', onMouseDown: (event) => startResize(event, 'e'), style: { position: 'absolute', right: 0, top: 8, bottom: 8, width: 6, cursor: 'ew-resize', pointerEvents: 'auto' } }),
          h('div', { key: 's', onMouseDown: (event) => startResize(event, 's'), style: { position: 'absolute', bottom: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize', pointerEvents: 'auto' } }),
          h('div', { key: 'se', onMouseDown: (event) => startResize(event, 'se'), style: { position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, cursor: 'nwse-resize', pointerEvents: 'auto' } }),
        ]),
        sizeTip && mode === 'all'
          ? h('div', {
            key: 'sizeTip',
            style: {
              position: 'absolute',
              left: sizeTip.x,
              top: sizeTip.y,
              zIndex: 20,
              pointerEvents: 'none',
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(24,24,28,0.94)',
              border: '1px solid var(--dsw-alias-border-l1)',
              color: 'var(--dsw-alias-label-primary)',
              fontSize: 11,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            },
          }, sizeTip.text)
          : null,
        versionsOpen
          ? h('div', {
            key: 'versionsDialog',
            onMouseDown: (event) => event.stopPropagation(),
            onClick: () => setVersionsOpen(false),
            style: { position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' },
          }, h('div', {
            onClick: (event) => event.stopPropagation(),
            style: { width: 300, maxHeight: '70%', overflowY: 'auto', padding: 12, borderRadius: 12, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-overlay)', boxShadow: '0 16px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 8 },
          }, [
            h('span', { key: 'title', style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, store.translate('versions')),
            (store.versions ?? []).length === 0
              ? h('span', { key: 'empty', style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, store.translate('versionsEmpty'))
              : null,
            ...(store.versions ?? []).map((entry) => h('div', {
              key: entry.id,
              style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)' },
            }, [
              entry.thumb
                ? h('img', {
                  key: 'thumb',
                  src: `data:image/jpeg;base64,${entry.thumb}`,
                  alt: '',
                  style: { width: 34, height: 44, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--dsw-alias-border-l1)', background: '#000', flex: '0 0 auto' },
                })
                : h('span', { key: 'dot', style: { width: 34, height: 44, borderRadius: 4, background: 'var(--dsw-alias-bg-layer-2)', flex: '0 0 auto' } }),
              h('div', {
                key: 'info',
                style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', cursor: 'pointer' },
                onClick: () => {
                  void (async () => {
                    try {
                      const response = await fetch(`/poster-studio/version?id=${encodeURIComponent(entry.id)}`);
                      if (!response.ok) return;
                      const data = await response.json();
                      if (data && data.spec) {
                        store.applySpec(data.spec);
                        setStatus(store.translate('versionLoaded'));
                        setVersionsOpen(false);
                      }
                    } catch { /* the load failed silently */ }
                  })();
                },
              }, [
                h('span', { key: 'name', style: { fontSize: 12, color: 'var(--dsw-alias-label-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.name),
                h('span', { key: 'time', style: { fontSize: 10, color: 'var(--dsw-alias-label-tertiary)' } }, String(entry.savedAt ?? '').slice(0, 16).replace('T', ' ')),
              ]),
              h('button', {
                key: 'del',
                type: 'button',
                title: store.translate('removeLayer'),
                onClick: () => { void store.deleteVersion(entry.id); },
                style: { padding: '2px 6px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, cursor: 'pointer' },
              }, '✕'),
            ])),
          ]))
          : null,
        customSize
          ? h('div', {
            key: 'customSizeDialog',
            onMouseDown: (event) => event.stopPropagation(),
            style: { position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' },
          }, h('div', {
            style: { width: 236, padding: 14, borderRadius: 12, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-overlay)', boxShadow: '0 16px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 10 },
          }, [
            h('span', { key: 'title', style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, store.translate('customSize')),
            h('div', { key: 'rows', style: { display: 'flex', gap: 10 } }, [
              h('label', { key: 'w', style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' } }, [
                store.translate('canvasWidth'),
                h('input', {
                  key: 'in',
                  type: 'number',
                  min: 200,
                  max: 4000,
                  value: customSize.w,
                  onChange: (event) => setCustomSize((current) => ({ ...current, w: event.target.value })),
                  style: { width: '100%', padding: '5px 8px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 13, outline: 'none' },
                }),
              ]),
              h('label', { key: 'h', style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' } }, [
                store.translate('canvasHeight'),
                h('input', {
                  key: 'in',
                  type: 'number',
                  min: 200,
                  max: 4000,
                  value: customSize.h,
                  onChange: (event) => setCustomSize((current) => ({ ...current, h: event.target.value })),
                  style: { width: '100%', padding: '5px 8px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 13, outline: 'none' },
                }),
              ]),
            ]),
            h('span', { key: 'hint', style: { fontSize: 10, color: 'var(--dsw-alias-label-tertiary)' } }, store.translate('customSizeHint')),
            h('div', { key: 'actions', style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } }, [
              h('button', {
                key: 'cancel',
                type: 'button',
                onClick: () => setCustomSize(null),
                style: { padding: '5px 12px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, cursor: 'pointer' },
              }, store.translate('cancel')),
              h('button', {
                key: 'apply',
                type: 'button',
                onClick: () => {
                  const width = Math.min(4000, Math.max(200, Math.round(Number(customSize.w)) || 0));
                  const height = Math.min(4000, Math.max(200, Math.round(Number(customSize.h)) || 0));
                  setMode('single');
                  store.applySpec({ size: `${width}x${height}` });
                  setCustomSize(null);
                },
                style: { padding: '5px 12px', borderRadius: 7, border: 'none', background: 'var(--dsw-alias-brand-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' },
              }, store.translate('apply')),
            ]),
          ]))
          : null,
      ]);
    }

    /**
     * The sidebar panel icon rendered by the shell's panel rail.
     * @param {{ size?: number, active?: boolean }} props - owner-supplied icon props.
     * @returns {React.ReactElement} the icon element.
     */
    function PosterSidebarIcon(props) {
      const edge = props.size ?? 16;
      return h('span', {
        // Marker for the document-level click interceptor: clicks anywhere
        // on this sidebar row must open the floating studio instead of
        // navigating the main column.
        'data-poster-icon': 'studio',
        style: { display: 'inline-flex', alignItems: 'center' },
      }, h('svg', {
        width: edge,
        height: edge,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: props.active ? 'var(--dsw-alias-brand-primary)' : 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }, [
        h('rect', { key: 'frame', x: 4.5, y: 3, width: 15, height: 18, rx: 2 }),
        h('circle', { key: 'orb', cx: 12, cy: 9.5, r: 2.1 }),
        h('path', { key: 'ridge', d: 'M7 17.5l3.2-4 2.3 2.8 1.9-2.3 2.6 3.5' }),
      ]));
    }

    /**
     * The inline poster card shown for the design tool call.
     * @param {Record<string, any>} props - tool view props.
     * @returns {React.ReactElement} the card element.
     */
    function PosterToolView(props) {
      React.useEffect(() => {
        const block = props && props.block;
        const sources = block && typeof block === 'object'
          ? [block.value, block.result, block.output, block.args, block.data]
          : [];
        for (const raw of sources) {
          let value = raw;
          if (typeof raw === 'function') {
            try { value = raw(); } catch { value = undefined; }
          }
          if (value && typeof value === 'object' && value.size && value.layers) {
            store.replaceSpec(value);
            break;
          }
        }
        const sessionId = props.posterSessionId ?? props.sessionId;
        if (sessionId !== undefined) store.sessionId = sessionId;
      });

      const spec = store.spec;
      const preset = parseSize(spec.size);
      const width = 420;
      const height = Math.round((width * preset.height) / preset.width);
      const shown = Math.min(height, 300);

      return h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          border: '1px solid var(--dsw-alias-border-l1)',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'var(--dsw-alias-bg-layer-1)',
          fontFamily: FONT_STACK,
        },
      }, [
        h('div', {
          key: 'preview',
          style: { position: 'relative', width: '100%', height: shown, overflow: 'hidden' },
        }, h(PosterCanvas, { spec, width, height: shown })),
        h('div', {
          key: 'actions',
          style: { display: 'flex', justifyContent: 'flex-end', padding: '0 10px 10px' },
        }, h('button', {
          type: 'button',
          onClick: () => {
            store.sessionId = props.posterSessionId ?? props.sessionId;
            store.open = true;
            store.emit();
          },
          style: {
            padding: '4px 10px',
            borderRadius: 8,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'transparent',
            color: 'var(--dsw-alias-label-secondary)',
            fontFamily: FONT_STACK,
            fontSize: 12,
            cursor: 'pointer',
          },
        }, store.translate('openTitle'))),
      ]);
    }

    /** Required client services. */
    const inject = ['slots', 'locale', 'sessions'];

    /**
     * Register the studio dictionaries for every language the UI offers.
     * @param {unknown} ctx - client context.
     * @param {Set<string>} registered - locales that already carry a dictionary.
     * @param {Array<() => void>} disposers - collects the registration disposers.
     */
    function registerDictionaries(ctx, registered, disposers) {
      const snapshot = ctx.locale.getSnapshot();
      for (const definition of snapshot.locales) {
        const id = String(definition.id);
        if (registered.has(id)) continue;
        const dictionary = id.toLowerCase().startsWith('zh') ? DICTIONARIES.zh : DICTIONARIES.en;
        try {
          const dispose = ctx.locale.register('poster-studio', id, dictionary);
          if (typeof dispose === 'function') disposers.push(dispose);
          registered.add(id);
        } catch { /* this locale id is not a usable tag for the dictionary registry */ }
      }
    }

    /**
     * Register the studio surfaces.
     * @param {unknown} ctx - client context.
     */
    function apply(ctx) {
      store.ctx = ctx;
      store.remote = true;
      ctx.effect(() => {
        const fontFace = document.createElement('style');
        fontFace.textContent = FONT_FACE_CSS;
        document.head.appendChild(fontFace);
        return () => fontFace.remove();
      });
      const registered = new Set();
      ctx.effect(() => {
        const disposers = [];
        registerDictionaries(ctx, registered, disposers);
        ctx.on('locale/change', () => registerDictionaries(ctx, registered, disposers));
        return () => {
          for (const dispose of disposers) {
            try { dispose(); } catch { /* the registry may already be gone */ }
          }
        };
      });
      try {
        const bound = ctx.locale.bind('poster-studio');
        store.translate = (key) => {
          const value = bound(key);
          if (value !== key) return value;
          const active = String(ctx.locale.getSnapshot().active || '').toLowerCase();
          const dictionary = active.startsWith('zh') ? DICTIONARIES.zh : DICTIONARIES.en;
          return dictionary[key] ?? value;
        };
      } catch {
        store.translate = (key) => DICTIONARIES.en[key] ?? key;
      }

      try { window.__posterInjected = true; } catch (error) { void error; }
      try {
        const shape = { keys: Object.getOwnPropertyNames(ctx), reflect: ctx.reflect ? Object.getOwnPropertyNames(Object.getPrototypeOf(ctx.reflect) || {}) : null };
        try { shape.modulesKeys = ctx.modules ? Object.getOwnPropertyNames(ctx.modules) : (ctx.reflect && ctx.reflect.read ? Object.getOwnPropertyNames(ctx.reflect.read('modules') || {}) : null); } catch (e) { shape.modulesErr = String(e).slice(0, 80); }
        window.__posterCtxShape = shape;
      } catch (error) { window.__posterCtxShape = { err: String(error).slice(0, 120) }; }

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'poster-studio',
        order: 40,
      }, () => h(PosterPanelHost, {})));

      // Invisible per-session binder: keeps store.sessionId pointing at the
      // live conversation so the studio can queue agent prompts. It also
      // doubles as a floating panel host so the studio still opens when a
      // host freezes the frame-level overlay seat.
      ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: 'poster-studio-session-bind',
        inject: (sessionId) => ({ posterSessionId: sessionId }),
      }, class SessionBinder extends React.Component {
        bind() {
          const sessionId = this.props.posterSessionId ?? this.props.sessionId;
          if (sessionId !== undefined) store.sessionId = sessionId;
        }
        componentDidMount() { this.bind(); }
        componentDidUpdate() { this.bind(); }
        render() { return h(PosterPanelHost, {}); }
      }));

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: 'poster-studio-row',
        order: 12,
        label: () => store.translate('studio'),
      }, PosterSidebarIcon));

      // The sidebar row addresses a main panel; this placeholder exists so
      // the row renders. Clicks are intercepted to open the float instead;
      // if navigation ever happens, the column shows a hint, not a blank.
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: 'poster-studio',
      }, class MainPlaceholder extends React.Component {
        componentDidMount() { store.open = true; store.emit(); }
        open() { store.open = true; store.emit(); }
        render() {
          return h('div', {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, height: '100%', fontFamily: FONT_STACK, fontSize: 13, color: 'var(--dsw-alias-label-secondary)' },
          }, [
            h('div', { key: 'hint' }, store.translate('studioFloatHint')),
            h('button', {
              key: 'open',
              type: 'button',
              onClick: () => this.open(),
              style: { padding: '5px 12px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-primary)', fontFamily: FONT_STACK, fontSize: 12, cursor: 'pointer' },
            }, store.translate('openTitle')),
            h(PosterPanelHost, { key: 'host' }),
          ]);
        }
      }));

      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'poster_design',
        inject: (sessionId) => ({ posterSessionId: sessionId }),
      }, makeMountedShell((props) => h(PosterToolView, props))));
    }

    return { inject, apply };
  },
});
