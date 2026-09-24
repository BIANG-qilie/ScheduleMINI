# ScheduleMINI sync relay

轻量 HTTP 中继：邀请码房间、最多 2 人、存加密日程切片（服务端不读明文）。

## 本地

```bash
npm run sync-relay
# → http://127.0.0.1:8787
```

```bash
VITE_SYNC_RELAY_URL=http://127.0.0.1:8787
```

## Docker（Railway / Fly）

仓库根 `Dockerfile` 仅打包本服务：

```bash
docker build -t schedulemini-sync .
docker run --rm -p 8787:8787 -e PORT=8787 schedulemini-sync
```

Railway：Builder 选 Dockerfile；若容器里 `node: command not found`，说明没用到带 Node 的镜像——改用该 Dockerfile，不要空镜像。

完整步骤见团队文档 `docs/sync-relay-deploy.md`（agent store）或本目录说明。
