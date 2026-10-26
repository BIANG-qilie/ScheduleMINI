import { describe, expect, it } from "vitest";
import capabilities from "../../src-tauri/capabilities/default.json";

/**
 * #26 合入后小窗最小化点击无效：前端会调用 minimize / setSkipTaskbar / isMinimized，
 * 但 capability 里没开对应 ACL，Tauri 2 直接拒掉 invoke，void 掉的 Promise 看起来像没反应。
 */
describe("desktop mini minimize capabilities", () => {
  it("小窗最小化所需的窗口权限都已放开", () => {
    const permissions = capabilities.permissions.filter(
      (entry): entry is string => typeof entry === "string",
    );

    expect(permissions).toEqual(
      expect.arrayContaining([
        "core:window:allow-minimize",
        "core:window:allow-unminimize",
        "core:window:allow-is-minimized",
        "core:window:allow-set-skip-taskbar",
      ]),
    );
    expect(capabilities.windows).toContain("widget");
  });
});
