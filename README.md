# 小日程（ScheduleMINI）

情侣互知桌面小工具：各自写日程，悬浮窗并排看 **我 / 对方** 的 Now 与 Next。本机 JSON 优先，邀请码加密同步。

## 功能

- **主界面**：周视图 / 列表编辑日程（每周 / 仅一次；生效日起；单次取消；交通起终点；标签；按归属着色）
- **设置**（右上角，分栏）：**我们** / **显示** / **数据**
- **归属**：自己 / 对方 / 共同；本地始终可编双方与共同（配对仅用于同步）
- **单人模式**：悬浮窗收成单栏；主界面仍可编辑
- **共处模式**：主界面与小窗可开启；结束时可写入共同日程
- **批量**：列表勾选或周视图 Shift+点击 → 删除 / 改标签 / 改归属
- **多端同步**：设备同步码；房间为联合维护的共享日程文档
- 节假日、开始前提醒、开机自启、托盘

## 配对与同步

### 邀请对方（最多两个身份）

1. 设置 → **我们** →「邀请对方」→「生成邀请码」  
2. 对方输入 6 位邀请码并「加入」  
3. 中继按 personId 存加密切片；拉取对方时翻转 `owner`；条目 LWW  

### 多端同步（同一人）

1. 设备 A：设置 → **我们** →「多端同步」→「复制设备同步码」  
2. 设备 B：粘贴 →「在此设备接入」  
3. 共享同一 `memberId`，合并本人日程（不翻转归属）  

### 中继（默认已连 Railway）

`https://schedulemini-production.up.railway.app`  
最多 2 个 personId；同 id 多设备 LWW 覆盖。房间切片为 **shared-v2** 全量共享文档（`owner: shared` 在翻转时保留）。见 `sync-relay/README.md`。

**每次合并含 `sync-relay/server.mjs` 的改动后，请在 Railway 用仓库根 `Dockerfile` 重新部署**，再做双机邀请码联调。

```bash
curl -sS https://schedulemini-production.up.railway.app/health
npm run sync-relay
# 设置里改为 http://127.0.0.1:8787
```

设置 → **我们** →「同步中继」可改；优先级：**设置页 > `VITE_SYNC_RELAY_URL` > 内置 Railway**。

Windows 托盘 / 自启 / 通知 / 拖拽记忆：见 [docs/acceptance.md](docs/acceptance.md) 勾选表（须本机点验）。

## 自动更新

应用启动时检查 GitHub 最新 Release，桌面端一键下载安装并重启。发版流程与签名密钥配置见 [docs/release.md](docs/release.md)。

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

Android 调试包见 [docs/android.md](docs/android.md)。
