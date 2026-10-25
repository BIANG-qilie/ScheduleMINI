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
6. 共处：开 → 暂停 → 继续 → 结束确认 → 列表出现「共处」共同条目（壁钟块 + 净时长备注）
7. 批量：列表勾选或周视图 Shift+点击 → 改标签 / 改归属 / 删除

## Windows 原生回归（本机勾选）

Cloud Linux **不能**代跑。在 Windows 上：

```bash
git pull origin main
npm ci
npm run tauri build
```

安装产物后逐项勾选，结果记到 issue / PR 评论：

| # | 项 | 步骤 | 期望 | ☑ |
| --- | --- | --- | --- | --- |
| W1 | 托盘 → 设置 | 托盘图标右键 / 单击 → 打开设置 | 主窗「小日程」出现 | ☐ |
| W2 | 托盘 → 显隐悬浮窗 | 托盘切换显示/隐藏 | 小窗显隐与设置开关一致 | ☐ |
| W3 | 托盘 → 退出 | 托盘选退出 | 进程结束，托盘图标消失 | ☐ |
| W4 | 开机自启 | 设置 → 显示 → 开机自启开/关，注销或重启 | 开：登录后自动起；关：不起 | ☐ |
| W5 | 课前提醒通知 | 建一条数分钟后开始的日程，开提醒 | 到点系统通知（已安装包；开发态可能显示 PowerShell 名） | ☐ |
| W6 | 拖拽位置记忆 | 拖移并缩放悬浮窗，完全退出再开 | 位置与大小恢复 | ☐ |
| W7 | 关设置不退进程 | 关闭设置窗 | 托盘与悬浮窗仍在 | ☐ |

## 同步中继

默认：`https://ejdibhezdfvv.sealosgzg.site`

步骤见仓库 `sync-relay/README.md`。

烟测：

```bash
curl -sS https://ejdibhezdfvv.sealosgzg.site/health
# → {"ok":true,"rooms":…,"maxPersons":2,"wait":true}
```
