# Android

手机包复用桌面同一套界面、日程存储和加密中继。窄屏（≤760px）打开就是「此刻」：我 / 对方的现在与下一程，以及共处。底栏进入周、列表、新建和设置。桌面窗口仍是周视图 / 列表。

主屏幕小组件「此刻」在添加时选择自己、对方或双方，默认双方。它读应用配置目录里的 `widget-snapshot.json`。这份文件在打开应用和保存日程时，从同一份 `config.json` 写出来。点小组件打开「此刻」。悬浮窗、托盘和开机自启只在桌面。

长按主屏幕，选小部件，找到小日程的「此刻」。已放上的小组件可以再编辑，改看自己、对方或双方。

## 环境

- Node.js 20+
- Rust stable，以及 Android 目标：

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

- JDK 17
- Android SDK、NDK、平台工具。装好后：

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/<ndk 版本目录>"
```

Tauri 会读这两个变量。NDK 用 SDK Manager 安装的当前 side-by-side 版本即可。

## 初始化（已进仓库）

`src-tauri/gen/android` 是 `tauri android init` 的工程。Android 只开主窗口，配置在 `src-tauri/tauri.android.conf.json`。清单权限：`INTERNET`（中继）、`POST_NOTIFICATIONS`（开始前提醒）。Debug 包允许 http 中继；正式包走 https。

若要在新机器上重做初始化：

```bash
npm install
npm run tauri android init
```

## 装到手机的包

```bash
npm install
npm run tauri android build -- --apk --target aarch64
```

产物：`src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`

```bash
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

正式包把前端打进 APK，从 `tauri.localhost` 本地加载。设置了 `ANDROID_KEYSTORE_PATH` 等环境变量时用发布密钥签名，否则用本机调试签名。应用内更新要求新旧包签名一致，发给别人的包统一走 Release workflow（见 [release.md](release.md)）。

## 应用内更新

启动时检查 GitHub 最新 Release，找到 `.apk` 附件后弹窗。点「更新」：未允许安装未知应用时提示「去开启」并跳到系统设置；已允许则下载到应用目录，完成后打开系统安装界面。清单权限 `REQUEST_INSTALL_PACKAGES`，经 `FileProvider` 交给安装器。

不要把 `--debug` 包发给别人。debug 包不带前端，启动时去连电脑上的开发服务器 `127.0.0.1:45231`，没有电脑就一直停在启动画面。

启动顺序：系统先画纸色启动底和图标，HTML 里内联同色的「小日程」，React 挂上后直接出「此刻」。节假日数据、编辑器、提醒和同步都在首屏之后再加载。字体不阻塞首屏，拿不到 Google Fonts 时用系统字体。

## 开发

连着电脑看界面、改前端：

```bash
npm run tauri android dev
```

模拟器或已连接的设备都要先能被 `adb devices` 看到。
