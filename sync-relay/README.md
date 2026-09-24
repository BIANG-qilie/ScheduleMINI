# ScheduleMINI sync relay

轻量 HTTP 中继：邀请码房间、最多 2 人、存加密后的日程切片（服务端不读明文）。

```bash
node sync-relay/server.mjs
# → http://127.0.0.1:8787
```

应用侧设置：

```bash
VITE_SYNC_RELAY_URL=http://127.0.0.1:8787
```

未设置时，桌面端默认连同地址；跨设备请把本服务部署到任意免费 Node 主机（Fly / Railway），再把 `VITE_SYNC_RELAY_URL` 指过去。
