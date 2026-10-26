export type DayReplayBridge = {
  readToday?: () => string;
  requestAccess?: () => void;
};

export function dayReplayBridge(
  scope: typeof globalThis = globalThis,
): DayReplayBridge | undefined {
  return (scope as { SmDayReplay?: DayReplayBridge }).SmDayReplay;
}

export function hasDayReplayBridge(scope: typeof globalThis = globalThis) {
  return typeof dayReplayBridge(scope)?.readToday === "function";
}
