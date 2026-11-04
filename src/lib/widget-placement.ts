export type PxRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MonitorAreas = {
  bounds: PxRect;
  work: PxRect;
};

/**
 * 悬浮窗外接矩形是否真的在某块显示器上。
 *
 * 规则：和每一块显示器的完整范围（左上角 + 分辨率，不扣任务栏）
 * 都没有正面积重叠，就是屏幕外。只贴着边、重叠面积为 0，不算在屏幕上。
 * Windows 最小化时把窗口停在 (-32000, -32000)，靠这条规则就能认出来，
 * 不单独写这个坐标。没有显示器数据时无法证明它在所有屏幕之外，返回 true。
 */
export function isWidgetRectOnScreen(
  widget: PxRect,
  monitors: readonly PxRect[],
): boolean {
  if (monitors.length === 0) return true;
  if (!isPositiveRect(widget)) return false;
  return monitors.some((monitor) => positiveAreaOverlap(widget, monitor));
}

/**
 * 可见、没最小化、并且外接矩形确实落在某块显示器上。
 * 设置按钮和托盘都用这个，而不是「窗口还标着已显示」。
 */
export function widgetIsPresented(
  visible: boolean,
  minimized: boolean,
  onScreen: boolean,
): boolean {
  return visible && !minimized && onScreen;
}

/**
 * 屏幕外的窗口该搬到哪。已经在某块显示器上时返回 null。
 *
 * 目标是最近一块显示器的工作区左上角：程序没有给悬浮窗写死坐标，
 * 第一次出现时系统也是把它放在主屏工作区的左上角附近。
 * 距离相同的时候用数组里更靠前的那块；调用方应把主屏放在第一位。
 */
export function nearestWorkAreaOrigin(
  widget: PxRect,
  monitors: readonly MonitorAreas[],
): { x: number; y: number } | null {
  if (
    monitors.length === 0 ||
    isWidgetRectOnScreen(
      widget,
      monitors.map((monitor) => monitor.bounds),
    )
  ) {
    return null;
  }
  let best = 0;
  let bestGap = gapSquared(widget, monitors[0].bounds);
  for (let index = 1; index < monitors.length; index += 1) {
    const gap = gapSquared(widget, monitors[index].bounds);
    if (gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  }
  const work = monitors[best].work;
  return { x: work.x, y: work.y };
}

function isPositiveRect(rect: PxRect): boolean {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function positiveAreaOverlap(a: PxRect, b: PxRect): boolean {
  if (!isPositiveRect(b)) return false;
  const overlapW = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapH = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapW > 0 && overlapH > 0;
}

function gapSquared(a: PxRect, b: PxRect): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const dx = ax2 < b.x ? b.x - ax2 : bx2 < a.x ? a.x - bx2 : 0;
  const dy = ay2 < b.y ? b.y - ay2 : by2 < a.y ? a.y - by2 : 0;
  return dx * dx + dy * dy;
}
