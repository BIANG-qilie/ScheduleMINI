# Sealos 对象存储：path-style S3 API。由 release / mirror-probe 工作流 source。
# 调用前要设好 MIRROR_S3_ENDPOINT、MIRROR_S3_BUCKET、AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY。
# 不要在这里打印密钥。

mirror_s3_setup() {
  if [ -z "${MIRROR_S3_ENDPOINT:-}" ] || [ -z "${MIRROR_S3_BUCKET:-}" ]; then
    echo "mirror s3 endpoint or bucket is empty" >&2
    return 1
  fi
  if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
    echo "mirror s3 credentials are empty" >&2
    return 1
  fi
  MIRROR_S3_ENDPOINT="${MIRROR_S3_ENDPOINT%/}"
  export MIRROR_S3_ENDPOINT MIRROR_S3_BUCKET
  export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
  export AWS_REQUEST_CHECKSUM_CALCULATION=WHEN_REQUIRED
  export AWS_RESPONSE_CHECKSUM_VALIDATION=WHEN_REQUIRED
  mkdir -p "${HOME}/.aws"
  cat > "${HOME}/.aws/config" <<EOF
[default]
region = ${AWS_DEFAULT_REGION}
s3 =
    addressing_style = path
EOF
}

# mirror_s3_put <key> <file> <content-type> [cache-control] [content-disposition]
mirror_s3_put() {
  local key="$1" file="$2" content_type="$3" cache_control="${4:-}" disposition="${5:-}"
  local args=(
    s3api put-object
    --endpoint-url "$MIRROR_S3_ENDPOINT"
    --bucket "$MIRROR_S3_BUCKET"
    --key "$key"
    --body "$file"
    --content-type "$content_type"
  )
  if [ -n "$cache_control" ]; then
    args+=(--cache-control "$cache_control")
  fi
  if [ -n "$disposition" ]; then
    args+=(--content-disposition "$disposition")
  fi
  aws "${args[@]}" >/dev/null
}

mirror_s3_delete() {
  aws s3api delete-object \
    --endpoint-url "$MIRROR_S3_ENDPOINT" \
    --bucket "$MIRROR_S3_BUCKET" \
    --key "$1" >/dev/null
}
