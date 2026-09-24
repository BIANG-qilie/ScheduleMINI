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

const LOCAL_STORAGE_KEY = "desktop-schedule-widget:config";

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

function parseConfigText(text: string): AppConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ConfigLoadError(
      `配置不是合法 JSON${error instanceof Error ? `（${error.message}）` : ""}`,
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

  await ensureConfigDir();
  const fileExists = await exists(CONFIG_FILE_NAME, {
    baseDir: BaseDirectory.AppConfig,
  });
  if (!fileExists) {
    const initial = defaultConfig();
    await saveConfig(initial);
    return initial;
  }
  const text = await readTextFile(CONFIG_FILE_NAME, {
    baseDir: BaseDirectory.AppConfig,
  });
  return parseConfigText(text);
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
