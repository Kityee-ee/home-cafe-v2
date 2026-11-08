// Guest records live in one Redis hash (Upstash on Vercel).
// Locally, without Redis env vars, they fall back to a JSON file in .data/.
// Keys are prefixed "cafe2:" so this version never reads or writes v1's orders,
// even if both projects end up connected to the same database.
import { promises as fs } from "node:fs";
import path from "node:path";

const HASH = "cafe2:guests";
const ORDER_COUNTER = "cafe2:order-no";

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(...command) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(`Redis error: ${body.error || res.status}`);
  return body.result;
}

const DEV_FILE = path.join(process.cwd(), ".data", "dev-store.json");

async function readDev() {
  try {
    return JSON.parse(await fs.readFile(DEV_FILE, "utf8"));
  } catch {
    return { guests: {}, orderNo: 0 };
  }
}

async function writeDev(data) {
  await fs.mkdir(path.dirname(DEV_FILE), { recursive: true });
  await fs.writeFile(DEV_FILE, JSON.stringify(data, null, 2));
}

export const usingRedis = Boolean(REDIS_URL && REDIS_TOKEN);

export async function getGuest(id) {
  if (usingRedis) {
    const raw = await redis("HGET", HASH, id);
    return raw ? JSON.parse(raw) : null;
  }
  return (await readDev()).guests[id] || null;
}

export async function saveGuest(guest) {
  if (usingRedis) {
    await redis("HSET", HASH, guest.id, JSON.stringify(guest));
    return;
  }
  const data = await readDev();
  data.guests[guest.id] = guest;
  await writeDev(data);
}

export async function deleteGuest(id) {
  if (usingRedis) {
    await redis("HDEL", HASH, id);
    return;
  }
  const data = await readDev();
  delete data.guests[id];
  await writeDev(data);
}

export async function allGuests() {
  if (usingRedis) {
    const flat = (await redis("HGETALL", HASH)) || [];
    const guests = [];
    for (let i = 1; i < flat.length; i += 2) guests.push(JSON.parse(flat[i]));
    return guests;
  }
  return Object.values((await readDev()).guests);
}

export async function countGuests() {
  if (usingRedis) return redis("HLEN", HASH);
  return Object.keys((await readDev()).guests).length;
}

// Atomic in Redis, so two guests checking out at once never share an order number.
export async function nextOrderNo() {
  if (usingRedis) return redis("INCR", ORDER_COUNTER);
  const data = await readDev();
  data.orderNo = (data.orderNo || 0) + 1;
  await writeDev(data);
  return data.orderNo;
}
