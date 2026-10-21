/**
 * ScheduleMINI sync relay — free-to-run, no account.
 * Room = map of personId → encrypted slice.
 * Max 2 distinct personIds (couple); same personId may be written by many devices (LWW by updatedAt).
 *
 * GET /v1/rooms/:code/wait?sinceRev=&timeoutMs=  hangs until rev changes.
 * Clients on 0.2.2 keep using GET + PUT; payload ciphertext is unchanged.
 *
 * Run: node sync-relay/server.mjs
 * Default: http://127.0.0.1:8787
 */
import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const MAX_PERSONS = 2;
const DEFAULT_WAIT_MS = 25_000;
const MAX_WAIT_MS = 30_000;

/** @type {Map<string, { persons: Map<string, object>, updatedAt: string | null, rev: number }>} */
const rooms = new Map();

/** @type {Map<string, Set<{ res: import("node:http").ServerResponse, timer: NodeJS.Timeout }>>} */
const waiters = new Map();

function json(res, status, body) {
  if (res.writableEnded) return;
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function roomMembers(room) {
  return [...room.persons.values()].map((m) => ({
    memberId: m.memberId,
    personId: m.memberId,
    name: m.name,
    color: m.color,
    updatedAt: m.updatedAt,
    payload: m.payload,
    ...(m.redirect ? { redirect: m.redirect } : {}),
  }));
}

function roomBody(code, room, extra = {}) {
  if (!room) {
    return { code, updatedAt: null, rev: 0, members: [], ...extra };
  }
  return {
    code,
    updatedAt: room.updatedAt,
    rev: room.rev,
    members: roomMembers(room),
    ...extra,
  };
}

function clampWait(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_WAIT_MS;
  return Math.min(MAX_WAIT_MS, Math.max(0, Math.floor(n)));
}

function removeWaiter(code, waiter) {
  const set = waiters.get(code);
  if (!set) return;
  set.delete(waiter);
  if (set.size === 0) waiters.delete(code);
}

function notify(code) {
  const set = waiters.get(code);
  if (!set || set.size === 0) return;
  const room = rooms.get(code) ?? null;
  for (const waiter of [...set]) {
    clearTimeout(waiter.timer);
    removeWaiter(code, waiter);
    json(waiter.res, 200, roomBody(code, room, { changed: true }));
  }
}

function holdWait(req, res, code, timeoutMs) {
  const waiter = { res, timer: /** @type {NodeJS.Timeout} */ (null) };
  waiter.timer = setTimeout(() => {
    removeWaiter(code, waiter);
    json(res, 200, roomBody(code, rooms.get(code) ?? null, { changed: false }));
  }, timeoutMs);
  let set = waiters.get(code);
  if (!set) {
    set = new Set();
    waiters.set(code, set);
  }
  set.add(waiter);
  req.on("close", () => {
    if (res.writableEnded) return;
    clearTimeout(waiter.timer);
    removeWaiter(code, waiter);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      ok: true,
      rooms: rooms.size,
      maxPersons: MAX_PERSONS,
      wait: true,
    });
    return;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  // /v1/rooms/:code
  // /v1/rooms/:code/wait
  // /v1/rooms/:code/members/:personId
  if (parts[0] !== "v1" || parts[1] !== "rooms" || !parts[2]) {
    json(res, 404, { error: "not_found" });
    return;
  }

  const code = normalizeCode(decodeURIComponent(parts[2]));
  if (!code || code.length < 4) {
    json(res, 400, { error: "bad_code" });
    return;
  }

  const isWait = parts[3] === "wait" && !parts[4];
  const personId =
    parts[3] === "members" && parts[4] ? decodeURIComponent(parts[4]) : null;
  if (parts[3] && !isWait && !personId) {
    json(res, 404, { error: "not_found" });
    return;
  }

  if (req.method === "GET" && isWait) {
    const room = rooms.get(code) ?? null;
    const current = room?.rev ?? 0;
    const rawSince = url.searchParams.get("sinceRev");
    const sinceRev =
      rawSince === null || rawSince === "" ? current : Number(rawSince);
    if (!Number.isInteger(sinceRev) || sinceRev < 0) {
      json(res, 400, { error: "bad_since" });
      return;
    }
    const timeoutMs = clampWait(url.searchParams.get("timeoutMs"));
    if (current !== sinceRev) {
      json(res, 200, roomBody(code, room, { changed: true }));
      return;
    }
    if (timeoutMs === 0) {
      json(res, 200, roomBody(code, room, { changed: false }));
      return;
    }
    holdWait(req, res, code, timeoutMs);
    return;
  }

  if (req.method === "GET" && !personId) {
    json(res, 200, roomBody(code, rooms.get(code) ?? null));
    return;
  }

  if (req.method === "PUT" && personId) {
    try {
      const body = await readBody(req);
      const name = String(body.name || "").trim().slice(0, 32) || "对方";
      const color = String(body.color || "#a21caf").slice(0, 16);
      const payload = String(body.payload || "");
      const updatedAt = String(body.updatedAt || new Date().toISOString());
      const docRev = String(body.docRev || "").slice(0, 64);
      if (!payload) {
        json(res, 400, { error: "missing_payload" });
        return;
      }

      let room = rooms.get(code);
      if (!room) {
        room = { persons: new Map(), updatedAt: null, rev: 0 };
        rooms.set(code, room);
      }

      const existing = room.persons.get(personId);
      if (!existing && room.persons.size >= MAX_PERSONS) {
        json(res, 403, {
          error: "room_full",
          message: "配对空间最多两个身份",
        });
        return;
      }

      // redirect 指向该身份的新房间。请求没带这个字段时保留原值，
      // 否则同一身份另一台设备随后推的日程会把「跟过去」擦掉。
      const hasRedirect = Object.prototype.hasOwnProperty.call(body, "redirect");
      const prevRedirect = existing?.redirect || "";
      const redirect = hasRedirect
        ? body.redirect
          ? normalizeCode(String(body.redirect))
          : ""
        : prevRedirect;
      const redirectChanged = redirect !== prevRedirect;

      // Same personId: keep newer slice (multi-device LWW)
      if (existing && existing.updatedAt > updatedAt) {
        json(res, 200, roomBody(code, room, { rejected: true }));
        return;
      }

      // Same plaintext: do not move the slot clock or wake waiters.
      if (existing && docRev && existing.docRev === docRev && !redirectChanged) {
        json(res, 200, roomBody(code, room, { unchanged: true }));
        return;
      }

      room.persons.set(personId, {
        memberId: personId,
        name,
        color,
        payload,
        updatedAt,
        ...(docRev ? { docRev } : {}),
        ...(redirect ? { redirect } : {}),
      });
      room.rev += 1;
      room.updatedAt = new Date().toISOString();
      notify(code);
      json(res, 200, roomBody(code, room));
      return;
    } catch {
      json(res, 400, { error: "bad_json" });
      return;
    }
  }

  json(res, 405, { error: "method_not_allowed" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ScheduleMINI sync relay on http://127.0.0.1:${PORT}`);
});
