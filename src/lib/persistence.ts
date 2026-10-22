import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  CONFIG_FILE_NAME,
  type AppConfig,
  defaultConfig,
  emptyConfig,
  parseAppConfig,
  safeParseAppConfig,
} from "@/lib/config";
import { isTauriRuntime } from "@/lib/utils";
import {
  WIDGET_SNAPSHOT_FILE,
  buildWidgetSnapshot,
} from "@/lib/widget-snapshot";

const LOCAL_STORAGE_KEY = "desktop-schedule-widget:config";

/** 安卓上配置目录 IPC 的回包可能被丢掉，Promise 不再结束。 */
export const CONFIG_IO_TIMEOUT_MS = 4_000;
export const CONFIG_IO_ATTEMPTS = 3;

export class ConfigIoTimeoutError extends Error {
  readonly step: string;
  constructor(step: string) {
    super(step);
    this.name = "ConfigIoTimeoutError";
    this.step = step;
  }
}

export type ConfigIo = {
  mkdir: () => Promise<void>;
  exists: () => Promise<boolean>;
  readText: () => Promise<string>;
  writeText: (text: string) => Promise<void>;
};

/** 挂起的 IPC 不拒绝。到点只放弃这一次，调用方再读。 */
export function withIoTimeout<T>(
  work: Promise<T>,
  ms: number,
  step: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ConfigIoTimeoutError(step));
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class ConfigLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ConfigLoadError";
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

async function ensureConfigDir() {
  try {
    await mkdir("", { baseDir: BaseDirectory.AppConfig, recursive: true });
  } catch {
    // 目录已存在时忽略
  }
}

function formatZodIssuesZh(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  const parts = error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.filter(Boolean).join(".");
    const msg = issue.message;
    if (path) return `${path}：${msg}`;
    return msg;
  });
  const more =
    error.issues.length > 5 ? `（另有 ${error.issues.length - 5} 项）` : "";
  return parts.join("；") + more;
}

function notifyHomeWidget() {
  const bridge = (
    globalThis as {
      SmWidget?: { notifyScheduleChanged?: () => void };
    }
  ).SmWidget;
  try {
    bridge?.notifyScheduleChanged?.();
  } catch {
    // 桌面端没有这个接口
  }
}

let snapshotGeneration = 0;

/** 从已校验的配置写出小组件快照。配置文件仍是唯一来源。 */
export async function persistWidgetSnapshot(config: AppConfig): Promise<void> {
  if (!isTauriRuntime()) return;
  const generation = ++snapshotGeneration;
  try {
    const snapshot = await buildWidgetSnapshot(config);
    if (generation !== snapshotGeneration) return;
    await writeTextFile(WIDGET_SNAPSHOT_FILE, JSON.stringify(snapshot), {
      baseDir: BaseDirectory.AppConfig,
    });
    if (generation !== snapshotGeneration) return;
    notifyHomeWidget();
  } catch {
    // 配置已经落盘。快照下次保存或打开应用时再写。
  }
}

function parseConfigText(text: string): AppConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ConfigLoadError(
      "配置不是合法 JSON",
      { cause: error },
    );
  }
  const parsed = safeParseAppConfig(raw);
  if (!parsed.success) {
    throw new ConfigLoadError(
      `配置内容无效：${formatZodIssuesZh(parsed.error)}`,
    );
  }
  return parsed.data;
}

async function readConfigOnce(
  io: ConfigIo,
  timeoutMs: number,
  afterLoad?: (config: AppConfig) => void,
): Promise<AppConfig> {
  try {
    await withIoTimeout(io.mkdir(), timeoutMs, "mkdir");
  } catch (error) {
    if (error instanceof ConfigIoTimeoutError) throw error;
  }

  const fileExists = await withIoTimeout(io.exists(), timeoutMs, "exists");
  if (!fileExists) {
    const initial = parseAppConfig(defaultConfig());
    await withIoTimeout(
      io.writeText(JSON.stringify(initial, null, 2)),
      timeoutMs,
      "write",
    );
    afterLoad?.(initial);
    return initial;
  }

  const text = await withIoTimeout(io.readText(), timeoutMs, "read");
  const config = parseConfigText(text);
  afterLoad?.(config);
  return config;
}

