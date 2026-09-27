/**
 * ScheduleMINI sync relay — free-to-run, no account.
 * Room = map of personId → encrypted slice.
 * Max 2 distinct personIds (couple); same personId may be written by many devices (LWW by updatedAt).
 *
 * Run: node sync-relay/server.mjs
 * Default: http://127.0.0.1:8787
 */
import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const MAX_PERSONS = 2;

/** @type {Map<string, { persons: Map<string, object>, updatedAt: string }>} */
const rooms = new Map();

function json(res, status, body) {
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
  }));
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
    json(res, 200, { ok: true, rooms: rooms.size, maxPersons: MAX_PERSONS });
    return;
  }

  // /v1/rooms/:code and /v1/rooms/:code/members/:personId (memberId = personId)
  const match = url.pathname.match(
    /^\/v1\/rooms\/([^/]+)(?:\/members\/([^/]+))?$/,
  );
  if (!match) {
    json(res, 404, { error: "not_found" });
    return;
  }

  const code = normalizeCode(decodeURIComponent(match[1]));
  const personId = match[2] ? decodeURIComponent(match[2]) : null;
  if (!code || code.length < 4) {
    json(res, 400, { error: "bad_code" });
    return;
  }

  if (req.method === "GET" && !personId) {
    const room = rooms.get(code);
    if (!room) {
      json(res, 200, { code, members: [], updatedAt: null });
      return;
    }
    json(res, 200, {
      code,
      updatedAt: room.updatedAt,
      members: roomMembers(room),
    });
    return;
  }

  if (req.method === "PUT" && personId) {
    try {
      const body = await readBody(req);
      const name = String(body.name || "").trim().slice(0, 32) || "对方";
      const color = String(body.color || "#a21caf").slice(0, 16);
      const payload = String(body.payload || "");
      const updatedAt = String(body.updatedAt || new Date().toISOString());
      if (!payload) {
        json(res, 400, { error: "missing_payload" });
        return;
      }

      let room = rooms.get(code);
      if (!room) {
        room = { persons: new Map(), updatedAt };
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

      // Same personId: keep newer slice (multi-device LWW)
      if (existing && existing.updatedAt > updatedAt) {
        json(res, 200, {
          code,
          updatedAt: room.updatedAt,
          rejected: true,
          members: roomMembers(room),
        });
        return;
      }

      room.persons.set(personId, {
        memberId: personId,
        name,
        color,
        payload,
        updatedAt,
      });
      room.updatedAt = new Date().toISOString();
      json(res, 200, {
        code,
        updatedAt: room.updatedAt,
        members: roomMembers(room),
      });
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
