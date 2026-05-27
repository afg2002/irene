#!/usr/bin/env bun
/**
 * Irene Telegram Bot — Token screening via Telegram
 * Multi-chain: Solana, BSC, Base, Ethereum
 * Powered by GMGN API
 *
 * Usage: bun run bot.js
 */

import { config } from "dotenv";
config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN not set in .env");
  process.exit(1);
}

import screener from "./src/screener.js";
import watchlist from "./src/watchlist.js";

// ── Telegram Helpers ──────────────────────────────────────────

async function tg(method, body = {}) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(chatId, text, opts = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...opts,
  });
}

async function answerCallback(callbackId, text) {
  return tg("answerCallbackQuery", { callback_query_id: callbackId, text });
}

async function editMessage(chatId, msgId, text, markup) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: msgId,
    text,
    parse_mode: "HTML",
    reply_markup: markup,
  });
}

// ── Constants ──────────────────────────────────────────────────

const CHAIN_EMOJI = { sol: "🔷", bsc: "🟡", base: "🔵", eth: "💠" };
const CHAIN_DEX = { sol: "solana", bsc: "bsc", base: "base", eth: "ethereum" };
const GRADE_EMOJI = { A: "🟢", B: "🟢", C: "🟡", D: "🟠", F: "🔴" };
const SIGNAL_NAMES = {
  1: "Price Spike", 2: "Dex Ad", 3: "Dex Link Updated",
  4: "Dex Trending", 5: "Dex Boost", 6: "Price Spike", 7: "ATH",
  8: "MC Key Level", 9: "Live Stream", 10: "Bundler Sell",
  11: "CTO", 12: "Smart Money Buy", 13: "Platform Call",
  14: "Large Buy", 15: "Multiple Buys", 16: "Multiple Large Buys",
  17: "Bags Claim", 18: "Pump Claim",
};

// ── Format Helpers ─────────────────────────────────────────────

function fmtChain(chain) {
  return `${CHAIN_EMOJI[chain] || "⛓️"} ${chain.toUpperCase()}`;
}

function fmtNumber(n) {
  if (!n || n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPercent(n) {
  if (n === undefined || n === null) return "N/A";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtTimeAgo(ts) {
  if (!ts) return "N/A";
  const tsMs = ts > 1e12 ? ts : ts * 1000;
  const diff = Date.now() - tsMs;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j ${mins % 60}m lalu`;
  return `${Math.floor(hours / 24)}h ${hours % 24}j lalu`;
}

// ── DexScreener Link ───────────────────────────────────────────

function dexScreenerUrl(chain, address) {
  const dexChain = CHAIN_DEX[chain] || chain;
  return `https://dexscreener.com/${dexChain}/${address}`;
}

function tokenButtons(chain, address) {
  return {
    inline_keyboard: [[
      { text: "🔗 DexScreener", url: dexScreenerUrl(chain, address) },
    ]],
  };
}

// ── Token Card Formatter ───────────────────────────────────────

function formatTokenCard(result) {
  const { chain, token, score } = result;
  const symbol = token.symbol || "Unknown";
  const address = token.address || "";
  const gradeIcon = GRADE_EMOJI[score.grade] || "⚪";

  let lines = [
    `🪙 <b>${symbol}</b>  ${gradeIcon} <b>${score.grade}</b> (${score.total}/${score.maxTotal})`,
    `<code>${address}</code>`,
    `${fmtChain(chain)}`,
  ];

  const change1h = token.price_change_1h ?? token.price_change_percent1h;
  if (change1h !== undefined) {
    const c = typeof change1h === "string" ? parseFloat(change1h) : change1h;
    const emoji = c >= 0 ? "📈" : "📉";
    lines.push(`${emoji} 1h: ${c >= 0 ? "+" : ""}${c.toFixed(2)}%`);
  }

  const volume = token.volume_24h ?? token.volume ?? 0;
  if (volume) lines.push(`📊 Vol: ${fmtNumber(volume)}`);
  if (token.liquidity) lines.push(`💧 Liq: ${fmtNumber(token.liquidity)}`);
  const mc = token.usd_market_cap ?? token.market_cap ?? 0;
  if (mc) lines.push(`🏷️ MC: ${fmtNumber(mc)}`);
  if (token.holder_count) lines.push(`👥 Holders: ${token.holder_count}`);
  if (token.smart_degen_count) lines.push(`🧠 Smart: ${token.smart_degen_count}`);
  if (token.renowned_count) lines.push(`⭐ KOLs: ${token.renowned_count}`);
  const ts = token.created_timestamp ?? token.creation_timestamp ?? token.open_timestamp;
  if (ts) lines.push(`🕐 ${fmtTimeAgo(ts)}`);

  if (score.flags?.length) {
    lines.push(`\n🔴 <b>FLAGS</b>`);
    score.flags.forEach(f => lines.push(`  • ${f}`));
  }
  if (score.warnings?.length) {
    lines.push(`\n🟡 <b>WARNINGS</b>`);
    score.warnings.forEach(w => lines.push(`  • ${w}`));
  }
  if (score.passed?.length) {
    lines.push(`\n🟢 <b>PASSED</b>`);
    score.passed.forEach(p => lines.push(`  • ${p}`));
  }

  return { text: lines.join("\n"), markup: tokenButtons(chain, address) };
}

// ── Keyboard Builders ─────────────────────────────────────────

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔍 Screen New Tokens", callback_data: "screen" }],
      [{ text: "📈 Trending", callback_data: "trending" }],
      [{ text: "🚨 Signals SOL", callback_data: "signals:sol" },
       { text: "🚨 Signals BSC", callback_data: "signals:bsc" }],
      [{ text: "🚨 Signals Base", callback_data: "signals:base" },
       { text: "🚨 Signals ETH", callback_data: "signals:eth" }],
      [{ text: "🐋 Whale Alerts", callback_data: "whale" },
       { text: "🐋 KOL Trades", callback_data: "kol" }],
      [{ text: "🧠 Smart Money", callback_data: "smartmoney" },
       { text: "👁️ Watchlist", callback_data: "watchlist" }],
      [{ text: "📖 Help", callback_data: "help" }],
    ],
  };
}

