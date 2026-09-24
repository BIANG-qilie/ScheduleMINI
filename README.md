# 小日程（ScheduleMINI）

情侣互知桌面小工具：各自写日程，悬浮窗并排看 **我 / 对方** 的 Now 与 Next。本机 JSON 优先，邀请码加密同步。

## 功能

- **我们**：显示名与颜色；邀请码配对（最多 2 人）
- **日程**：每周 / 仅一次；生效日起；单次取消；交通起终点；标签
- **周视图 / 列表**：按所属人着色（我 / 对方）
- **悬浮窗**：双栏 Now/Next；未配对时仅自己 + 配对提示
- 节假日、开始前提醒、开机自启、托盘、导入导出

## 配对与同步

1. 一端「生成邀请码」，把 6 位码发给对方  
2. 另一端在「我们」里输入码并「加入」  
3. 两端自动推送自己的加密日程切片，拉取对方的；冲突按条目 `updatedAt` 后写覆盖  

### 中继（默认已连 Railway）

应用默认中继：`https://schedulemini-production.up.railway.app`  
设置 → **我们** →「同步中继」可改；「恢复默认」清空自定义。

优先级：**设置页 > `VITE_SYNC_RELAY_URL` > 内置 Railway**。

本地另起中继：

```bash
npm run sync-relay
# 设置里改为 http://127.0.0.1:8787
```

跨设备自建时部署 `sync-relay`，再在设置里填公网地址（或构建时设 `VITE_SYNC_RELAY_URL`，仅当设置项为空时生效）。

## 环境要求

- Node.js 20+
- Rust **1.85+**
- [Tauri 前置依赖](https://tauri.app/start/prerequisites/)

## 开发

```bash
npm install
npm run sync-relay   # 另开终端
npm run dev          # http://127.0.0.1:45231
npm run tauri dev
```

- 设置：http://127.0.0.1:45231/
- 悬浮窗：http://127.0.0.1:45231/?view=widget  

同机测双人：两个浏览器配置文件（或无痕 + 普通），一端生成码、一端加入。

## 构建与测试

```bash
npm run tauri build
npm test
npm run build && npm run test:e2e
```

一键拉取 `main` 并只编译 exe（跳过 MSI）：

```bash
npm run pull:build
```

产物：`src-tauri/target/release/desktop-schedule-widget.exe`。
