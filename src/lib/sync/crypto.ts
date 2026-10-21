/** Invite-code key derivation + AES-GCM for couple schedule slices. */

function bytesToBase64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function deriveInviteKey(inviteCode: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(`schedulemini:${inviteCode.trim().toUpperCase()}`),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("schedulemini-couple-v1"),
      iterations: 120_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** 明文文档指纹。密文每次随机，不能用来判断内容有没有变。 */
export async function digestJson(data: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function encryptPayload(
  inviteCode: string,
  data: unknown,
): Promise<string> {
  const key = await deriveInviteKey(inviteCode);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return bytesToBase64(packed);
}

export async function decryptPayload<T>(
  inviteCode: string,
  payload: string,
): Promise<T> {
  const key = await deriveInviteKey(inviteCode);
  const packed = base64ToBytes(payload);
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function normalizeInviteCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** 设备同步码：房间邀请码 + 同一人 personId（memberId） */
const DEVICE_CODE_PREFIX = "D1";

export function encodeDeviceSyncCode(inviteCode: string, personId: string) {
  const room = normalizeInviteCode(inviteCode);
  const id = personId.trim();
  if (!room || !id) throw new Error("无法生成设备同步码");
  return `${DEVICE_CODE_PREFIX}.${room}.${id}`;
}

export function parseDeviceSyncCode(
  raw: string,
): { inviteCode: string; personId: string } | null {
  const s = raw.trim().replace(/\s+/g, "");
  const m = new RegExp(
    `^${DEVICE_CODE_PREFIX}\\.([A-Za-z0-9]{4,16})\\.(.+)$`,
    "i",
  ).exec(s);
  if (!m) return null;
  const inviteCode = normalizeInviteCode(m[1]);
  const personId = m[2].trim();
  if (!inviteCode || inviteCode.length < 4 || personId.length < 8) return null;
  return { inviteCode, personId };
}

export function looksLikeDeviceSyncCode(raw: string) {
  return parseDeviceSyncCode(raw) != null;
}
