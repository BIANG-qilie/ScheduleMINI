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

### 中继（默认无需自建云账号）

仓库自带轻量中继（内存房间，不存明文）：

```bash
npm run sync-relay
# http://127.0.0.1:8787
```

前端默认连该地址。跨设备时把 `sync-relay` 部署到任意免费 Node 主机，并设置：

```bash
VITE_SYNC_RELAY_URL=https://your-relay.example.com
```

密钥由邀请码在本地派生（AES-GCM）；中继只存密文。

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
