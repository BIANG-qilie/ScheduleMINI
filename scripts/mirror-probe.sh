#!/usr/bin/env bash
# 上传一个小文本，确认公共 URL 是 200，然后从桶里删掉。
# 需要 MIRROR_S3_* 与 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY。不打印密钥。
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source scripts/mirror-s3.sh
mirror_s3_setup

app_base=$(node -e "
  const fs = require('fs');
  const s = fs.readFileSync('src/lib/update/mirror-endpoints.ts','utf8');
  const m = s.match(/MIRROR_PUBLIC_BASE\s*=\s*\"([^\"]+)\"/);
  if (!m) process.exit(1);
  process.stdout.write(m[1]);
")
if [ "${MIRROR_PUBLIC_BASE%/}" != "$app_base" ]; then
  echo "MIRROR_PUBLIC_BASE does not match the in-app mirror host"
  exit 1
fi

key="schedulemini/probe-${GITHUB_RUN_ID:-local}.txt"
printf 'schedulemini-mirror-probe %s\n' "${GITHUB_RUN_ID:-local}" > probe.txt
mirror_s3_put "$key" probe.txt "text/plain" "no-cache"
rm -f probe.txt
public_url="${MIRROR_PUBLIC_BASE%/}/${key}"
echo "probe_public_url=${public_url}"

root_code=$(curl -sS --max-time 30 -o /tmp/mirror-root.txt -w "%{http_code}" "${MIRROR_PUBLIC_BASE%/}/" || true)
echo "root_http_status=${root_code}"
code=$(curl -sS --max-time 30 -L -o /tmp/mirror-probe.txt -w "%{http_code}" "$public_url")
echo "probe_http_status=${code}"
cat /tmp/mirror-probe.txt
test "$code" = "200"
grep -q "schedulemini-mirror-probe ${GITHUB_RUN_ID:-local}" /tmp/mirror-probe.txt

mirror_s3_delete "$key"
set +e
aws s3api head-object \
  --endpoint-url "${MIRROR_S3_ENDPOINT%/}" \
  --bucket "$MIRROR_S3_BUCKET" \
  --key "$key" >/tmp/mirror-head.txt 2>&1
head_status=$?
set -e
if [ "$head_status" -eq 0 ]; then
  echo "probe object still exists after delete"
  exit 1
fi
if ! grep -Eq '404|Not Found|NoSuchKey' /tmp/mirror-head.txt; then
  echo "could not confirm probe object was deleted"
  exit 1
fi
echo "probe object deleted"
after=$(curl -sS --max-time 30 -o /dev/null -w "%{http_code}" "$public_url" || true)
echo "probe_http_status_after_delete=${after}"
