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

客户端内置默认：

`https://ejdibhezdfvv.sealosgzg.site`

```bash
curl -sS https://ejdibhezdfvv.sealosgzg.site/health
```

## API

- `GET /v1/rooms/:code` → `{ rev, updatedAt, members: [{ memberId/personId, payload, updatedAt, … }] }`
- `GET /v1/rooms/:code/wait?sinceRev=&timeoutMs=` → 代数变了立刻返回 `{ changed: true, rev, members }`；到点没变则 `{ changed: false }`
- `PUT /v1/rooms/:code/members/:personId` → 写入该身份切片。可选 `docRev`（明文指纹）：相同则不改房间、不唤醒。不带 `docRev` 的 0.2.2 客户端仍按原样写入。第 3 个不同 personId 返回 `room_full`
