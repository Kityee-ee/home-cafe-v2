import { drinkLabel } from "/menu.js";

const $ = (id) => document.getElementById(id);
const key = new URLSearchParams(location.search).get("key");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// A two-column list: what, and how many.
function tally(entries) {
  const ul = el("ul", undefined, "tally");
  for (const [what, n] of entries) {
    const li = el("li");
    li.append(el("span", what), el("span", String(n), "n"));
    ul.append(li);
  }
  return ul;
}

async function call(action, extra = {}) {
  let res;
  try {
    res = await fetch("/api/cafe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, key, ...extra }),
    });
  } catch {
    throw new Error("Couldn't reach the server.");
  }
  const data = await res.json().catch(() => ({ error: "Couldn't reach the server." }));
  if (!res.ok) throw new Error(data.error);
  return data;
}

function renderPrep(guests) {
  const drinks = new Map();
  for (const g of guests) {
    for (const item of g.items) {
      const label = drinkLabel(item);
      drinks.set(label, (drinks.get(label) || 0) + item.qty);
    }
  }

  const prep = $("prep");
  prep.replaceChildren();
  if (!guests.length) {
    prep.append(el("p", "No orders yet.", "muted"));
    return;
  }
  const total = [...drinks.values()].reduce((a, b) => a + b, 0);
  prep.append(el("p", `${plural(total, "drink")} for ${plural(guests.length, "guest")}`));
  prep.append(tally([...drinks].sort((a, b) => b[1] - a[1])));
}

// One row per guest: order number; name, when they last ordered and Remove; their drinks.
// Remove sits under the name rather than in its own column, so three columns fit a phone.
function renderOrders(guests) {
  const body = $("orders");
  body.replaceChildren();
  if (!guests.length) {
    const tr = el("tr");
    const td = el("td", "No orders yet.", "muted");
    td.colSpan = 3;
    tr.append(td);
    body.append(tr);
    return;
  }
  for (const g of guests) {
    const tr = el("tr");

    const no = el("td", g.orderNo, "o-no");

    const who = el("th");
    who.scope = "row";
    who.append(
      el("span", g.name, "o-name"),
      el("span", new Date(g.updatedAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }), "o-when"),
    );

    const drinks = el("td");
    const list = el("ul", undefined, "o-drinks");
    for (const item of g.items) {
      const li = el("li");
      li.append(el("span", `${item.qty} ×`, "o-qty"), el("span", drinkLabel(item)));
      list.append(li);
    }
    drinks.append(list);

    const remove = el("button", "Remove", "link-btn danger o-remove");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${g.name}`);
    remove.onclick = async () => {
      if (remove.dataset.armed !== "1") {
        remove.dataset.armed = "1";
        remove.textContent = "Tap again";
        remove.setAttribute("aria-label", `Tap again to remove ${g.name}`);
        return;
      }
      try {
        render(await call("remove", { id: g.id }));
      } catch (err) {
        $("host-status").textContent = err.message;
      }
    };
    who.append(remove);

    tr.append(no, who, drinks);
    body.append(tr);
  }
}

function render({ guests }) {
  const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  $("host-status").textContent = `${plural(guests.length, "guest")} · updated ${time}`;
  renderPrep(guests);
  renderOrders(guests);
}

async function load() {
  try {
    render(await call("host"));
  } catch (err) {
    $("host-status").textContent = err.message;
  }
}

$("refresh").addEventListener("click", load);
// Keeps the board current while it's open on the counter, without refreshing a hidden tab.
setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
load();
