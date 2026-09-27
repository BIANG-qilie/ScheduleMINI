import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  APP_DISPLAY_NAME,
  formatDateKey,
  todaysItems,
  type AppConfig,
  type ScheduleItem,
} from "@/lib/config";
import { laneSelfItems } from "@/lib/sync/couple";
import { isTauriRuntime } from "@/lib/utils";

const FIRED_KEY = "xiaoricheng-reminder-fired";
const POLL_MS = 30_000;

function loadFired(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveFired(fired: Set<string>) {
  try {
    // 只保留最近 200 条，避免无限增长
    const list = [...fired];
    const trimmed = list.length > 200 ? list.slice(-200) : list;
    localStorage.setItem(FIRED_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore quota errors
  }
}

function reminderKey(item: ScheduleItem, dateKey: string, minutes: number) {
  return `${item.id}|${dateKey}|${minutes}`;
}

function itemStartDate(item: ScheduleItem, now: Date) {
  const [h, m] = item.start.split(":").map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  return at;
}

async function ensurePermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }
  return granted;
}

export async function tickReminders(config: AppConfig, now = new Date()) {
  if (!isTauriRuntime() || !config.remindersEnabled) return;

  const minutes = config.reminderMinutesBefore;
  const dateKey = formatDateKey(now);
  const windowMs = minutes * 60_000;
  const fired = loadFired();
  let dirty = false;

  for (const item of todaysItems(
    laneSelfItems(config.items),
    now,
    config.dayOverrides,
  )) {
    const startAt = itemStartDate(item, now);
    const delta = startAt.getTime() - now.getTime();
    if (delta <= 0 || delta > windowMs) continue;

    const key = reminderKey(item, dateKey, minutes);
    if (fired.has(key)) continue;

    const ok = await ensurePermission();
    if (!ok) return;

    sendNotification({
      title: `${APP_DISPLAY_NAME} · ${item.title}`,
      body: `${item.start} 开始`,
    });
    fired.add(key);
    dirty = true;
  }

  if (dirty) saveFired(fired);
}

/** 启动提醒轮询；返回停止函数 */
export function startReminderLoop(getConfig: () => AppConfig): () => void {
  if (!isTauriRuntime()) return () => undefined;

  const run = () => {
    void tickReminders(getConfig());
  };
  run();
  const id = window.setInterval(run, POLL_MS);
  return () => window.clearInterval(id);
}