function chainKeyboard(action) {
  return {
    inline_keyboard: [
      [{ text: "🔷 Solana", callback_data: `${action}:sol` },
       { text: "🟡 BSC", callback_data: `${action}:bsc` }],
      [{ text: "🔵 Base", callback_data: `${action}:base` },
       { text: "💠 Ethereum", callback_data: `${action}:eth` }],
      [{ text: "🔙 Back", callback_data: "menu" }],
    ],
  };
}

// ── Command Handlers ──────────────────────────────────────────

async function cmdStart(chatId) {
  return sendMessage(chatId,
    "🐺 <b>IRENE — TOKEN SCREENER</b>\n\n"
    + "Multi-chain screening · tracking · alerts\n"
    + "⛓️ Solana · BSC · Base · Ethereum\n\n"
    + "⬇️ <i>Pilih fitur:</i>",
    { reply_markup: mainMenuKeyboard() }
  );
}

async function cmdScreen(chatId, chain = null) {
  if (!chain) {
    await sendMessage(chatId, "🔍 <b>Screen New Tokens</b>\n\nPilih chain:", { reply_markup: chainKeyboard("screen") });
    return;
  }
  await sendMessage(chatId, `🔍 Scanning ${fmtChain(chain)} trenches...`);
  try {
    const results = await screener.screenTrenches(chain, {
      filterPreset: process.env.SCREEN_FILTER_PRESET || "safe",
      minVolume24h: parseFloat(process.env.MIN_VOLUME_24H || "1000"),
      maxRugRatio: parseFloat(process.env.MAX_RUG_RATIO || "0.3"),
      minSmartDegenCount: parseInt(process.env.MIN_SMART_DEGEN_COUNT || "1"),
      limit: parseInt(process.env.SCREEN_LIMIT || "10"),
    });
    const gradeOrder = ["A", "B", "C", "D", "F"];
    const minIdx = gradeOrder.indexOf(process.env.SCREEN_MIN_GRADE || "D");
    const passed = results.filter(r => gradeOrder.indexOf(r.score.grade) <= minIdx);
    if (passed.length === 0) {
      await sendMessage(chatId, `📭 No tokens passed on ${fmtChain(chain)}.\n\nScreened ${results.length} tokens.`);
      return;
    }
    await sendMessage(chatId, `✅ <b>${passed.length}</b> token(s) on ${fmtChain(chain)} (${results.length} screened):`);
    for (const r of passed.slice(0, 8)) {
      const card = formatTokenCard(r);
      await sendMessage(chatId, card.text, { reply_markup: card.markup });
    }
    if (passed.length > 8) await sendMessage(chatId, `… +${passed.length - 8} more.`);
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

async function cmdTrending(chatId, chain = null) {
  if (!chain) {
    await sendMessage(chatId, "📈 <b>Trending Tokens</b>\n\nPilih chain:", { reply_markup: chainKeyboard("trending") });
    return;
  }
  await sendMessage(chatId, `📈 Fetching trending on ${fmtChain(chain)}...`);
  try {
    const results = await screener.screenTrending(chain, { interval: "1h", limit: 10, orderBy: "volume" });
    const gradeOrder = ["A", "B", "C", "D", "F"];
    const passed = results.filter(r => gradeOrder.indexOf(r.score.grade) <= gradeOrder.indexOf("D"));
    if (passed.length === 0) {
      await sendMessage(chatId, `📭 No trending tokens passed on ${fmtChain(chain)}.`);
      return;
    }
    await sendMessage(chatId, `📈 <b>${passed.length}</b> trending on ${fmtChain(chain)}:`);
    for (const r of passed.slice(0, 8)) {
      const card = formatTokenCard(r);
      await sendMessage(chatId, card.text, { reply_markup: card.markup });
    }
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

async function cmdSignals(chatId, chain = "sol") {
  await sendMessage(chatId, `🚨 Fetching signals on ${fmtChain(chain)}...`);
  try {
    const { getSignals } = await import("./src/gmgn.js");
    const data = await getSignals(chain, { signalTypes: [], mcMin: null, mcMax: null });
    const signals = Array.isArray(data) ? data : (data?.list || data?.signals || []);
    if (!signals.length) {
      await sendMessage(chatId, `📭 No signals on ${fmtChain(chain)}.`);
      return;
    }
    await sendMessage(chatId, `🚨 <b>${signals.length}</b> signals on ${fmtChain(chain)}:`);
    for (const s of signals.slice(0, 5)) {
      const name = SIGNAL_NAMES[s.signal_type] || `Signal #${s.signal_type}`;
      const mc = s.trigger_mc || s.market_cap || 0;
      const addr = s.token_address || "";
      const symbol = s.token_symbol || "Unknown";
      const lines = [
        `🔔 <b>${name}</b>`,
        `🪙 ${symbol}`,
        `<code>${addr}</code>`,
        `⏰ ${fmtTimeAgo(s.trigger_at)}  ·  💰 MC: ${fmtNumber(mc)}`,
      ];
      if (s.signal_times > 1) lines.push(`📶 ${s.signal_times}x`);
      await sendMessage(chatId, lines.join("\n"), addr ? { reply_markup: tokenButtons(chain, addr) } : {});
    }
    if (signals.length > 5) await sendMessage(chatId, `… +${signals.length - 5} more.`);
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

// ── 🆕 Wallet Tracker ─────────────────────────────────────────

async function cmdTrack(chatId, text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) {
    await sendMessage(chatId,
      "🔎 <b>Wallet Tracker</b>\n\n"
      + "Format: <code>/track &lt;wallet&gt; &lt;chain&gt;</code>\n\n"
      + "Contoh:\n<code>/track 0x1234...5678 bsc</code>"
    );
    return;
  }
  const wallet = parts[1];
  const chain = parts[2] || "sol";

  await sendMessage(chatId, `🔎 Tracking wallet on ${fmtChain(chain)}...`);

  try {
    const { getFollowWallet } = await import("./src/gmgn.js");
    const data = await getFollowWallet(chain, { wallet, limit: 10, minAmountUsd: 0 });

    if (!data || data.length === 0) {
      await sendMessage(chatId, `📭 No recent trades from this wallet on ${fmtChain(chain)}.`);
      return;
    }

    const trades = Array.isArray(data) ? data : (data.list || data.trades || []);
    const symbol = trades[0]?.base_token?.symbol || trades[0]?.symbol || "Unknown";
    const buys = trades.filter(t => t.side === "buy");
    const sells = trades.filter(t => t.side === "sell");

    let lines = [
      `🔎 <b>Wallet Tracker</b>`,
      `<code>${wallet}</code>`,
      `${fmtChain(chain)}`,
      `🟢 ${buys.length} buys  ·  🔴 ${sells.length} sells`,
      "",
    ];

    trades.slice(0, 8).forEach(t => {
      const side = t.side === "buy" ? "🟢 BUY" : t.side === "sell" ? "🔴 SELL" : "⚪";
      const token = t.base_token?.symbol || t.symbol || "???";
      const amt = t.amount_usd || t.usd_amount || 0;
      const ts = t.timestamp || t.time || 0;
      lines.push(`${side} ${token} ${fmtNumber(amt)} — ${fmtTimeAgo(ts)}`);
    });

    await sendMessage(chatId, lines.join("\n"));
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

// ── 🆕 Whale Alert ────────────────────────────────────────────

async function cmdWhale(chatId, chain = null) {
  if (!chain) {
    await sendMessage(chatId, "🐋 <b>Whale Alerts</b>\n\nPilih chain:", { reply_markup: chainKeyboard("whale") });
    return;
  }
  await sendMessage(chatId, `🐋 Scanning whales on ${fmtChain(chain)}...`);

  try {
    const { getKol, getSmartMoney } = await import("./src/gmgn.js");
    const [kolData, smData] = await Promise.all([
      getKol(chain, 30),
      getSmartMoney(chain, 30),
    ]);

    const kolTrades = (kolData?.list || []).filter(t => (t.amount_usd || 0) >= 5000);
    const smTrades = (smData?.list || []).filter(t => (t.amount_usd || 0) >= 5000);

    const allTrades = [...kolTrades, ...smTrades].sort((a, b) => (b.amount_usd || 0) - (a.amount_usd || 0));

    if (allTrades.length === 0) {
      await sendMessage(chatId, `🐋 No whale trades ≥$5K on ${fmtChain(chain)}.`);
      return;
    }

    await sendMessage(chatId, `🐋 <b>${allTrades.length}</b> whale trades on ${fmtChain(chain)} (≥$5K):`);

    const shown = new Set();
    for (const t of allTrades.slice(0, 8)) {
      const tokenAddr = t.base_address || "";
      const tokenSym = t.base_token?.symbol || "???";
      const side = t.side === "buy" ? "🟢 BUY" : "🔴 SELL";
      const amt = t.amount_usd || 0;
      const maker = t.maker ? t.maker.slice(0, 6) + "..." : "";
      const lines = [
        `${side} <b>${tokenSym}</b> ${fmtNumber(amt)}`,
        `<code>${tokenAddr}</code>`,
        maker ? `👤 ${maker}  ·  ${fmtTimeAgo(t.timestamp)}` : `⏰ ${fmtTimeAgo(t.timestamp)}`,
      ];
      await sendMessage(chatId, lines.join("\n"), tokenAddr ? { reply_markup: tokenButtons(chain, tokenAddr) } : {});
    }
    if (allTrades.length > 8) await sendMessage(chatId, `… +${allTrades.length - 8} more.`);
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

// ── 🆕 Watchlist ──────────────────────────────────────────────

async function cmdWatchAdd(chatId, text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 3) {
    await sendMessage(chatId,
      "➕ <b>Add to Watchlist</b>\n\n"
      + "Format: <code>/add &lt;address&gt; &lt;chain&gt;</code>\n\n"
      + "Contoh:\n<code>/add 0x1234...5678 bsc</code>"
    );
    return;
  }
  const address = parts[1];
  const chain = parts[2] || "bsc";

  try {
    const { getTokenInfo } = await import("./src/gmgn.js");
    const info = await getTokenInfo(chain, address);
    const symbol = info?.symbol || "Unknown";
    const result = watchlist.addItem(chatId, chain, address, symbol);
    await sendMessage(chatId,
      result === "added"
        ? `✅ <b>${symbol}</b> added to watchlist!\n<code>${address}</code>  ·  ${fmtChain(chain)}`
        : `🔄 <b>${symbol}</b> already in watchlist — updated.`
    );
  } catch (e) {
    // Add anyway even if info fails
    watchlist.addItem(chatId, chain, address, "");
    await sendMessage(chatId, `✅ Added to watchlist.\n<code>${address}</code>  ·  ${fmtChain(chain)}`);
  }
}

async function cmdWatchRemove(chatId, text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) {
    await sendMessage(chatId, "➖ <b>Remove from Watchlist</b>\n\nFormat: <code>/remove &lt;address&gt;</code>");
    return;
  }
  const address = parts[1];
  const ok = watchlist.removeItem(chatId, address);
  await sendMessage(chatId, ok ? `✅ Removed from watchlist.` : `❌ Address not in your watchlist.`);
}

async function cmdWatchlist(chatId) {
  const items = watchlist.getItems(chatId);
  const alerts = watchlist.getAlerts(chatId);

  if (items.length === 0) {
    await sendMessage(chatId,
      "👁️ <b>Watchlist</b>\n\n"
      + "Your watchlist is empty.\n\n"
      + "Add tokens: <code>/add &lt;address&gt; &lt;chain&gt;</code>\n"
      + "Set alert: <code>/alert &lt;address&gt; &lt;chain&gt; &lt;pct&gt;</code>"
    );
    return;
  }

  await sendMessage(chatId, `👁️ Fetching prices for ${items.length} token(s)...`);

  const { getTokenInfo } = await import("./src/gmgn.js");
  const { sleep } = await import("./src/gmgn.js");

  for (const item of items) {
    try {
      const info = await getTokenInfo(item.chain, item.address);
      const price = info?.price || 0;
      const change = info?.price_change_percent1h ?? info?.price_change_percent ?? 0;
      const mc = info?.market_cap || 0;
      const cEmoji = change >= 0 ? "📈" : "📉";
      const changeStr = change ? ` ${cEmoji} ${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "";

      // Check alerts
      const alert = alerts.find(a => a.address.toLowerCase() === item.address.toLowerCase());
      let alertLine = "";
      if (alert) {
        if (!alert.basePrice && price > 0) {
          watchlist.updateAlertPrice(item.address, price);
          alert.basePrice = price;
        }
        if (alert.basePrice && price > 0) {
          const pctChange = ((price - alert.basePrice) / alert.basePrice) * 100;
          const aEmoji = Math.abs(pctChange) >= alert.alertPct ? "🚨" : "🔔";
          alertLine = `\n${aEmoji} Alert: ${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}% (threshold: ±${alert.alertPct}%)`;
          // Trigger notification
          if (Math.abs(pctChange) >= alert.alertPct && !alert.triggered) {
            alert.triggered = true;
            // save triggered state
            const { getAllAlerts } = watchlist;
          }
        }
      }

      const lines = [
        `<b>${item.symbol || "Unknown"}</b>  ·  ${fmtChain(item.chain)}`,
        `<code>${item.address}</code>`,
        `💵 $${price > 0 ? price.toFixed(price < 0.01 ? 8 : 4) : "N/A"}${changeStr}  ·  🏷️ MC: ${fmtNumber(mc)}`,
        alertLine,
      ].filter(Boolean);

      await sendMessage(chatId, lines.join("\n"), { reply_markup: tokenButtons(item.chain, item.address) });
      await sleep(800);
    } catch (e) {
      await sendMessage(chatId, `⚠️ <b>${item.symbol || "Unknown"}</b>: ${e.message}`);
    }
  }
}

async function cmdAlert(chatId, text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 4) {
    await sendMessage(chatId,
      "🚨 <b>Set Price Alert</b>\n\n"
      + "Format: <code>/alert &lt;address&gt; &lt;chain&gt; &lt;pct&gt;</code>\n\n"
      + "Contoh:\n<code>/alert 0x1234...5678 bsc 10</code>\n"
      + "(alert pas harga naik/turun ±10%)"
    );
    return;
  }
  const address = parts[1];
  const chain = parts[2];
  const pct = parseFloat(parts[3]);

  if (isNaN(pct) || pct <= 0 || pct > 100) {
    await sendMessage(chatId, "❌ Invalid percentage. Must be between 0-100.");
    return;
  }

  try {
    const { getTokenInfo } = await import("./src/gmgn.js");
    const info = await getTokenInfo(chain, address);
    const symbol = info?.symbol || "Unknown";
    const price = info?.price || 0;

    watchlist.setAlert(chatId, chain, address, symbol, pct);
    if (price > 0) watchlist.updateAlertPrice(address, price);

    await sendMessage(chatId,
      `🚨 <b>Alert Set!</b>\n\n`
      + `<b>${symbol}</b>  ·  ${fmtChain(chain)}\n`
      + `<code>${address}</code>\n\n`
      + `💰 Current: $${price > 0 ? price.toFixed(6) : "N/A"}\n`
      + `📏 Threshold: ±${pct}%`
    );
  } catch (e) {
    watchlist.setAlert(chatId, chain, address, "", pct);
    await sendMessage(chatId, `🚨 Alert set at ±${pct}%.\n<code>${address}</code>  ·  ${fmtChain(chain)}`);
  }
}

async function cmdAlertRemove(chatId, text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) {
    await sendMessage(chatId, "Format: <code>/alertremove &lt;address&gt;</code>");
    return;
  }
  watchlist.removeAlert(chatId, parts[1]);
  watchlist.removeItem(chatId, parts[1]);
  await sendMessage(chatId, "✅ Alert removed.");
}

// ── KOL / Smart Money / Deep (unchanged core) ─────────────────

async function cmdKol(chatId, chain = "sol") {
  await sendMessage(chatId, `🐋 Fetching KOL trades on ${fmtChain(chain)}...`);
  try {
    const { getKol } = await import("./src/gmgn.js");
    const data = await getKol(chain, 50);
    const trades = data?.list || [];
    if (!trades.length) {
      await sendMessage(chatId, `📭 No KOL trades on ${fmtChain(chain)}.`);
      return;
    }
    const byToken = {};
    trades.forEach(t => {
      const addr = t.base_address || "unknown";
      if (!byToken[addr]) byToken[addr] = { symbol: t.base_token?.symbol || "Unknown", trades: [] };
      byToken[addr].trades.push(t);
    });
    const entries = Object.entries(byToken);
    await sendMessage(chatId, `🐋 <b>KOL Trades</b> — ${fmtChain(chain)}\n${trades.length} trades · ${entries.length} tokens:`);
    for (const [addr, group] of entries.slice(0, 5)) {
      const buys = group.trades.filter(t => t.side === "buy");
      const sells = group.trades.filter(t => t.side === "sell");
      const lines = [
        `<b>${group.symbol}</b>`,
        `<code>${addr}</code>`,
        `🟢 ${buys.length} buys  ·  🔴 ${sells.length} sells`,
      ];
      group.trades.slice(0, 3).forEach(t => {
        const side = t.side === "buy" ? "🟢 BUY" : "🔴 SELL";
        lines.push(`  ${side} ${fmtNumber(t.amount_usd || 0)} — ${fmtTimeAgo(t.timestamp)}`);
      });
      await sendMessage(chatId, lines.join("\n"), { reply_markup: tokenButtons(chain, addr) });
    }
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

async function cmdSmartMoney(chatId, chain = "sol") {
  await sendMessage(chatId, `🧠 Fetching Smart Money on ${fmtChain(chain)}...`);
  try {
    const { getSmartMoney } = await import("./src/gmgn.js");
    const data = await getSmartMoney(chain, 50);
    const trades = data?.list || [];
    if (!trades.length) {
      await sendMessage(chatId, `📭 No smart money trades on ${fmtChain(chain)}.`);
      return;
    }
    const byToken = {};
    trades.forEach(t => {
      const addr = t.base_address || "unknown";
      if (!byToken[addr]) byToken[addr] = { symbol: t.base_token?.symbol || "Unknown", trades: [] };
      byToken[addr].trades.push(t);
    });
    const entries = Object.entries(byToken);
    await sendMessage(chatId, `🧠 <b>Smart Money</b> — ${fmtChain(chain)}\n${trades.length} trades · ${entries.length} tokens:`);
    for (const [addr, group] of entries.slice(0, 5)) {
      const buys = group.trades.filter(t => t.side === "buy");
      const sells = group.trades.filter(t => t.side === "sell");
      const distinct = new Set(group.trades.map(t => t.maker)).size;
      const lines = [
        `<b>${group.symbol}</b>`,
        `<code>${addr}</code>`,
        `🟢 ${buys.length} buys  ·  🔴 ${sells.length} sells  ·  👤 ${distinct} wallets`,
      ];
      if (distinct >= 3) lines.push(`  ⚡ <b>CLUSTER SIGNAL!</b>`);
      await sendMessage(chatId, lines.join("\n"), { reply_markup: tokenButtons(chain, addr) });
    }
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

async function cmdDeep(chatId, text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) {
    await sendMessage(chatId,
      "🔬 <b>Deep Screen</b>\n\n"
      + "Format: <code>/deep &lt;address&gt; &lt;chain&gt;</code>\n\n"
      + "Contoh:\n<code>/deep 0x1234...5678 bsc</code>"
    );
    return;
  }
  const address = parts[1];
  const chain = parts[2] || "bsc";
  await sendMessage(chatId, `🔬 Deep screening on ${fmtChain(chain)}...`);
  try {
    const result = await screener.deepScreen(chain, address);
    const { score, info, security } = result;
    const lines = [
      `🔬 <b>DEEP SCREEN</b> — ${info?.symbol || "Unknown"}`,
      `<code>${address}</code>`,
      `${fmtChain(chain)}`,
      "",
      `🏆 <b>Grade:</b> ${GRADE_EMOJI[score.grade]} ${score.grade} (${score.total}/${score.maxTotal})`,
      "",
    ];
    if (info) {
      if (info.name) lines.push(`📛 Name: ${info.name}`);
      if (info.price) lines.push(`💵 Price: $${info.price.toFixed(8)}`);
      lines.push(`🏷️ MC: ${fmtNumber(info.market_cap)}`);
      lines.push(`💧 Liquidity: ${fmtNumber(info.liquidity)}`);
      if (info.holder_count) lines.push(`👥 Holders: ${info.holder_count}`);
      lines.push(`📊 Vol 24h: ${fmtNumber(info.volume_24h)}`);
    }
    lines.push("", "🛡️ <b>SECURITY</b>");
    if (security) {
      if (chain !== "sol") {
        const hp = security.is_honeypot;
        lines.push(`  Honeypot: ${hp === "yes" ? "🔴 YES" : hp === "no" ? "🟢 No" : "🟡 Unknown"}`);
      }
      lines.push(`  Open Source: ${security.open_source === "yes" ? "🟢 Yes" : "🔴 No"}`);
      if (chain === "sol") {
        lines.push(`  Mint Renounced: ${security.renounced_mint ? "🟢 Yes" : "🔴 No"}`);
        lines.push(`  Freeze Renounced: ${security.renounced_freeze_account ? "🟢 Yes" : "🔴 No"}`);
      } else {
        lines.push(`  Owner Renounced: ${security.owner_renounced === "yes" ? "🟢 Yes" : "🔴 No"}`);
      }
      lines.push(`  Buy Tax: ${fmtPercent(security.buy_tax)}`);
      lines.push(`  Sell Tax: ${fmtPercent(security.sell_tax)}`);
      lines.push(`  Top 10 Rate: ${fmtPercent(security.top_10_holder_rate)}`);
      lines.push(`  Rug Ratio: ${fmtPercent(security.rug_ratio)}`);
      if (security.sniper_count) lines.push(`  Snipers: ${security.sniper_count}`);
    }
    if (score.flags?.length) {
      lines.push(`\n🔴 <b>FLAGS</b>`);
      score.flags.forEach(f => lines.push(`  • ${f}`));
    }
    await sendMessage(chatId, lines.join("\n"), { reply_markup: tokenButtons(chain, address) });
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

// ── Callback Handler ──────────────────────────────────────────

async function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const msgId = cb.message.message_id;
  const data = cb.data;

  await answerCallback(cb.id, "");

  if (data === "menu") {
    await editMessage(chatId, msgId,
      "🐺 <b>IRENE — TOKEN SCREENER</b>\n\nPilih fitur:",
      mainMenuKeyboard()
    );
    return;
  }

  if (data === "watchlist") {
    await cmdWatchlist(chatId);
    return;
  }

  const [action, param] = data.split(":");

  switch (action) {
    case "screen": param ? await cmdScreen(chatId, param) : await cmdScreen(chatId); break;
    case "trending": param ? await cmdTrending(chatId, param) : await cmdTrending(chatId); break;
    case "signals": param ? await cmdSignals(chatId, param) : await cmdSignals(chatId); break;
    case "kol": param ? await cmdKol(chatId, param) : await sendMessage(chatId, "🐋 <b>KOL Trades</b>\n\nPilih chain:", { reply_markup: chainKeyboard("kol") }); break;
    case "smartmoney": param ? await cmdSmartMoney(chatId, param) : await sendMessage(chatId, "🧠 <b>Smart Money</b>\n\nPilih chain:", { reply_markup: chainKeyboard("smartmoney") }); break;
    case "whale": param ? await cmdWhale(chatId, param) : await sendMessage(chatId, "🐋 <b>Whale Alerts</b>\n\nPilih chain:", { reply_markup: chainKeyboard("whale") }); break;
    case "help":
      await sendMessage(chatId,
        "📖 <b>IRENE — COMMANDS</b>\n\n"
        + "/start — Main menu\n"
        + "/screen — Screen new tokens\n"
        + "/trending — Trending tokens\n"
        + "/signals — Signal alerts (Sol/BSC/Base/ETH)\n"
        + "/kol — KOL wallet trades\n"
        + "/smartmoney — Smart money trades\n"
        + "/whale — Whale alerts (≥$5K trades)\n"
        + "/track <code>&lt;wallet&gt; &lt;chain&gt;</code> — Track wallet\n"
        + "/deep <code>&lt;addr&gt; &lt;chain&gt;</code> — Deep screen\n"
        + "/add <code>&lt;addr&gt; &lt;chain&gt;</code> — Add to watchlist\n"
        + "/watch — View watchlist with prices\n"
        + "/remove <code>&lt;addr&gt;</code> — Remove from watchlist\n"
        + "/alert <code>&lt;addr&gt; &lt;chain&gt; &lt;pct&gt;</code> — Set price alert\n"
        + "/alertremove <code>&lt;addr&gt;</code> — Remove alert\n"
        + "/help — This help\n\n"
        + "💡 <i>Tap addresses to copy. DexScreener links included.</i>",
        { reply_markup: { inline_keyboard: [[{ text: "🔙 Main Menu", callback_data: "menu" }]] } }
      );
      break;
  }
}

// ── 🆕 Alert Checker (runs every 5 min) ───────────────────────

async function checkAlerts() {
  try {
    const alerts = watchlist.getAllAlerts();
    if (alerts.length === 0) return;

    const { getTokenInfo } = await import("./src/gmgn.js");

    for (const alert of alerts) {
      try {
        const info = await getTokenInfo(alert.chain, alert.address);
        const price = info?.price;
        if (!price || price <= 0) continue;

        if (!alert.basePrice) {
          watchlist.updateAlertPrice(alert.address, price);
          alert.basePrice = price;
          continue;
        }

        const pctChange = ((price - alert.basePrice) / alert.basePrice) * 100;

        if (Math.abs(pctChange) >= alert.alertPct) {
          const emoji = pctChange >= 0 ? "📈" : "📉";
          await sendMessage(alert.chatId,
            `🚨 <b>PRICE ALERT!</b>\n\n`
            + `<b>${alert.symbol}</b>  ·  ${fmtChain(alert.chain)}\n`
            + `<code>${alert.address}</code>\n\n`
            + `${emoji} ${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%  (threshold: ±${alert.alertPct}%)\n`
            + `💰 From: $${alert.basePrice.toFixed(6)} → Now: $${price.toFixed(6)}`,
            { reply_markup: tokenButtons(alert.chain, alert.address) }
          );
          // Reset base so it alerts again on next threshold cross
          watchlist.updateAlertPrice(alert.address, price);
        }
      } catch (e) {
        // silently skip failed checks
      }
    }
  } catch (e) {
    console.error("Alert checker error:", e.message);
  }
}

// ── Main Polling Loop ─────────────────────────────────────────

async function main() {
  console.log("🐺 Irene Telegram Bot starting...");
  console.log(`Token: ${TELEGRAM_TOKEN.slice(0, 8)}...`);

  // Start alert checker (every 5 minutes)
  setInterval(checkAlerts, 5 * 60 * 1000);
  console.log("🔔 Alert checker started (every 5 min)");

  let offset = 0;

  while (true) {
    try {
      const res = await fetch(`${TELEGRAM_API}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offset,
          timeout: 30,
          allowed_updates: ["message", "callback_query"],
        }),
      });
      const data = await res.json();

      if (!data.ok || !data.result) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;

        if (update.callback_query) {
          await handleCallback(update.callback_query);
          continue;
        }

        if (update.message?.text) {
          const msg = update.message;
          const chatId = msg.chat.id;
          const text = msg.text.trim();

          if (text === "/start") await cmdStart(chatId);
          else if (text === "/screen") await cmdScreen(chatId);
          else if (text === "/trending") await cmdTrending(chatId);
          else if (text === "/signals") await cmdSignals(chatId);
          else if (text === "/kol") await cmdKol(chatId);
          else if (text === "/smartmoney") await cmdSmartMoney(chatId);
          else if (text === "/whale") await cmdWhale(chatId);
          else if (text === "/watch" || text === "/watchlist") await cmdWatchlist(chatId);
          else if (text.startsWith("/track")) await cmdTrack(chatId, text);
          else if (text.startsWith("/deep")) await cmdDeep(chatId, text);
          else if (text.startsWith("/add")) await cmdWatchAdd(chatId, text);
          else if (text.startsWith("/remove")) await cmdWatchRemove(chatId, text);
          else if (text.startsWith("/alertremove")) await cmdAlertRemove(chatId, text);
          else if (text.startsWith("/alert")) await cmdAlert(chatId, text);
          else if (text === "/help") {
            await sendMessage(chatId,
              "📖 <b>IRENE — COMMANDS</b>\n\n"
              + "/start · /screen · /trending\n"
              + "/signals · /kol · /smartmoney\n"
              + "/whale · /track <code>&lt;wallet&gt; &lt;chain&gt;</code>\n"
              + "/deep <code>&lt;addr&gt; &lt;chain&gt;</code>\n"
              + "/add <code>&lt;addr&gt; &lt;chain&gt;</code>\n"
              + "/watch · /remove <code>&lt;addr&gt;</code>\n"
              + "/alert <code>&lt;addr&gt; &lt;chain&gt; &lt;pct&gt;</code>\n"
              + "/alertremove <code>&lt;addr&gt;</code>\n"
              + "/help",
              { reply_markup: mainMenuKeyboard() }
            );
          } else {
            await sendMessage(chatId,
              "🐺 <b>IRENE — TOKEN SCREENER</b>\n\nPilih fitur:",
              { reply_markup: mainMenuKeyboard() }
            );
          }
        }
      }
    } catch (e) {
      console.error("Polling error:", e.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
