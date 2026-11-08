import { BASICS, DRINKS, MAX_PER_DRINK, POPULAR, countDrinks, drinkLabel } from "/menu.js";

const $ = (id) => document.getElementById(id);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Keys are prefixed so v1 and v2 never share browser storage on the same origin (e.g. localhost).
const store = {
  get(key) { try { return localStorage.getItem(`cafe2.${key}`); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(`cafe2.${key}`, value); } catch {} },
  drop(key) { try { localStorage.removeItem(`cafe2.${key}`); } catch {} },
};

const state = {
  // The guest's placed order as the server has it, or null before they check out.
  me: null,
  // What's in the bag right now: "id:temp" -> quantity, in the order drinks were added.
  cart: new Map(),
  busy: false,
};

// ---------- cart ----------

const keyOf = (id, temp) => `${id}:${temp}`;
function fromKey(key) {
  const i = key.lastIndexOf(":");
  return { id: key.slice(0, i), temp: key.slice(i + 1) };
}

function toCart(items) {
  const cart = new Map();
  for (const item of items || []) {
    const drink = Object.hasOwn(DRINKS, item.id) ? DRINKS[item.id] : null;
    const qty = Math.floor(Number(item.qty));
    if (drink && drink.temps.includes(item.temp) && qty > 0) cart.set(keyOf(item.id, item.temp), Math.min(MAX_PER_DRINK, qty));
  }
  return cart;
}

const cartItems = () => [...state.cart].map(([key, qty]) => ({ ...fromKey(key), qty }));
const cartCount = () => countDrinks(cartItems());
const saveCart = () => store.set("cart", JSON.stringify(cartItems()));

function sameCart(a, b) {
  if (a.size !== b.size) return false;
  for (const [key, qty] of a) if (b.get(key) !== qty) return false;
  return true;
}

// True when the bag holds something the barista hasn't been sent yet.
function isDirty() {
  return state.me ? !sameCart(state.cart, toCart(state.me.items)) : state.cart.size > 0;
}

function describe(id, temp) {
  const pick = POPULAR.find((p) => p.id === id && p.temp === temp);
  return pick?.desc ?? BASICS.find((b) => b.id === id)?.desc ?? "";
}

function setQty(key, qty) {
  const next = Math.max(0, Math.min(MAX_PER_DRINK, qty));
  if (next) state.cart.set(key, next);
  else state.cart.delete(key);
  saveCart();
  render();
}

function addDrink(id, temp, bumpEl) {
  const key = keyOf(id, temp);
  const label = drinkLabel({ id, temp });
  const now = state.cart.get(key) || 0;
  if (now >= MAX_PER_DRINK) {
    announce(`That's ${MAX_PER_DRINK} ${label}s already. Message Kit if you need more.`);
    return;
  }
  setQty(key, now + 1);
  bump($("bag-count"));
  if (bumpEl) bump(bumpEl);
  announce(`Added ${label}. ${plural(cartCount(), "drink")} in your order.`);
}

// ---------- small helpers ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(id) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
}

function bump(node) {
  if (!node || node.hidden) return;
  node.classList.remove("bump");
  void node.offsetWidth;
  node.classList.add("bump");
  node.addEventListener("animationend", () => node.classList.remove("bump"), { once: true });
}

// Screen readers hear what a tap did; clearing first lets the same message repeat.
function announce(text) {
  const live = $("announce");
  live.textContent = "";
  requestAnimationFrame(() => { live.textContent = text; });
}

function setStatus(node, text, isError = false) {
  node.textContent = text;
  node.classList.toggle("error", isError);
}

async function api(action, body = {}) {
  const payload = { action, id: store.get("id"), token: store.get("token"), ...body };
  let res;
  try {
    res = action === "board"
      ? await fetch("/api/cafe?action=board")
      : await fetch("/api/cafe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch {
    throw new Error("Couldn't reach the cafe. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({ error: "Couldn't reach the cafe. Check your connection and try again." }));
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status });
  return data;
}

// ---------- menu ----------

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Each card's video pours its drink when the card is mostly on screen, then rests on the
// finished glass. The still on top is that same last frame, so the menu always shows the drink.
const watcher = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const video = entry.target.querySelector("video");
    if (entry.intersectionRatio >= 0.6) playPour(video);
    else if (!video.paused) video.pause();
  }
}, { threshold: [0, 0.6] });

function playPour(video) {
  if (reduceMotion.matches) return;
  if (video.ended) video.currentTime = 0;
  // Low Power Mode and data-saver can refuse autoplay; the still simply stays up.
  video.play().catch(() => {});
}

