export type DayReplayBridge = {
  /** dayOffset: 0=今天，1=昨天，2=前天 */
  readDay?: (dayOffset: number) => string;
  readToday?: () => string;
  requestAccess?: () => void;
};

export function dayReplayBridge(
  scope: typeof globalThis = globalThis,
): DayReplayBridge | undefined {
  return (scope as { SmDayReplay?: DayReplayBridge }).SmDayReplay;
}

export function hasDayReplayBridge(scope: typeof globalThis = globalThis) {
  const bridge = dayReplayBridge(scope);
  return (
    typeof bridge?.readDay === "function" ||
    typeof bridge?.readToday === "function"
  );
}

/** 优先按日窗口读；旧桥只在补今天时回退到 readToday。 */
export function readDayReplay(
  bridge: DayReplayBridge,
  dayOffset: number,
): string | undefined {
  const offset = Math.min(Math.max(0, Math.trunc(dayOffset)), 2);
  if (typeof bridge.readDay === "function") {
    return bridge.readDay(offset);
  }
  if (offset === 0 && typeof bridge.readToday === "function") {
    return bridge.readToday();
  }
  return undefined;
}
