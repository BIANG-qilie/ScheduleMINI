# 桌面日程小窗

Tauri 2 + React + TypeScript 桌面应用：设置窗口管理每周循环日程，置顶无边框悬浮窗展示今日安排与中国大陆法定节假日/调休标签。配置保存在本机 JSON，支持导入导出。

## 功能

- 日程 CRUD：时间范围、标题、备注、星期循环、启用开关
- 悬浮窗：始终置顶、可拖拽、当前时段高亮、节假日条
- 系统托盘：打开设置 / 显示隐藏悬浮窗 / 退出（关闭设置窗不退出）
- `chinese-days` 离线节假日数据
- 导入导出整份 `AppConfig`（导入前二次确认）

## 环境要求

- Node.js 20+
- Rust（[Tauri 前置依赖](https://tauri.app/start/prerequisites/)）
- Windows 为第一期主目标；macOS / Linux 可开发运行

## 开发

```bash
npm install

# 仅前端（浏览器预览，端口 45231）
npm run dev

# 完整桌面壳（双窗 + 托盘）
npm run tauri dev
```

浏览器预览：

- 设置页：[http://127.0.0.1:45231/](http://127.0.0.1:45231/)
- 悬浮窗预览：[http://127.0.0.1:45231/?view=widget](http://127.0.0.1:45231/?view=widget)

配置在浏览器模式下写入 `localStorage`；在 `tauri dev` / 安装包中写入应用配置目录的 `config.json`。

## 构建安装包

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
  "items": [
    {
      "id": "sample-morning",
      "start": "09:00",
      "end": "10:00",
      "title": "晨会",
      "note": "同步今日重点",
      "weekdays": [1, 2, 3, 4, 5],
      "enabled": true
    }
  ]
}
```

`weekdays`：`0` = 周日 … `6` = 周六。样例见 `public/sample-config.json`。

## 说明

- Android / 云同步不在本期范围
- 节假日数据年份随 `chinese-days` 依赖升级；设置页会标注覆盖范围
