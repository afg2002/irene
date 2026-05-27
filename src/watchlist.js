// Watchlist storage — simple JSON file
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "watchlist.json");

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { items: [], alerts: [] };
  }
}

function save(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function addItem(chatId, chain, address, symbol) {
  const data = load();
  const existing = data.items.find(i => i.chatId === chatId && i.address.toLowerCase() === address.toLowerCase());
  if (existing) {
    existing.symbol = symbol || existing.symbol;
    existing.chain = chain;
  } else {
    data.items.push({ chatId, chain, address, symbol: symbol || "", addedAt: Date.now() });
  }
  save(data);
  return existing ? "updated" : "added";
}

function removeItem(chatId, address) {
  const data = load();
  const idx = data.items.findIndex(i => i.chatId === chatId && i.address.toLowerCase() === address.toLowerCase());
  if (idx === -1) return false;
  data.items.splice(idx, 1);
  // also remove any alerts for this address
  data.alerts = data.alerts.filter(a => !(a.chatId === chatId && a.address.toLowerCase() === address.toLowerCase()));
  save(data);
  return true;
}

function getItems(chatId) {
  const data = load();
  return data.items.filter(i => i.chatId === chatId);
}

function getAllItems() {
  return load().items;
}

// Alert: { chatId, chain, address, symbol, alertPct, basePrice, triggered }
function setAlert(chatId, chain, address, symbol, alertPct) {
  const data = load();
  const existing = data.alerts.find(a => a.chatId === chatId && a.address.toLowerCase() === address.toLowerCase());
  if (existing) {
    existing.alertPct = alertPct;
    existing.triggered = false;
  } else {
    data.alerts.push({ chatId, chain, address, symbol: symbol || "", alertPct, basePrice: null, triggered: false, createdAt: Date.now() });
  }
  // also add to watchlist
  addItem(chatId, chain, address, symbol);
  save(data);
}

function removeAlert(chatId, address) {
  const data = load();
  data.alerts = data.alerts.filter(a => !(a.chatId === chatId && a.address.toLowerCase() === address.toLowerCase()));
  save(data);
}

function getAlerts(chatId) {
  const data = load();
  return data.alerts.filter(a => a.chatId === chatId);
}

function getAllAlerts() {
  return load().alerts;
}

function updateAlertPrice(address, price) {
  const data = load();
  let changed = false;
  for (const a of data.alerts) {
    if (a.address.toLowerCase() === address.toLowerCase() && a.basePrice === null) {
      a.basePrice = price;
      changed = true;
    }
  }
  if (changed) save(data);
}

module.exports = { addItem, removeItem, getItems, getAllItems, setAlert, removeAlert, getAlerts, getAllAlerts, updateAlertPrice };
