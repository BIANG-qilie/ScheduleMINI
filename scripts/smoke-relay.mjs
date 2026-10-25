#!/usr/bin/env node
/**
 * Smoke the built-in relay health endpoint.
 * Usage: node scripts/smoke-relay.mjs [baseUrl]
 */
const base = (process.argv[2] || "https://ejdibhezdfvv.sealosgzg.site").replace(
  /\/$/,
  "",
);

const res = await fetch(`${base}/health`);
if (!res.ok) {
  console.error(`health HTTP ${res.status}`);
  process.exit(1);
}
const body = await res.json();
console.log(JSON.stringify(body));
if (!body?.ok) {
  console.error("health body missing ok:true");
  process.exit(1);
}
