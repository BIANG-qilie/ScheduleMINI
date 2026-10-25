/**
 * 手机上更新弹窗离屏幕底边的距离（px）。
 * 按钮留在拇指区，并高出系统手势条；矮屏不再额外上抬，避免把操作顶出可视区域。
 */
export function updateDialogLift(viewportHeight: number, safeAreaBottom = 0): number {
  const height = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  const safe = Number.isFinite(safeAreaBottom) ? Math.max(0, safeAreaBottom) : 0;
  const gestureClearance = Math.max(28, safe + 16);
  const tallLift = height >= 800 ? 56 : height >= 700 ? 24 : 0;
  const offset = gestureClearance + tallLift;
  const cap = Math.max(28, Math.round(height * 0.22));
  return Math.min(offset, cap);
}

/** 读取视口底部安全区。浏览器不支持 env() 时为 0。 */
export function readSafeAreaBottom(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.paddingBottom = "env(safe-area-inset-bottom, 0px)";
  document.body.appendChild(probe);
  const value = Number.parseFloat(getComputedStyle(probe).paddingBottom);
  probe.remove();
  return Number.isFinite(value) ? value : 0;
}
