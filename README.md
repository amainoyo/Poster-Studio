# Poster Studio（海报创作）

**作者 Author**: Oyang · **License**: MIT · **Requires DSH ≥ 0.2.0**

[简体中文](#简体中文) · [English](#english)

---

<a id="简体中文"></a>

## 简体中文

DeepSeek Harness 桌面版插件：浮动海报设计面板（可拖动 / 缩放 / 关闭，不占用对话主列），
官网着色器背景 + 中英文字体，全部设计要素可视化编辑，也可在**任意会话用自然语言直接驱动**。

### 功能一览

- **画布**：5 个预设尺寸（1080×1350 / 1080×1920 / 1920×1080 / 1080×1080 / 1200×628）+ 自定义 WxH（200–4000）；「全部尺寸」网格模式带虚线适配预览
- **图层**：文字 / 图片 / 二维码 / 角标四类；锁定、拖拽对齐吸附（画布中线 / 三分线 / 其他图层边缘，容差 6px）
- **文字**：字号 8–2000，字重 100–900 全连续（中文自动挂思源黑体可变字体），6 款在线中文字体（fonts.loli.net，离线回退系统字体），描边 / 阴影（平方根响应曲线，低档灵敏）
- **背景**：着色器 5 色槽 + 调校参数；背景图上传（自动压缩 jpeg ≤2400px，cover 铺满 + 透明度）；内置配色方案库 6 套 + 自定义保存
- **工作流**：💾 命名版本快照（🕘 面板：缩略图列表、一键回滚、删除——本体与索引同清）；AI 文案 / 批量变体；导入 / 导出 JSON 模板（图片全部内嵌，跨机可用）
- **导出**：面板「导出 PNG」弹系统另存为；同时自动回流一份到宿主 `exports/`，供 `poster_export` 工具在会话里直接交付

### 自然语言用法（任意会话）

面板由宿主侧 `poster_design` / `poster_export` 两个工具驱动，描述含中英触发词，中文会话直接说即可：

- 「把海报换成青绿色调」→ poster_design 改 colors
- 「海报背景换成 D:\某图.jpg」（≤4MB）→ background.image 支持本地路径，宿主自动内嵌
- 「给海报加一个金色 2027 大字层」→ layers 参数增改任意图层（增量：未提及的层不受影响）
- 「不要副标题了」「把二维码删掉」→ remove: ["subtitle", "qr1"] 按图层 id 删除；删背景图用 background.image ""
- 「把海报导出来」→ poster_export 交付最近一次面板导出

### 安装

**方式 A（免构建，推荐）**：从 [Releases](../../releases) 下载 `oyang-dsh-poster-studio-<version>.tgz` 并解包，在 DSH 插件管理执行 install_bundle 指向解包目录，重启 DSH。

**方式 B（源码）**：

```
git clone https://github.com/amainoyo/Poster-Studio
cd Poster-Studio
npm run build        # 产物 client.js 不入库；改过模板/资源必须重建
```

然后在 DSH 插件管理执行 install_bundle 指向本目录，重启 DSH。

热更语义（开发时）：**Client 改动**（改模板后重新 build）刷新 DSH 窗口即生效；**Host 改动**（index.js）需重启桌面应用——工具与路由在启动时注册。

### 运行时数据（`~/.dsh/poster-studio/`）

| 文件 | 内容 |
|---|---|
| spec.json | 当前设计（宿主内存为准，客户端 3s 轮询同步） |
| versions.json | 历史版本索引（名称 / 时间 / 128px 缩略图，≤50） |
| versions/{id}.json | 版本快照本体（回滚数据源；面板删除按钮会连索引一起清） |
| palettes.json | 自定义配色（≤24 套） |
| exports/ | 面板导出回流的 PNG（≤20 个，poster_export 工具取最新） |

### 目录结构

```
index.js                Host：poster_design / poster_export 工具、/poster-studio/* 路由、spec/版本/配色持久化
src/client.template.js  Client 完整源码（工作台 UI、三层画布着色器渲染器）
build.cjs               构建：内联字体 base64、二维码库、内置预设、vendored React UMD 对
assets/                 内联字体（DM Sans / Montserrat，SIL OFL，见 NOTICE）
presets/                内置预设（路由不可达时的面板兜底；格式=导出模板格式）
scripts/                测试脚本（host-api-smoke.mjs 冒烟 / patch-semantics.test.mjs 语义单测）
locale/                 插件界面词条（管理页摘要取 meta.description）
```

### 实现要点（改动前必读）

- 渲染为三层画布：WebGL2 着色器 → 背景图 2D 叠加层 → 文字 2D 层（同一画布不能同时取 WebGL 与 2D 上下文）；预览 / 导出 PNG / 导出全部尺寸 / AI 变体 / 版本缩略图共用同一合成管线
- 自带 React 18 UMD 渲染对（宿主 React 版本漂移免疫）；宿主挂载入口全部 hook-free class 壳 + 多槽位租约
- 路由必须经 `ctx.inject(['connection','webServer'], …)` 延迟挂载（服务未就绪时一次性读取会静默跳过注册）
- Electron 中 `window.prompt/alert/confirm` 是 no-op，一律面板内自绘对话框
- 主题变量必须带暗色兜底：`var(--dsw-alias-label-primary, #e8e8ee)`（部分 token 运行时缺失）
- 工具返回给模型的输出一律有界：图片 dataURL 脱敏、render 摘要给全状态（信息不足模型就会自己去翻源码）
- 回归：`node scripts/host-api-smoke.mjs`（临时 profile，ALL PASS）+ `node scripts/patch-semantics.test.mjs`

---

<a id="english"></a>

## English

A poster-design plugin for [DeepSeek Harness](https://deepseek.com) desktop: a floating studio panel (draggable, resizable, never in the way) with the official-site animated shader backdrop and CN/EN typography — every design element is editable visually, **or driven in plain language from any chat session**.

### Highlights

- **Canvas**: 5 presets (1080×1350 / 1080×1920 / 1920×1080 / 1080×1080 / 1200×628) plus custom W×H (200–4000); an all-sizes grid preview with dashed fit guides
- **Layers**: text / image / QR code / badge; locking and drag-to-snap alignment (centre, thirds, other layers' edges)
- **Typography**: sizes 8–2000 px, continuous weight axis 100–900 (Chinese auto-binds the Source Han variable font), 6 online Chinese faces, outline & shadow with perceptual response curves
- **Backgrounds**: 5-slot shader palette with full tuning, backdrop image upload (auto-compressed, cover-fit, opacity), 6 built-in palettes + save your own
- **Workflow**: named version snapshots with thumbnails and one-click rollback, AI copywriting & batch variants, JSON template import/export (images embedded, portable across machines)
- **Export**: system Save-As dialog for PNG, plus an automatic copy returned to the host so the `poster_export` chat tool can deliver it

### Natural-language control

Two host tools (`poster_design`, `poster_export`) are registered globally; their descriptions carry Chinese and English trigger words. Just say:

- "Retint the poster to teal tones" / 「把海报换成青绿色调」
- "Use D:\photo.jpg as the backdrop" (≤4 MB; local paths are inlined automatically)
- "Add a big golden 2027 headline" (incremental layer patch — other layers untouched)
- "Remove the subtitle and the QR code" (removal by layer id; `background.image: ""` drops the backdrop)
- "Export the poster" / 「把海报导出来」

### Install

**Option A (no build, recommended)**: download `oyang-dsh-poster-studio-<version>.tgz` from [Releases](../../releases), extract it, then run `install_bundle <extracted directory>` in the DSH plugin manager and restart DSH.

**Option B (from source)**:

```
git clone https://github.com/amainoyo/Poster-Studio
cd Poster-Studio
npm run build
```

Then `install_bundle <this directory>` in the plugin manager and restart DSH. During development, client-side changes only need a window refresh after `npm run build`; host-side changes (`index.js`) require an app restart because tools and routes register at boot.

### Development checks

```
node scripts/host-api-smoke.mjs        # HTTP routes against a throwaway profile — expect ALL PASS
node scripts/patch-semantics.test.mjs  # layer-patch semantics unit tests
```

### License

MIT (see [LICENSE](LICENSE)). Bundled third-party assets keep their own licenses as listed in [NOTICE](NOTICE) — notably the DM Sans and Montserrat fonts under the SIL Open Font License.
