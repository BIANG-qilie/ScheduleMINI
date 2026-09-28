# ScheduleMINI sync relay

轻量 HTTP 中继：邀请码房间、**最多 2 个身份（personId）**、每身份一份加密日程切片。  
同一 personId 可被多台设备写入（按 `updatedAt` LWW）；服务端不读明文。

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

Railway：Builder 选 Dockerfile；部署后客户端默认已指向  
`https://schedulemini-production.up.railway.app`。

**含 `shared-v2` 的 `sync-relay/server.mjs` 更新后必须 Redeploy**，否则双机仍跑旧中继。

```bash
curl -sS https://schedulemini-production.up.railway.app/health
```

## API

- `GET /v1/rooms/:code` → `{ members: [{ memberId/personId, payload, updatedAt, … }] }`
- `PUT /v1/rooms/:code/members/:personId` → 写入/覆盖该身份切片；第 3 个不同 personId 返回 `room_full`