reduceMotion.addEventListener("change", () => {
  if (!reduceMotion.matches) return;
  for (const video of document.querySelectorAll(".pick video")) {
    video.pause();
    video.parentElement.classList.remove("playing");
  }
});

function buildPicks() {
  for (const pick of POPULAR) {
    const { id, temp, desc, media } = pick;
    const li = el("li", "pick");
    li.dataset.key = keyOf(id, temp);

    const card = el("article", "pick-card");
    const frame = el("div", "pick-media");
    const video = el("video");
    Object.assign(video, { muted: true, playsInline: true, preload: "none", src: `/media/${media}.mp4` });
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("aria-hidden", "true");
    video.disablePictureInPicture = true;
    video.addEventListener("playing", () => frame.classList.add("playing"));

    const still = el("img");
    Object.assign(still, { src: `/media/${media}.jpg`, alt: "", width: 720, height: 1280, decoding: "async" });
    if (pick !== POPULAR[0]) still.loading = "lazy";

    const qty = el("span", "pick-qty");
    qty.hidden = true;
    const add = el("button", "pick-add");
    add.type = "button";
    add.append(icon("i-plus"));
    add.addEventListener("click", () => addDrink(id, temp, qty));

    frame.append(video, still, qty, add);
    const text = el("div", "pick-text");
    text.append(el("h3", "", DRINKS[id].name), el("p", "", desc));
    card.append(frame, text);
    li.append(card);
    $("picks").append(li);
    watcher.observe(li);
  }
}

function buildBasics() {
  for (const { id, desc } of BASICS) {
    const li = el("li");
    const text = el("div", "line-text");
    text.append(el("span", "line-name", DRINKS[id].name), el("span", "line-desc", desc));
    const temps = el("div", "temps");
    for (const temp of ["hot", "iced"].filter((t) => DRINKS[id].temps.includes(t))) {
      const b = el("button", "temp-add");
      b.type = "button";
      b.dataset.key = keyOf(id, temp);
      b.addEventListener("click", () => addDrink(id, temp, b));
      temps.append(b);
    }
    li.append(text, temps);
    $("basics").append(li);
  }
}

// ---------- rendering ----------

function renderCounts() {
  const n = cartCount();
  const badge = $("bag-count");
  badge.hidden = n === 0;
  badge.textContent = String(n);
  $("bag-btn").setAttribute("aria-label", n ? `Your order, ${plural(n, "drink")}` : "Your order");

  for (const li of $("picks").children) {
    const { id, temp } = fromKey(li.dataset.key);
    const qty = state.cart.get(li.dataset.key) || 0;
    const chip = li.querySelector(".pick-qty");
    chip.hidden = qty === 0;
    chip.textContent = `×${qty}`;
    const label = drinkLabel({ id, temp });
    li.querySelector(".pick-add").setAttribute("aria-label", qty ? `Add another ${label}, ${qty} in your order` : `Add ${label}`);
  }

  for (const b of $("basics").querySelectorAll(".temp-add")) {
    const { id, temp } = fromKey(b.dataset.key);
    const qty = state.cart.get(b.dataset.key) || 0;
    b.classList.toggle("in", qty > 0);
    b.replaceChildren(...(qty ? [`${cap(temp)} ×${qty}`] : [icon("i-plus"), cap(temp)]));
    const label = drinkLabel({ id, temp });
    b.setAttribute("aria-label", qty ? `Add another ${label}, ${qty} in your order` : `Add ${label}`);
  }
  $("basics-review").textContent = n ? `Review order · ${plural(n, "drink")}` : "Done";
}

function renderCta() {
  const n = cartCount();
  const me = state.me;
  let title = "Order ahead";
  let sub = n ? `${plural(n, "drink")} · Review and place` : "Tap + on a drink to start";
  if (me && isDirty()) {
    title = "Update your order";
    sub = n ? `${plural(n, "drink")} · Changes not sent yet` : "Your order is empty";
  } else if (me) {
    title = `Order #${me.orderNo}`;
    sub = `${plural(n, "drink")} · See you there`;
  }
  $("cta-title").textContent = title;
  $("cta-sub").textContent = sub;
  $("order-cta").classList.toggle("floating", n > 0 || Boolean(me));
}

// Fills a receipt from the order as the server saved it (not the bag, which may hold unsent changes).
function renderReceipt(host, me) {
  if (!host.firstElementChild) host.append($("receipt-tpl").content.cloneNode(true));
  const field = (name) => host.querySelector(`[data-r="${name}"]`);
  field("no").textContent = me.orderNo;
  field("name").textContent = me.name;
  const updated = me.updatedAt > me.createdAt;
  field("time-label").textContent = updated ? "Updated" : "Placed";
  field("time").textContent = new Date(me.updatedAt).toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
  field("items").replaceChildren(...me.items.map((item) => {
    const li = el("li");
    li.append(el("span", "r-qty", String(item.qty)), el("span", "r-name", drinkLabel(item)));
    return li;
  }));
  field("count").textContent = String(countDrinks(me.items));
  field("when").textContent = $("when").textContent;
}

