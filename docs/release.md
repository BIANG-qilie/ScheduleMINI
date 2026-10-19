# 发版与自动更新

小日程从公开的 GitHub Releases 读取更新：

| 端 | 来源 | 行为 |
| --- | --- | --- |
| 应用内提示（全部端） | `api.github.com/repos/BIANG-qilie/ScheduleMINI/releases/latest` | 启动时与每 6 小时检查一次，弹窗：更新 / 稍后 / 跳过此版本 |
| 桌面安装 | `releases/latest/download/latest.json`（Tauri updater，签名校验） | 下载、安装、重启 |
| 安卓安装 | Release 中的 `.apk`（优先 `universal`） | 下载后交给系统安装器 |

设置 → 数据 → 关于：查看当前版本、手动检查更新。只有 `vX.Y.Z` 形式的正式 Release 参与比较；草稿、调试标签（如 `android-debug-ff4f`）不会触发提示。

## 版本号

`package.json` 是唯一版本源；`tauri.conf.json` 用 `"version": "../package.json"` 引用，`Cargo.toml` 由脚本同步：

```bash
npm version 0.3.0 --no-git-tag-version
npm run version:sync
```

## 一次性配置：签名密钥

Tauri updater 只安装用私钥签过名的包。公钥已写入 `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`。私钥不进仓库，放进 GitHub → Settings → Secrets and variables → Actions：

| Secret | 值 |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | 私钥文件全文 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码（当前密钥无密码，留空字符串或不建） |

换密钥：`npx tauri signer generate -w ~/.tauri/schedulemini.key`，把新公钥写进 `tauri.conf.json`。换钥后旧版本无法自动升级到新签名的包，需要手动装一次。

## 发版

1. 改版本号并提交（见上），合入 `main`。
2. `git tag v0.3.0 && git push origin v0.3.0`。
3. `Release` workflow 构建 Windows（NSIS/MSI）与 macOS（universal）并生成草稿 Release，附 `latest.json`。
4. 在 GitHub 编辑草稿 Release 的说明（首几行会显示在更新弹窗里），点 **Publish**。发布后客户端即可检测到。
