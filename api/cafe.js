import { randomBytes } from "node:crypto";
import { EVENT } from "../lib/event.js";
import { allGuests, countGuests, deleteGuest, getGuest, nextOrderNo, saveGuest } from "../lib/store.js";
import { DRINKS, MAX_PER_DRINK, drinkLabel } from "../public/menu.js";

// A ceiling on new guests, so a leaked link can't fill the database.
const MAX_GUESTS = Number(process.env.MAX_GUESTS || 80);
const MAX_LINES = 30;

const HOST_KEY = process.env.HOST_KEY || (process.env.VERCEL ? "" : "devhost");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const newId = (bytes) => randomBytes(bytes).toString("base64url");

// What a guest may see about themselves: everything except their edit token.
function publicSelf({ token, ...rest }) {
  return rest;
}

// Turns whatever the browser sent into a clean list of real drinks, merging repeats.
function parseItems(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_LINES) throw new HttpError(400, "That order doesn't look right. Try again.");
  const merged = new Map();
  for (const line of raw) {
    const id = String(line?.id ?? "");
    const drink = Object.hasOwn(DRINKS, id) ? DRINKS[id] : null;
    if (!drink) throw new HttpError(400, "One of those drinks isn't on the menu any more. Remove it and try again.");
    const temp = drink.temps.includes(line.temp) ? line.temp : drink.temps[0];
    const qty = Math.floor(Number(line.qty));
    if (!(qty >= 1)) continue;
    const key = `${id}:${temp}`;
    merged.set(key, { id, temp, qty: Math.min(MAX_PER_DRINK, (merged.get(key)?.qty || 0) + qty) });
  }
  const items = [...merged.values()];
  if (!items.length) throw new HttpError(400, "Add a drink first.");
  return items;
}

async function authGuest(body) {
  const guest = body.id ? await getGuest(String(body.id)) : null;
  if (!guest || guest.token !== body.token) throw new HttpError(401, "We couldn't find your order. Place a new one from the menu.");
  return guest;
}

async function board(guests) {
  return (guests || (await allGuests()))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((g) => ({ name: g.name, drinks: g.items.map((i) => (i.qty > 1 ? `${drinkLabel(i)} ×${i.qty}` : drinkLabel(i))) }));
}

const actions = {
  async board() {
    return { event: EVENT, guests: await board() };
  },

  async me(body) {
    return { me: publicSelf(await authGuest(body)) };
  },

  // Places a new order, or replaces the guest's existing one. The name doubles as the RSVP.
  async checkout(body) {
    const name = clean(body.name, 40);
    if (!name) throw new HttpError(400, "Add your name so Kit knows whose drinks are whose.");
    const items = parseItems(body.items);

    const found = body.id ? await getGuest(String(body.id)) : null;
    const guest = found && found.token === body.token ? found : null;
    const isNew = !guest;
    if (isNew && (await countGuests()) >= MAX_GUESTS) {
      throw new HttpError(429, "The cafe is full up. Message Kit to squeeze in.");
    }

    const now = Date.now();
    const saved = guest
      ? { ...guest, name, items, updatedAt: now }
      : {
          id: newId(9),
          token: newId(18),
          name,
          items,
          orderNo: String(await nextOrderNo()).padStart(3, "0"),
          createdAt: now,
          updatedAt: now,
        };
    await saveGuest(saved);

    const result = { me: publicSelf(saved), guests: await board() };
    return isNew ? { ...result, token: saved.token } : result;
  },

  // The guest can't make it: drops their order and their spot on the guest list.
  async cancel(body) {
    const guest = await authGuest(body);
    await deleteGuest(guest.id);
    return { guests: await board() };
  },

  async host(body) {
    if (!HOST_KEY || body.key !== HOST_KEY) throw new HttpError(401, "That host link isn't right. Check the key at the end of it.");
    const guests = (await allGuests()).sort((a, b) => a.createdAt - b.createdAt).map(publicSelf);
    return { event: EVENT, guests };
  },

  async remove(body) {
    if (!HOST_KEY || body.key !== HOST_KEY) throw new HttpError(401, "That host link isn't right.");
    await deleteGuest(String(body.id));
    return actions.host(body);
  },
};

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  try {
    const body = req.method === "POST" ? req.body || {} : Object.fromEntries(new URL(req.url, "http://x").searchParams);
    // Reading the board is the only thing a plain GET may do; everything else changes or reveals data.
    if (req.method !== "POST" && body.action !== "board") throw new HttpError(405, "Use POST for that.");
    const action = Object.hasOwn(actions, body.action) ? actions[body.action] : null;
    if (!action) throw new HttpError(404, "Unknown action.");
    res.statusCode = 200;
    res.end(JSON.stringify(await action(body)));
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    res.statusCode = err.status || 500;
    res.end(JSON.stringify({ error: err.status ? err.message : "The coffee machine hiccuped. Try again in a moment." }));
  }
}