function renderPlaced() {
  const me = state.me;
  $("placed").hidden = !me;
  if (!me) return;
  renderReceipt($("p-receipt"), me);
  $("p-note").hidden = !isDirty();
}

// Lines are kept and updated in place, so a stepper button keeps focus between taps.
function renderLines() {
  const list = $("order-lines");
  const rows = new Map([...list.children].map((li) => [li.dataset.key, li]));
  for (const [key, li] of rows) if (!state.cart.has(key)) li.remove();

  for (const [key, qty] of state.cart) {
    let li = rows.get(key);
    const { id, temp } = fromKey(key);
    const label = drinkLabel({ id, temp });
    if (!li) {
      li = el("li");
      li.dataset.key = key;
      const text = el("div", "line-text");
      text.append(el("span", "line-name", label), el("span", "line-desc", describe(id, temp)));
      const stepper = el("div", "stepper");
      const less = el("button", "step");
      less.type = "button";
      less.dataset.step = "-1";
      less.append(icon("i-minus"));
      const out = el("output");
      const more = el("button", "step");
      more.type = "button";
      more.dataset.step = "1";
      more.append(icon("i-plus"));
      stepper.append(less, out, more);
      li.append(text, stepper);
    }
    list.append(li);
    li.querySelector("output").textContent = String(qty);
    const [less, , more] = li.querySelector(".stepper").children;
    less.setAttribute("aria-label", qty === 1 ? `Remove ${label}` : `One less ${label}, ${qty} now`);
    more.setAttribute("aria-label", `One more ${label}, ${qty} now`);
    more.disabled = qty >= MAX_PER_DRINK;
  }
}

function renderOrderSheet() {
  const n = cartCount();
  const me = state.me;
  renderLines();

  const empty = $("order-empty");
  empty.hidden = n > 0;
  empty.textContent = me ? "Your order is empty. Add a drink from the menu, or cancel your order below." : "Nothing here yet. Tap + on a drink.";

  const name = $("name").value.trim();
  const nameChanged = me && name && name !== me.name;
  const place = $("place-btn");
  if (!me) place.textContent = n ? `Place order · ${plural(n, "drink")}` : "Place order";
  else if (isDirty() || nameChanged) place.textContent = "Update order";
  else place.textContent = "No changes to send";
  place.disabled = state.busy || n === 0 || Boolean(me && !isDirty() && !nameChanged);

  $("cancel-btn").hidden = !me;
}

function renderBoard(guests) {
  const list = $("board-list");
  list.replaceChildren();
  $("guest-count").textContent = guests.length ? String(guests.length) : "";
  if (!guests.length) {
    list.append(el("li", "muted", "No one yet. You could be first."));
    return;
  }
  for (const g of guests) {
    const li = el("li");
    li.append(el("span", "who", g.name), el("span", "what", g.drinks.join(" · ")));
    list.append(li);
  }
}

