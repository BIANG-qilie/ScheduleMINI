// Cargo 与 Tauri 只接受三段 semver。产品版本可以是 0.2.0.1：
// 这里给本次构建写一份三段版本，并让 Android versionCode 吃到第四段，
// 这样 0.2.0.1 的安装包可以盖过 0.2.0。package.json 保持产品版本不动。
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!match) {
  console.log(`bundle version unchanged (${pkg.version})`);
  process.exit(0);
}

const [, major, minor, patch, build] = match;
const bundleVersion = `${major}.${minor}.${patch}`;
const versionCode =
  Number(major) * 1_000_000 +
  Number(minor) * 1_000 +
  Number(patch) +
  Number(build);

const cargoPath = "src-tauri/Cargo.toml";
const cargo = readFileSync(cargoPath, "utf8").replace(
  /^version = ".*"$/m,
  `version = "${bundleVersion}"`,
);
writeFileSync(cargoPath, cargo);

const overlay = {
  version: bundleVersion,
  bundle: { android: { versionCode } },
};
writeFileSync("src-tauri/ci-version.json", JSON.stringify(overlay, null, 2) + "\n");
console.log(
  `bundle ${pkg.version} → semver ${bundleVersion}, android versionCode ${versionCode}`,
);
