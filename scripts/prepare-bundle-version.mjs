// Cargo 与 Tauri 只接受三段 semver。产品版本可以是 0.2.0.1：
// 这里给本次构建写一份三段版本，并让 Android versionCode 吃到第四段，
// 这样 0.2.0.1 的安装包可以盖过 0.2.0。package.json 保持产品版本不动。
//
// Windows MSI 要求预发布段只能是数字（且 ≤65535）。像 0.3.0-beta.1
// 会在打包时报错，这里改写成 0.3.0-1 写入 ci-version.json。
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

/** @returns {{ version: string, versionCode?: number } | null} */
function resolveBundle(version) {
  const four = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (four) {
    const [, major, minor, patch, build] = four;
    return {
      version: `${major}.${minor}.${patch}`,
      versionCode:
        Number(major) * 1_000_000 +
        Number(minor) * 1_000 +
        Number(patch) +
        Number(build),
    };
  }

  const pre = /^(\d+)\.(\d+)\.(\d+)-(.+)$/.exec(version);
  if (pre) {
    const [, major, minor, patch, prerelease] = pre;
    const parts = prerelease.split(".");
    if (parts.every((p) => /^\d+$/.test(p) && Number(p) <= 65535)) {
      return null; // already MSI-safe
    }
    const nums = parts.filter((p) => /^\d+$/.test(p));
    const id = nums.length > 0 ? nums[nums.length - 1] : "0";
    if (Number(id) > 65535) {
      throw new Error(
        `prerelease numeric id ${id} exceeds MSI limit 65535 (from ${version})`,
      );
    }
    return { version: `${major}.${minor}.${patch}-${id}` };
  }

  return null;
}

const resolved = resolveBundle(pkg.version);
if (!resolved) {
  writeFileSync(
    "src-tauri/ci-version.json",
    JSON.stringify({ version: pkg.version }, null, 2) + "\n",
  );
  console.log(`bundle version unchanged (${pkg.version})`);
  process.exit(0);
}

const { version: bundleVersion, versionCode } = resolved;

const cargoPath = "src-tauri/Cargo.toml";
const cargo = readFileSync(cargoPath, "utf8").replace(
  /^version = ".*"$/m,
  `version = "${bundleVersion}"`,
);
writeFileSync(cargoPath, cargo);

// Android 的 rust 构建会直接解析 tauri.conf.json，不吃 --config 覆盖。
// 把指向 package.json 的版本改成三段 semver，应用内版本仍来自 package.json。
const confPath = "src-tauri/tauri.conf.json";
const conf = readFileSync(confPath, "utf8").replace(
  /"version": "\.\.\/package\.json"/,
  `"version": "${bundleVersion}"`,
);
writeFileSync(confPath, conf);

const overlay = versionCode
  ? {
      version: bundleVersion,
      bundle: { android: { versionCode } },
    }
  : { version: bundleVersion };
writeFileSync("src-tauri/ci-version.json", JSON.stringify(overlay, null, 2) + "\n");
console.log(
  versionCode
    ? `bundle ${pkg.version} → semver ${bundleVersion}, android versionCode ${versionCode}`
    : `bundle ${pkg.version} → MSI-safe ${bundleVersion}`,
);
