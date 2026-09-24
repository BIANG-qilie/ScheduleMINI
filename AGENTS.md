# Agent 指南（小日程 / ScheduleMINI）

## 产品

- 品牌名：**小日程**（`APP_DISPLAY_NAME`）
- 技术栈：Tauri 2 + React + TypeScript + Vite + Tailwind
- 本地优先，无账号 / 云同步

## 验收基线

**唯一基线**：GitHub 仓库 [`BIANG-qilie/ScheduleMINI`](https://github.com/BIANG-qilie/ScheduleMINI) 的 `main` 最新提交。

不要用过期 zip、旧笔记或第三方 fork 作为验收依据。本地开发请：

```bash
git pull origin main   # 或当前工作分支
npm install
npm run test
npm run build
```

详见 [docs/acceptance.md](docs/acceptance.md)。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 前端预览 :45231 |
| `npm run tauri dev` | 完整桌面壳 |
| `npm run pull:build` | 拉取 `origin/main` 并编译 release exe（`--no-bundle`） |
| `npm test` | Vitest 单元测试 |
| `npm run test:e2e` | Playwright（端口 45331，默认不复用脏服务） |
| `npm run test:all` | 单测 + 构建 + E2E |

CI：`.github/workflows/ci.yml`（与 `docs/github-ci.yml` 同步）。推送到 GitHub 需 token 含 **workflow** scope。

## 约束

- 中文 UI；文案避免多余操作说明（anti-defensive-writing）
- 配置校验失败不得静默回退为样例日程
- `fs:scope` 不含 `$HOME/**`
- 不擅自开 PR（除非用户明确要求）
