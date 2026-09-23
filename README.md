# 小日程（ScheduleMINI）

Tauri 2 + React + TypeScript 桌面应用：设置窗用周视图管理每周循环日程，置顶悬浮窗聚焦「当前 / 下一程」。配置保存在本机 JSON，支持导入导出。

## 功能

- 日程 CRUD：时间范围、标题、备注；**每周重复**或**仅一次（指定日期）**
- **周视图（默认）**：本周 7 列时间轴；点空白新建、点色块编辑；琥珀色块为仅一次
- 悬浮窗 Now/Next：当前日程醒目、下一程淡化；临近结束暖色提示
- 系统托盘：打开小日程 / 显示隐藏悬浮窗 / 退出（关闭设置窗不退出）
- `chinese-days` 离线节假日数据
- 导入导出整份 `AppConfig`（导入前二次确认）

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
