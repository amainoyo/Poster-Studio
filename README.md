# Poster Studio（海报创作）

DeepSeek Harness 桌面版插件：浮动海报设计面板（可拖动 / 缩放 / 关闭，不占用对话主列），
官网着色器背景 + 中英文字体，全部设计要素可视化编辑，也可在**任意会话用自然语言直接驱动**。

## 功能一览

- **画布**：5 个预设尺寸（1080×1350 / 1080×1920 / 1920×1080 / 1080×1080 / 1200×628）+ 自定义 WxH（200–4000）；「全部尺寸」网格模式带虚线适配预览
- **图层**：文字 / 图片 / 二维码 / 角标四类；锁定、拖拽对齐吸附（画布中线 / 三分线 / 其他图层边缘，容差 6px）
- **文字**：字号 8–2000，字重 100–900 全连续（中文自动挂思源黑体可变字体），6 款在线中文字体（fonts.loli.net，离线回退系统字体），描边 / 阴影（平方根响应曲线，低档灵敏）
- **背景**：着色器 5 色槽 + 调校参数；背景图上传（自动压缩 jpeg ≤2400px，cover 铺满 + 透明度）；内置配色方案库 6 套 + 自定义保存
- **工作流**：💾 命名版本快照（🕘 面板：缩略图列表、一键回滚、删除——本体与索引同清）；AI 文案 / 批量变体；导入 / 导出 JSON 模板（图片全部内嵌，跨机可用）
- **导出**：面板「导出 PNG」弹系统另存为；同时自动回流一份到宿主 `exports/`，供 `poster_export` 工具在会话里直接交付

## 自然语言用法（任意会话）

面板由宿主侧 `poster_design` / `poster_export` 两个工具驱动，描述含中英触发词，中文会话直接说即可：

- 「把海报换成青绿色调」→ poster_design 改 colors
- 「海报背景换成 D:\某图.jpg」（≤4MB）→ background.image 支持本地路径，宿主自动内嵌
- 「给海报加一个金色 2027 大字层」→ layers 参数增改任意图层
- 「把海报导出来」→ poster_export 交付最近一次面板导出

## 目录结构

```
index.js                Host：poster_design / poster_export 工具、/poster-studio/* 路由、spec/版本/配色持久化
src/client.template.js  Client 完整源码（工作台 UI、三层画布着色器渲染器）
build.cjs               构建：内联字体 base64、二维码库、内置预设、vendored React UMD 对
assets/                 内联字体（DM Sans / Montserrat，取自官网）
presets/                内置预设（路由不可达时的面板兜底；格式=导出模板格式）
scripts/                预设生成脚本
locale/                 插件界面词条
cordis.patch.yml        bundle 挂载清单（侧栏行、浮动面板、会话绑定、工具）
icon.svg                侧栏图标
```

## 构建与安装

```
node build.cjs          # 产物 client.js 不入库；改过模板/资源必须重建
```

当前为 **link 安装**（profile 里 junction 指向本目录），热更语义分两层：

- **Client 改动**（client.template.js → build 出 client.js）：刷新 DSH 窗口即生效
- **Host 改动**（index.js）：需重启桌面应用（工具注册在启动时执行）

重装（换 profile 或首次安装）：`plugin_manager` → install_bundle `<本目录绝对路径>`。

## 运行时数据（`~/.dsh/poster-studio/`）

| 文件 | 内容 |
|---|---|
| spec.json | 当前设计（宿主内存为准，客户端 3s 轮询同步） |
| versions.json | 历史版本索引（名称 / 时间 / 128px 缩略图，≤50） |
| versions/{id}.json | 版本快照本体（回滚数据源；面板删除按钮会连索引一起清） |
| palettes.json | 自定义配色（≤24 套） |
| exports/ | 面板导出回流的 PNG（≤20 个，poster_export 工具取最新） |

## 实现要点（改动前必读）

- 渲染为三层画布：WebGL2 着色器 → 背景图 2D 叠加层 → 文字 2D 层（同一画布不能同时取 WebGL 与 2D 上下文）；预览 / 导出 PNG / 导出全部尺寸 / AI 变体 / 版本缩略图共用同一合成管线
- 自带 React 18 UMD 渲染对（宿主 React 版本漂移免疫）；宿主挂载入口全部 hook-free class 壳 + 多槽位租约
- Electron 中 `window.prompt/alert/confirm` 是 no-op，一律面板内自绘对话框
- 主题变量必须带暗色兜底：`var(--dsw-alias-label-primary, #e8e8ee)`（部分 token 运行时缺失）
- 工具返回给模型的输出一律有界：图片 dataURL 脱敏、render 摘要给全状态（信息不足模型就会自己去翻源码）
