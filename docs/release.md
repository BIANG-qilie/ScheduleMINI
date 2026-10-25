# 发版与自动更新

小日程先读 Sealos 国内镜像，镜像失败再读 GitHub Releases。GitHub 仍是唯一真源，签名校验不变。

| 端 | 来源 | 行为 |
| --- | --- | --- |
| 安卓版本提示 | `…/schedulemini/android-latest.json`，失败再请求 `api.github.com/.../releases/latest` | 启动时与每 6 小时检查一次，弹窗：更新 / 稍后 / 跳过此版本 |
| 桌面安装 | 先 `…/schedulemini/latest.json`，再 `releases/latest/download/latest.json`（Tauri updater，公钥不变） | 下载、安装、重启 |
| 安卓安装 | 镜像 APK 核对 sha256 后交给系统安装器；校验或下载失败再下 GitHub 上的同一包并再核对。镜像清单不存在时仍直接下 GitHub | 系统还会核对 APK 签名 |

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

## 一次性配置：安卓发布密钥

安卓只接受同一签名的覆盖安装。生成一次 keystore 并长期保存：

```bash
keytool -genkeypair -v -keystore schedulemini-release.jks -alias schedulemini \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 schedulemini-release.jks   # macOS: base64 -i schedulemini-release.jks
```

| Secret | 值 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | 上面 base64 输出 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | `schedulemini` |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |

已装调试签名包（如 `android-debug-ff4f`）的手机需卸载后装一次正式签名包，之后即可应用内更新。

## 发版

1. 改版本号并提交（见上），合入 `main`。
2. `git tag v0.3.0 && git push origin v0.3.0`。
3. `Release` workflow 构建 Windows（NSIS/MSI）与 macOS（universal）并发布 Release，附 `latest.json`；随后构建安卓 `ScheduleMINI-<版本>-universal.apk` 上传到同一 Release。五个已有密钥（`MIRROR_S3_ENDPOINT`、`MIRROR_S3_BUCKET`、`MIRROR_PUBLIC_BASE`、`MIRROR_S3_ACCESS_KEY`、`MIRROR_S3_SECRET_KEY`）齐全时，再把这些安装包和签名文件同步到镜像：`schedulemini/v<版本>/` 放文件，`schedulemini/latest.json` 只改下载地址、不动 `signature`，`schedulemini/android-latest.json` 带版本、APK 地址、sha256 和说明。密钥缺了就跳过镜像；密钥在且上传失败则这个 job 失败，GitHub Release 本身已经发出来了。
4. Release 说明写在 workflow 的 `releaseBody` 里，前几行会出现在更新弹窗。GitHub 发布完成后客户端就能检测到；镜像上的两个 json 要等安装包传完才写。
