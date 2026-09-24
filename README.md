# 小日程（ScheduleMINI）

Tauri 2 + React + TypeScript 桌面应用：周视图管理日程，置顶悬浮窗显示当前与下一程。配置保存在本机 JSON。

## 功能

- 日程 CRUD：每周重复或仅一次；周循环可单次取消；标签「工作 / 交通 / 学习 / 休息 / 生活 / 其他」（仅周循环工作项放假日跳过；仅一次不受放假影响）
- 周视图：7 列时间轴、翻周、节假日标注、单日放假/上班覆盖
- 可调周视图时段（如 7:00–18:00）
- 悬浮窗 Now/Next：透明度；拖拽改大小并记忆位置尺寸
- 课前提醒：开始前 5/10/15 分钟系统通知
- 开机自启
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

## 测试

```bash
npm test              # Vitest
npm run build && npm run test:e2e   # Playwright
```

验收基线见 [docs/acceptance.md](docs/acceptance.md)、[AGENTS.md](AGENTS.md)。


```json
{
  "version": 1,
  "showHolidays": true,
  "widgetVisible": true,
  "widgetMode": "current",
  "settingsViewMode": "week",
  "autostart": false,
  "remindersEnabled": true,
  "reminderMinutesBefore": 10,
  "widgetOpacity": 0.92,
  "gridStartHour": 7,
  "gridEndHour": 22,
  "dayOverrides": {},
  "items": []
}
```

`weekdays`：`0` = 周日 … `6` = 周六。样例见 `public/sample-config.json`。
