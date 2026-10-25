import { describe, expect, it } from "vitest";
import { parseApkEvent } from "@/lib/update/install";

describe("parseApkEvent", () => {
  it("把原生下载进度转成 0–100 的百分比", () => {
    expect(parseApkEvent({ kind: "progress", percent: 42 })).toEqual({
      kind: "progress",
      percent: 42,
    });
    expect(parseApkEvent({ kind: "progress", percent: 0 })).toEqual({
      kind: "progress",
      percent: 0,
    });
  });

  it("总大小未知时保持不确定进度，不编造百分比", () => {
    expect(parseApkEvent({ kind: "progress", percent: null })).toEqual({
      kind: "progress",
      percent: null,
    });
  });

  it("完成和失败仍然是终态", () => {
    expect(parseApkEvent({ kind: "installer" })).toEqual({
      kind: "handed-off",
      target: "installer",
    });
    expect(parseApkEvent("installer")).toEqual({
      kind: "handed-off",
      target: "installer",
    });
    expect(parseApkEvent({ kind: "failed" })).toEqual({ kind: "failed", reason: "download" });
    expect(parseApkEvent("failed")).toEqual({ kind: "failed", reason: "download" });
    expect(parseApkEvent({ kind: "hash-mismatch" })).toEqual({ kind: "hash-mismatch" });
    expect(parseApkEvent("hash-mismatch")).toEqual({ kind: "hash-mismatch" });
  });
});
