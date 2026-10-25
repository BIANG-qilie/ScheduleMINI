#!/usr/bin/env node
/**
 * 把 GitHub Release 的 latest.json 改成镜像地址，并生成 android-latest.json。
 * signature 原样保留：minisign 签的是安装包字节，与 URL 无关。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MIRROR_OBJECT_PREFIX = "schedulemini";

function versionPath(version) {
  const ver = String(version).trim().replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?$/.test(ver)) {
    throw new Error(`无效版本号：${version}`);
  }
  return ver;
}

function publicPrefix(publicBase, version) {
  const base = String(publicBase).trim().replace(/\/+$/, "");
  if (!base.startsWith("https://")) throw new Error("镜像根地址必须是 https");
  return `${base}/${MIRROR_OBJECT_PREFIX}/v${versionPath(version)}`;
}

function fileNameFromUrl(url) {
  const path = String(url).split("?")[0].split("#")[0];
  return path.split("/").filter(Boolean).pop() ?? "";
}

/** 只改 platforms.*.url，其它字段（含 signature）不动。 */
export function rewriteLatestUrls(latest, publicBase, version) {
  if (!latest || typeof latest !== "object" || Array.isArray(latest)) {
    throw new Error("latest.json 不是对象");
  }
  if (!latest.platforms || typeof latest.platforms !== "object" || Array.isArray(latest.platforms)) {
    throw new Error("latest.json 缺少 platforms");
  }
  const prefix = publicPrefix(publicBase, version);
  const clone = structuredClone(latest);
  const names = Object.keys(clone.platforms);
  if (names.length === 0) throw new Error("latest.json 没有任何平台");
  for (const name of names) {
    const platform = clone.platforms[name];
    const original = latest.platforms[name];
    if (!platform || typeof platform !== "object" || typeof platform.url !== "string") {
      throw new Error(`平台 ${name} 缺少 url`);
    }
    const filename = fileNameFromUrl(platform.url);
    if (!filename || filename === "." || filename === "..") {
      throw new Error(`平台 ${name} 的 url 没有文件名`);
    }
    platform.url = `${prefix}/${filename}`;
    if (platform.signature !== original.signature) {
      throw new Error(`平台 ${name} 的 signature 被改动`);
    }
  }
  return clone;
}

export function buildAndroidManifest({ publicBase, version, apkName, sha256, notes }) {
  const name = String(apkName);
  if (!/^[A-Za-z0-9._+-]+\.apk$/.test(name)) throw new Error(`非法 APK 文件名：${name}`);
  const sha = String(sha256).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error("sha256 必须是 64 位十六进制");
  return {
    version: versionPath(version),
    apkUrl: `${publicPrefix(publicBase, version)}/${name}`,
    sha256: sha,
    notes: notes ?? "",
  };
}

export function contentTypeFor(filename) {
  const name = String(filename).toLowerCase();
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".apk")) return "application/vnd.android.package-archive";
  return "application/octet-stream";
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  console.error(
    "usage: rewrite-latest <in.json> <publicBase> <version> <out.json> | android-manifest <publicBase> <version> <apkName> <sha256> <notes.txt> <out.json> | content-type <filename>",
  );
  process.exit(2);
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

const args = process.argv.slice(3);

if (!invokedDirectly) {
  // 被测试 import 时不跑命令行
} else if (process.argv[2] === "rewrite-latest") {
  const [input, publicBase, version, output] = args;
  if (!input || !publicBase || !version || !output) usage();
  writeJson(output, rewriteLatestUrls(readJson(input), publicBase, version));
} else if (process.argv[2] === "android-manifest") {
  const [publicBase, version, apkName, sha256, notesFile, output] = args;
  if (!publicBase || !version || !apkName || !sha256 || !notesFile || !output) usage();
  const notes = readFileSync(notesFile, "utf8");
  writeJson(output, buildAndroidManifest({ publicBase, version, apkName, sha256, notes }));
} else if (process.argv[2] === "content-type") {
  const [filename] = args;
  if (!filename) usage();
  process.stdout.write(contentTypeFor(filename));
} else {
  usage();
}
