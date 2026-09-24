# 小日程（ScheduleMINI）

Tauri 2 + React + TypeScript 桌面应用：周视图管理日程，置顶悬浮窗显示当前与下一程。配置保存在本机 JSON。

## 功能

- 日程 CRUD：每周重复或仅一次（指定日期）
- 周视图（默认）：7 列时间轴
- 悬浮窗 Now/Next
- 系统托盘：打开设置 / 显示隐藏悬浮窗 / 退出
- `chinese-days` 离线节假日
- 导入导出 `AppConfig`

## 环境要求

- Node.js 20+
- Rust **1.85+**（推荐 `stable`；仓库含 `rust-toolchain.toml`）
- [Tauri 前置依赖](https://tauri.app/start/prerequisites/)（Windows 需 WebView2）

## 开发

```bash
npm install
npm run dev          # 前端预览，端口 45231
npm run tauri dev    # 完整桌面壳
```

- 设置页：http://127.0.0.1:45231/
- 悬浮窗：http://127.0.0.1:45231/?view=widget

## 构建

```bash
npm run tauri build
```

产物在 `src-tauri/target/release/bundle/`。

## 配置格式

```json
{
  "version": 1,
  "showHolidays": true,
  "widgetVisible": true,
  "widgetMode": "current",
  "settingsViewMode": "week",
  "items": []
}
```

`weekdays`：`0` = 周日 … `6` = 周六。样例见 `public/sample-config.json`。
