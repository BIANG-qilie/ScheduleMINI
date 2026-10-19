// package.json 是唯一版本源：tauri.conf.json 通过 "../package.json" 引用，Cargo.toml 由本脚本同步。
// 用法：npm version 0.3.0 --no-git-tag-version && npm run version:sync
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const cargoPath = "src-tauri/Cargo.toml";
const cargo = readFileSync(cargoPath, "utf8");
const next = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
writeFileSync(cargoPath, next);
console.log(`Cargo.toml → ${version}`);
