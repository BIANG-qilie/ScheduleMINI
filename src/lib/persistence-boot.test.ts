import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyConfig } from "@/lib/config";
import {
  ConfigLoadError,
  ConfigLoadTimeoutError,
  loadConfigWithIo,
  type ConfigIo,
} from "@/lib/persistence";

function hang(): Promise<never> {
  return new Promise(() => {});
}

function io(partial: Partial<ConfigIo> & Pick<ConfigIo, "exists">): ConfigIo {
  return {
    mkdir: async () => undefined,
    readText: async () => JSON.stringify(emptyConfig()),
    writeText: async () => undefined,
    ...partial,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("loadConfigWithIo", () => {
  it("reads again after a dropped exists reply and does not write defaults", async () => {
    vi.useFakeTimers();
    let existsCalls = 0;
    let writes = 0;
    const pending = loadConfigWithIo(
      io({
        exists: () => {
          existsCalls += 1;
          if (existsCalls === 1) return hang();
          return Promise.resolve(true);
        },
        writeText: async () => {
          writes += 1;
        },
      }),
      { timeoutMs: 1_000, attempts: 3 },
    );
    await vi.advanceTimersByTimeAsync(1_000);
    const config = await pending;
    expect(existsCalls).toBe(2);
    expect(writes).toBe(0);
    expect(config.items).toEqual([]);
  });

  it("stops after the bounded retries and rejects instead of hanging", async () => {
    vi.useFakeTimers();
    let mkdirCalls = 0;
    let writes = 0;
    const pending = loadConfigWithIo(
      io({
        mkdir: () => {
          mkdirCalls += 1;
          return hang();
        },
        exists: async () => {
          throw new Error("should not run");
        },
        writeText: async () => {
          writes += 1;
        },
      }),
      { timeoutMs: 1_000, attempts: 3 },
    );
    const settled = pending.then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(3_000);
    const error = await settled;
    expect(error).toBeInstanceOf(ConfigLoadTimeoutError);
    expect(error).toBeInstanceOf(ConfigLoadError);
    expect((error as ConfigLoadError).message).toBe("读取配置超时");
    expect(mkdirCalls).toBe(3);
    expect(writes).toBe(0);
  });

  it("does not retry a corrupt config file", async () => {
    let reads = 0;
    await expect(
      loadConfigWithIo(
        io({
          exists: async () => true,
          readText: async () => {
            reads += 1;
            return "{";
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ConfigLoadError);
    expect(reads).toBe(1);
  });
});