/**
 * 从注入的读写读配置。目录或文件 IPC 超时则整段重读，次数有上限。
 * 超时不当成「文件不存在」，避免把已有配置写成默认样例。
 * 次数用尽抛出 ConfigLoadError，交给现有的空日程错误页。
 */
export async function loadConfigWithIo(
  io: ConfigIo,
  options?: {
    timeoutMs?: number;
    attempts?: number;
    afterLoad?: (config: AppConfig) => void;
  },
): Promise<AppConfig> {
  const timeoutMs = options?.timeoutMs ?? CONFIG_IO_TIMEOUT_MS;
  const attempts = options?.attempts ?? CONFIG_IO_ATTEMPTS;
  let lastTimeout: ConfigIoTimeoutError | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await readConfigOnce(io, timeoutMs, options?.afterLoad);
    } catch (error) {
      if (!(error instanceof ConfigIoTimeoutError)) throw error;
      lastTimeout = error;
    }
  }
  throw new ConfigLoadError("读取配置超时", { cause: lastTimeout ?? undefined });
}

/**
 * 加载配置。文件不存在时写入并返回默认样例；
 * 文件损坏或校验失败时抛出 ConfigLoadError（不静默回退样例）。
 */
export async function loadConfig(): Promise<AppConfig> {
  if (!isTauriRuntime()) {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      const initial = defaultConfig();
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(initial, null, 2));
      return initial;
    }
    return parseConfigText(raw);
  }

  return loadConfigWithIo(
    {
      mkdir: () =>
        mkdir("", { baseDir: BaseDirectory.AppConfig, recursive: true }),
      exists: () =>
        exists(CONFIG_FILE_NAME, { baseDir: BaseDirectory.AppConfig }),
      readText: () =>
        readTextFile(CONFIG_FILE_NAME, { baseDir: BaseDirectory.AppConfig }),
      writeText: (text) =>
        writeTextFile(CONFIG_FILE_NAME, text, {
          baseDir: BaseDirectory.AppConfig,
        }),
    },
    {
      afterLoad: (config) => {
        void persistWidgetSnapshot(config);
      },
    },
  );
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const validated = parseAppConfig(config);
  if (!isTauriRuntime()) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(validated, null, 2));
    return;
  }
  await ensureConfigDir();
  await writeTextFile(CONFIG_FILE_NAME, JSON.stringify(validated, null, 2), {
    baseDir: BaseDirectory.AppConfig,
  });
  await persistWidgetSnapshot(validated);
}

export async function exportConfigToFile(config: AppConfig): Promise<boolean> {
  const validated = parseAppConfig(config);
  const content = JSON.stringify(validated, null, 2);

  if (!isTauriRuntime()) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "desktop-schedule-config.json";
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  const path = await save({
    defaultPath: "desktop-schedule-config.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return false;
  await writeTextFile(path, content);
  return true;
}

export type ImportResult =
  | { ok: true; config: AppConfig }
  | { ok: false; error: string; cancelled?: boolean };

export async function importConfigFromFile(): Promise<ImportResult> {
  if (!isTauriRuntime()) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve({ ok: false, error: "未选择文件", cancelled: true });
          return;
        }
        try {
          const text = await file.text();
          resolve({ ok: true, config: parseConfigText(text) });
        } catch (error) {
          resolve({
            ok: false,
            error:
              error instanceof Error ? error.message : String(error),
          });
        }
      };
      input.oncancel = () => {
        resolve({ ok: false, error: "已取消", cancelled: true });
      };
      input.click();
    });
  }

  const path = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path || Array.isArray(path)) {
    return { ok: false, error: "已取消", cancelled: true };
  }
  try {
    const text = await readTextFile(path);
    return { ok: true, config: parseConfigText(text) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export { emptyConfig };
