type SmBoot = {
  html?: () => void;
  ready?: () => void;
  recover?: () => void;
  restart?: () => void;
};

function bridge(): SmBoot | undefined {
  return (globalThis as { SmBoot?: SmBoot }).SmBoot;
}

/** 已经要求壳重载或重启。这一页随后的 ready 不能把新页面的看门狗关掉。 */
let leaving = false;

function call(name: keyof SmBoot) {
  try {
    bridge()?.[name]?.();
  } catch {
    // 桌面没有这条桥
  }
}

/** 文档已经解析。安卓用它判断自定义协议有没有把页面送回来。 */
export function markBootHtml() {
  call("html");
}

/** 界面可以点了。先补一次 html，避免文档脚本没跑到时看门狗把已经画出来的页面重载掉。 */
export function markBootReady() {
  if (leaving) return;
  call("html");
  call("ready");
}

/** 同一条 IPC 已经超时。让壳重载 WebView，换一条通道。 */
export function requestBootReload() {
  leaving = true;
  call("recover");
}

/** 重载几次仍超时。让壳重启进程。 */
export function requestBootRestart() {
  leaving = true;
  call("restart");
}
