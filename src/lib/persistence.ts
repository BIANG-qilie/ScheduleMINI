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
  parseAppConfig,
  safeParseAppConfig,
} from "@/lib/config";
import { isTauriRuntime } from "@/lib/utils";

const LOCAL_STORAGE_KEY = "desktop-schedule-widget:config";

async function ensureConfigDir() {
  const ok = await exists(".", { baseDir: BaseDirectory.AppConfig });
  if (!ok) {
    await mkdir(".", { baseDir: BaseDirectory.AppConfig, recursive: true });
  }
}

export async function loadConfig(): Promise<AppConfig> {
  if (!isTauriRuntime()) {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return defaultConfig();
      return parseAppConfig(JSON.parse(raw));
    } catch {
      return defaultConfig();
    }
  }

  try {
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
    return parseAppConfig(JSON.parse(text));
  } catch (error) {
    console.error("加载配置失败，使用默认配置", error);
    return defaultConfig();
  }
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

export async function importConfigFromFile(): Promise<AppConfig | null> {
  if (!isTauriRuntime()) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const text = await file.text();
          const parsed = safeParseAppConfig(JSON.parse(text));
          if (!parsed.success) {
            alert(`导入失败：配置格式不正确\n${parsed.error.message}`);
            resolve(null);
            return;
          }
          resolve(parsed.data);
        } catch (error) {
          alert(`导入失败：${error instanceof Error ? error.message : String(error)}`);
          resolve(null);
        }
      };
      input.click();
    });
  }

  const path = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path || Array.isArray(path)) return null;
  try {
    const text = await readTextFile(path);
    const parsed = safeParseAppConfig(JSON.parse(text));
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }
    return parsed.data;
  } catch (error) {
    throw new Error(
      `导入失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
