# Poster Studio（海报创作）

DeepSeek Harness 桌面版插件：侧栏入口打开浮动海报设计面板，
使用官网着色器背景与中英文字体，支持自定义标题、文本、着色器颜色，
批量变体、导出图库、导出 PNG（系统「另存为」对话框，自选路径命名）。

## 目录结构

```
index.js                Host 侧：poster_design / poster_export 工具、/poster-studio/* 路由、spec 持久化
src/client.template.js  Client 侧完整源码（工作台 UI，着色器渲染器）
build.cjs               构建脚本：把 assets/ 里的 woff2 字体 base64 内联进模板
assets/                 内联字体（DMSans / Montserrat，取自官网）
locale/                 插件自身的界面词条
cordis.patch.yml        bundle 挂载清单（侧栏行、浮动面板、会话绑定、工具）
icon.svg                侧栏图标
```

## 构建

```
node build.cjs
```

产物 `client.js` 为构建输出，不入库；安装插件前必须先构建。

## 安装 / 升级（桌面版）

在 DSH 的插件管理里执行（或让 agent 调用 plugin_manager）：

1. `node build.cjs`
2. remove_bundle `@local/dsh-poster-studio`
3. install_bundle `<本目录绝对路径>`

## 运行时数据

- 设计稿持久化：`~/.dsh/poster-studio/spec.json`（Host 内存为准，3s 轮询同步）
- 浮窗位置 / 尺寸：浏览器 localStorage（`poster-studio-panel` / `poster-studio-size`）