function renderEvent(event) {
  if (!event) return;
  $("when").textContent = `${event.date} · ${event.time}`;
  $("where").textContent = event.address;
  // Google's universal Maps link: opens the app on a phone if installed, the website otherwise.
  $("map-link").href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`;
}

function render() {
  renderCounts();
  renderCta();
  renderPlaced();
  if ($("order-sheet").open) renderOrderSheet();
}

// ---------- sheets ----------

function openSheet(sheet) {
  if (!sheet.open) sheet.showModal();
}

// close() drops the sheet out of the top layer at once, so it slides away first.
async function closeSheet(sheet) {
  if (!sheet.open || sheet.classList.contains("closing")) return;
  sheet.classList.add("closing");
  await Promise.allSettled(sheet.getAnimations({ subtree: true }).map((a) => a.finished));
  sheet.classList.remove("closing");
  sheet.close();
}

for (const sheet of document.querySelectorAll(".sheet")) {
  sheet.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return closeSheet(sheet);
    // Taps on the dimmed backdrop land on the dialog itself, outside its box.
    if (e.target !== sheet) return;
    const box = sheet.getBoundingClientRect();
    const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
    if (outside) closeSheet(sheet);
  });
  sheet.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeSheet(sheet);
  });
}

function openOrder() {
  $("order-title").textContent = "Your order";
  $("order-edit").hidden = false;
  $("order-done").hidden = true;
  setStatus($("order-status"), "");
  resetCancel();
  if (!$("name").value) $("name").value = state.me?.name || store.get("name") || "";
  renderOrderSheet();
  openSheet($("order-sheet"));
}

$("bag-btn").addEventListener("click", openOrder);
$("order-cta").addEventListener("click", openOrder);
$("p-change").addEventListener("click", openOrder);
$("more-btn").addEventListener("click", () => openSheet($("basics-sheet")));
$("basics-review").addEventListener("click", async () => {
  await closeSheet($("basics-sheet"));
  if (cartCount()) openOrder();
});

$("order-lines").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-step]");
  if (!btn) return;
  const li = btn.closest("li");
  const key = li.dataset.key;
  const next = (state.cart.get(key) || 0) + Number(btn.dataset.step);
  // Removing a line takes its buttons with it, so hand focus to the neighbouring line.
  const neighbour = next <= 0 ? (li.nextElementSibling || li.previousElementSibling) : null;
  setQty(key, next);
  if (next <= 0) {
    announce(`Removed ${drinkLabel(fromKey(key))}.`);
    (neighbour?.querySelector("[data-step='-1']") || $("name")).focus();
  }
});

$("name").addEventListener("input", () => renderOrderSheet());

$("order-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("order-status");
  const name = $("name").value.trim();
  if (!name) {
    setStatus(status, "Add your name so Kit knows whose drinks are whose.", true);
    $("name").focus();
    return;
  }
  if (!state.cart.size || state.busy) return;
  const wasNew = !state.me;
  state.busy = true;
  renderOrderSheet();
  setStatus(status, wasNew ? "Sending your order to Kit…" : "Updating your order…");
  try {
    const data = await api("checkout", { name, items: cartItems() });
    state.me = data.me;
    if (data.token) {
      store.set("id", data.me.id);
      store.set("token", data.token);
    }
    store.set("name", data.me.name);
    state.cart = toCart(data.me.items);
    saveCart();
    renderBoard(data.guests);
    setStatus(status, "");

    // The receipt prints in the sheet; the same one waits on the page once the sheet closes.
    $("order-title").textContent = `Thanks, ${data.me.name}!`;
    $("done-text").textContent = wasNew
      ? "Kit will make your drinks when you arrive. You can change your order any time before brunch."
      : "Your order is updated. Kit will make your drinks when you arrive.";
    const receipt = $("done-receipt");
    renderReceipt(receipt, data.me);
    const paper = receipt.querySelector(".receipt-wrap");
    paper.classList.remove("printing");
    void paper.offsetWidth;
    paper.classList.add("printing");
    $("order-edit").hidden = true;
    $("order-done").hidden = false;
    receipt.querySelector(".r-order").focus();
  } catch (err) {
    setStatus(status, err.message, true);
  } finally {
    state.busy = false;
    render();
  }
});

// Cancelling asks for a second tap, so a stray touch can't drop someone off the guest list.
let cancelTimer;
function resetCancel() {
  clearTimeout(cancelTimer);
  const btn = $("cancel-btn");
  delete btn.dataset.armed;
  btn.textContent = "Cancel my order";
}

function forgetOrder() {
  state.me = null;
  state.cart = new Map();
  for (const key of ["id", "token", "cart"]) store.drop(key);
}

$("cancel-btn").addEventListener("click", async () => {
  const btn = $("cancel-btn");
  if (btn.dataset.armed !== "1") {
    btn.dataset.armed = "1";
    btn.textContent = "Tap again to cancel your order";
    cancelTimer = setTimeout(resetCancel, 4000);
    return;
  }
  resetCancel();
  try {
    const data = await api("cancel");
    renderBoard(data.guests);
  } catch (err) {
    if (err.status !== 401) {
      setStatus($("order-status"), err.message, true);
      return;
    }
  }
  forgetOrder();
  render();
  await closeSheet($("order-sheet"));
  announce("Your order is cancelled.");
});

// ---------- start ----------

async function start() {
  buildPicks();
  buildBasics();
  const saved = store.get("cart");
  if (saved) {
    try { state.cart = toCart(JSON.parse(saved)); } catch {}
  }
  render();

  try {
    const data = await api("board");
    renderEvent(data.event);
    renderBoard(data.guests);
  } catch (err) {
    $("load-error").textContent = err.message;
    $("load-error").hidden = false;
  }

  if (store.get("id")) {
    try {
      state.me = (await api("me")).me;
      if (!saved) state.cart = toCart(state.me.items);
    } catch (err) {
      // Only forget the order if the server says it's gone; a flaky connection shouldn't lose it.
      if (err.status === 401) {
        store.drop("id");
        store.drop("token");
      }
    }
  }
  render();
}

start();
