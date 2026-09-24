# 验收基线

## 源码真相

| 项 | 约定 |
| --- | --- |
| 正式仓库 | https://github.com/BIANG-qilie/ScheduleMINI |
| 基线分支 | `main` 最新 commit |
| 过期产物 | zip、旧截图笔记、临时 agent 仓 **不作** 验收依据 |

拉齐本地：

```bash
git fetch origin
git checkout main
git pull origin main
npm ci
npm run test:all
```

## 自动化门槛（CI）

本地：

- `npm run test`（Vitest）
- `npm run build`
- `npm run test:e2e`（Playwright Chromium，预览服）

GitHub Actions 模板见 [docs/github-ci.yml](github-ci.yml)。仓库已包含 `.github/workflows/ci.yml`；若 push 因缺少 `workflow` scope 被拒，请在 GitHub 网页粘贴该模板或为 token 勾选 workflow 后再推。

E2E 使用端口 **45331**（非开发 45231），默认不 `reuseExistingServer`，避免脏端口。需要复用时设 `E2E_REUSE=1`。

## 功能抽检（桌面）

1. 设置页标题为「小日程」；周视图可见节假日（如 2026-09-25 中秋）
2. 新建跨日日程（如 22:00–06:00）可保存；小窗在晚间/凌晨正确识别 NOW
3. 损坏 `config.json` 后启动：提示错误 + 空日程，**不是**样例晨会
4. 导入非法 JSON：设置页内红色错误，不弹系统 alert 作为唯一反馈
5. 拖拽悬浮窗大小/位置，重启后仍在

## Windows 原生回归（本机）

在 Windows 上 `npm run tauri build` 安装后检查：

- 托盘打开设置 / 显隐悬浮窗 / 退出
- 开机自启开关
- 课前提醒通知（已安装包；开发态可能显示 PowerShell 名）
- 关闭设置窗不退出进程

Cloud Linux 环境无法替代此项；记录结果到 PR 或 issue 即可。
