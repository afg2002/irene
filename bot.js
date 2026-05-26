#!/usr/bin/env bun
/**
 * Irene Telegram Bot — Token screening via Telegram
 * Wraps the existing Cerberus CLI into a Telegram bot interface.
 *
 * Usage: bun run bot.js
 * Or:    bun bot.js
 */

import { config } from "dotenv";
config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN not set in .env");
  process.exit(1);
}

// Import existing screens
import screener from "./src/screener.js";

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

// ── Format Helpers ─────────────────────────────────────────────

const CHAIN_EMOJI = { sol: "🔷", bsc: "🟡", base: "🔵", eth: "💠" };
const GRADE_EMOJI = { A: "🟢", B: "🟢", C: "🟡", D: "🟠", F: "🔴" };

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

function fmtShortAddr(addr) {
  if (!addr) return "N/A";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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

// ── Token Card Formatter ──────────────────────────────────────

function formatTokenCard(result) {
  const { chain, token, score } = result;
  const symbol = token.symbol || "Unknown";
  const addr = fmtShortAddr(token.address);
  const gradeIcon = GRADE_EMOJI[score.grade] || "⚪";

  let lines = [
    `<b>${symbol}</b> — ${gradeIcon} <b>Grade ${score.grade}</b> (${score.total}/${score.maxTotal})`,
    `📋 <code>${addr}</code>`,
    `⛓️ ${fmtChain(chain)}`,
  ];

  const change1h = token.price_change_1h ?? token.price_change_percent1h;
  if (change1h !== undefined) {
    const c = typeof change1h === "string" ? parseFloat(change1h) : change1h;
    const emoji = c >= 0 ? "📈" : "📉";
    lines.push(`${emoji} 1h: ${c >= 0 ? "+" : ""}${c.toFixed(2)}%`);
  }

  const volume = token.volume_24h ?? token.volume ?? 0;
  if (volume) lines.push(`📊 Volume: ${fmtNumber(volume)}`);
  if (token.liquidity) lines.push(`💧 Liquidity: ${fmtNumber(token.liquidity)}`);
  const mc = token.usd_market_cap ?? token.market_cap ?? 0;
  if (mc) lines.push(`🏷️ MC: ${fmtNumber(mc)}`);
  if (token.holder_count) lines.push(`👥 Holders: ${token.holder_count}`);
  if (token.smart_degen_count) lines.push(`🧠 Smart Money: ${token.smart_degen_count}`);
  if (token.renowned_count) lines.push(`⭐ KOLs: ${token.renowned_count}`);
  const ts = token.created_timestamp ?? token.creation_timestamp ?? token.open_timestamp;
  if (ts) lines.push(`🕐 Created: ${fmtTimeAgo(ts)}`);

  if (score.flags?.length) {
    lines.push(`\n🔴 <b>RED FLAGS:</b>`);
    score.flags.forEach(f => lines.push(`  • ${f}`));
  }
  if (score.warnings?.length) {
    lines.push(`\n🟡 <b>WARNINGS:</b>`);
    score.warnings.forEach(w => lines.push(`  • ${w}`));
  }
  if (score.passed?.length) {
    lines.push(`\n🟢 <b>PASSED:</b>`);
    score.passed.forEach(p => lines.push(`  • ${p}`));
  }

  return lines.join("\n");
}

// ── Keyboard Builders ─────────────────────────────────────────

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔍 Screen Tokens", callback_data: "screen" }],
      [{ text: "📈 Trending", callback_data: "trending" }],
      [{ text: "🚨 Signals (SOL)", callback_data: "signals:sol" },
       { text: "🚨 Signals (BSC)", callback_data: "signals:bsc" }],
      [{ text: "🐋 KOL Trades", callback_data: "kol" },
       { text: "🧠 Smart Money", callback_data: "smartmoney" }],
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
    "🐺 <b>IRENE TOKEN SCREENER</b>\n\n"
    + "Multi-chain token screening via Telegram. Powered by GMGN API.\n\n"
    + "⛓️ <b>Chains:</b> Solana, BSC, Base, Ethereum\n\n"
    + "⬇️ Pilih fitur di bawah:",
    { reply_markup: mainMenuKeyboard() }
  );
}

async function cmdScreen(chatId, chain = null) {
  if (!chain) {
    await sendMessage(chatId, "🔍 <b>Screen Tokens</b>\n\nPilih chain:", { reply_markup: chainKeyboard("screen") });
    return;
  }

  const msg = await sendMessage(chatId, `🔍 Scanning ${fmtChain(chain)} trenches...`);

  try {
    const results = await screener.screenTrenches(chain, {
      filterPreset: process.env.SCREEN_FILTER_PRESET || "safe",
      minVolume24h: parseFloat(process.env.MIN_VOLUME_24H || "1000"),
      maxRugRatio: parseFloat(process.env.MAX_RUG_RATIO || "0.3"),
      minSmartDegenCount: parseInt(process.env.MIN_SMART_DEGEN_COUNT || "1"),
      limit: parseInt(process.env.SCREEN_LIMIT || "10"),
    });

    const gradeOrder = ["A", "B", "C", "D", "F"];
    const minGrade = process.env.SCREEN_MIN_GRADE || "D";
    const minIdx = gradeOrder.indexOf(minGrade);
    const passed = results.filter(r => gradeOrder.indexOf(r.score.grade) <= minIdx);

    if (passed.length === 0) {
      await sendMessage(chatId, `📭 No tokens passed screening on ${fmtChain(chain)}.\n\nScreened ${results.length} tokens.`);
      return;
    }

    await sendMessage(chatId, `✅ <b>${passed.length}</b> token(s) passed on ${fmtChain(chain)}:\n(screened ${results.length} total)`);

    for (const r of passed.slice(0, 8)) {
      await sendMessage(chatId, formatTokenCard(r));
    }

    if (passed.length > 8) {
      await sendMessage(chatId, `... and ${passed.length - 8} more. Narrow filter or try another chain.`);
    }
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

async function cmdTrending(chatId, chain = null) {
  if (!chain) {
    await sendMessage(chatId, "📈 <b>Trending Tokens</b>\n\nPilih chain:", { reply_markup: chainKeyboard("trending") });
    return;
  }

  const msg = await sendMessage(chatId, `📈 Fetching trending on ${fmtChain(chain)}...`);

  try {
    const results = await screener.screenTrending(chain, {
      interval: "1h",
      limit: 10,
      orderBy: "volume",
    });

    const gradeOrder = ["A", "B", "C", "D", "F"];
    const passed = results.filter(r => gradeOrder.indexOf(r.score.grade) <= gradeOrder.indexOf("D"));

    if (passed.length === 0) {
      await sendMessage(chatId, `📭 No trending tokens passed screening on ${fmtChain(chain)}.`);
      return;
    }

    await sendMessage(chatId, `📈 <b>${passed.length}</b> trending on ${fmtChain(chain)}:`);

    for (const r of passed.slice(0, 8)) {
      await sendMessage(chatId, formatTokenCard(r));
    }
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

async function cmdSignals(chatId, chain = "sol") {
  const msg = await sendMessage(chatId, `🚨 Fetching signals on ${fmtChain(chain)}...`);

  try {
    const { getSignals } = await import("./src/gmgn.js");
    const data = await getSignals(chain, {
      signalTypes: [],
      mcMin: null, mcMax: null,
    });

    const signals = Array.isArray(data) ? data : (data?.list || data?.signals || []);

    if (!signals.length) {
      await sendMessage(chatId, `📭 No signals on ${fmtChain(chain)}.`);
      return;
    }

    const SIGNAL_NAMES = {
      1: "Price Spike (K-line)", 2: "Dex Ad", 3: "Dex Link Updated",
      4: "Dex Trending", 5: "Dex Boost", 6: "Price Spike", 7: "All-Time High",
      8: "MC Key Level", 9: "Live Stream", 10: "Bundler Sell",
      11: "Community Takeover", 12: "Smart Money Buy", 13: "Platform Call",
      14: "Large Buy", 15: "Multiple Buys", 16: "Multiple Large Buys",
      17: "Bags Claim", 18: "Pump Claim",
    };

    await sendMessage(chatId, `🚨 <b>${signals.length}</b> signal(s) on ${fmtChain(chain)}:`);

    for (const s of signals.slice(0, 5)) {
      const name = SIGNAL_NAMES[s.signal_type] || `Signal #${s.signal_type}`;
      const mc = s.trigger_mc || s.market_cap || 0;
      const lines = [
        `🔔 <b>${name}</b>`,
        `🪙 ${s.token_symbol || fmtShortAddr(s.token_address)}`,
        `⏰ ${fmtTimeAgo(s.trigger_at)}`,
        `💰 MC: ${fmtNumber(mc)}`,
      ];
      if (s.signal_times > 1) lines.push(`📶 ${s.signal_times}x`);
      await sendMessage(chatId, lines.join("\n"));
    }

    if (signals.length > 5) {
      await sendMessage(chatId, `... dan ${signals.length - 5} signals lainnya.`);
    }
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

async function cmdKol(chatId, chain = "sol") {
  const msg = await sendMessage(chatId, `🐋 Fetching KOL trades on ${fmtChain(chain)}...`);

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

    let text = `🐋 <b>KOL Trades</b> — ${fmtChain(chain)}\n${trades.length} trades across ${Object.keys(byToken).length} tokens:\n`;
    await sendMessage(chatId, text);

    for (const [addr, group] of Object.entries(byToken).slice(0, 5)) {
      const buys = group.trades.filter(t => t.side === "buy");
      const sells = group.trades.filter(t => t.side === "sell");
      const lines = [
        `<b>${group.symbol}</b> (${fmtShortAddr(addr)})`,
        `🟢 ${buys.length} buys / 🔴 ${sells.length} sells`,
      ];
      group.trades.slice(0, 3).forEach(t => {
        const side = t.side === "buy" ? "🟢 BUY" : "🔴 SELL";
        lines.push(`  ${side} ${fmtNumber(t.amount_usd || 0)} — ${fmtTimeAgo(t.timestamp)}`);
      });
      await sendMessage(chatId, lines.join("\n"));
    }
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

async function cmdSmartMoney(chatId, chain = "sol") {
  const msg = await sendMessage(chatId, `🧠 Fetching Smart Money on ${fmtChain(chain)}...`);

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

    let text = `🧠 <b>Smart Money</b> — ${fmtChain(chain)}\n${trades.length} trades across ${Object.keys(byToken).length} tokens:\n`;
    await sendMessage(chatId, text);

    for (const [addr, group] of Object.entries(byToken).slice(0, 5)) {
      const buys = group.trades.filter(t => t.side === "buy");
      const sells = group.trades.filter(t => t.side === "sell");
      const distinct = new Set(group.trades.map(t => t.maker)).size;
      const lines = [
        `<b>${group.symbol}</b> (${fmtShortAddr(addr)})`,
        `🟢 ${buys.length} buys / 🔴 ${sells.length} sells | ${distinct} wallets`,
      ];
      if (distinct >= 3) lines.push(`  ⚡ <b>CLUSTER SIGNAL!</b>`);
      await sendMessage(chatId, lines.join("\n"));
    }
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

  const [action, param] = data.split(":");

  switch (action) {
    case "menu":
      await editMessage(chatId, msgId,
        "🐺 <b>IRENE TOKEN SCREENER</b>\n\nPilih fitur:",
        mainMenuKeyboard()
      );
      break;
    case "screen":
      if (param) await cmdScreen(chatId, param);
      else await cmdScreen(chatId);
      break;
    case "trending":
      if (param) await cmdTrending(chatId, param);
      else await cmdTrending(chatId);
      break;
    case "signals":
      if (param) await cmdSignals(chatId, param);
      else await cmdSignals(chatId);
      break;
    case "kol":
      if (param) await cmdKol(chatId, param);
      else {
        await sendMessage(chatId, "🐋 <b>KOL Trades</b>\n\nPilih chain:",
          { reply_markup: chainKeyboard("kol") }
        );
      }
      break;
    case "smartmoney":
      if (param) await cmdSmartMoney(chatId, param);
      else {
        await sendMessage(chatId, "🧠 <b>Smart Money</b>\n\nPilih chain:",
          { reply_markup: chainKeyboard("smartmoney") }
        );
      }
      break;
    case "help":
      await sendMessage(chatId,
        "📖 <b>IRENE BOT — COMMANDS</b>\n\n"
        + "/start — Main menu\n"
        + "/screen — Screen new tokens\n"
        + "/trending — Trending tokens\n"
        + "/signals — Signal alerts\n"
        + "/kol — KOL wallet trades\n"
        + "/smartmoney — Smart money trades\n"
        + "/deep <b>address chain</b> — Deep screen\n"
        + "/help — This help\n\n"
        + "💡 <i>Use inline buttons for faster navigation.</i>",
        { reply_markup: { inline_keyboard: [[{ text: "🔙 Main Menu", callback_data: "menu" }]] } }
      );
      break;
  }
}

// ── Deep Screen Handler ───────────────────────────────────────

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

  const msg = await sendMessage(chatId, `🔬 Deep screening on ${fmtChain(chain)}...`);

  try {
    const result = await screener.deepScreen(chain, address);
    const { score, info, security } = result;

    const lines = [
      `🔬 <b>DEEP SCREEN</b> — ${info?.symbol || "Unknown"}`,
      `📋 <code>${address}</code>`,
      "",
      `🏆 <b>Grade:</b> ${GRADE_EMOJI[score.grade]} ${score.grade} (${score.total}/${score.maxTotal})`,
      "",
      "📊 <b>TOKEN INFO</b>",
    ];

    if (info) {
      if (info.name) lines.push(`  Name: ${info.name}`);
      if (info.price) lines.push(`  Price: $${info.price.toFixed(8)}`);
      lines.push(`  MC: ${fmtNumber(info.market_cap)}`);
      lines.push(`  Liquidity: ${fmtNumber(info.liquidity)}`);
      if (info.holder_count) lines.push(`  Holders: ${info.holder_count}`);
      lines.push(`  Volume 24h: ${fmtNumber(info.volume_24h)}`);
    }

    lines.push("");
    lines.push("🛡️ <b>SECURITY</b>");

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
      lines.push(`\n🔴 <b>FLAGS:</b>`);
      score.flags.forEach(f => lines.push(`  • ${f}`));
    }

    await sendMessage(chatId, lines.join("\n"));
  } catch (e) {
    await sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

// ── Main Polling Loop ─────────────────────────────────────────

async function main() {
  console.log("🐺 Irene Telegram Bot starting...");
  console.log(`Token: ${TELEGRAM_TOKEN.slice(0, 8)}...`);

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
          else if (text.startsWith("/deep")) await cmdDeep(chatId, text);
          else if (text === "/help") {
            await sendMessage(chatId,
              "📖 <b>IRENE BOT — COMMANDS</b>\n\n"
              + "/start — Main menu\n"
              + "/screen — Screen new tokens\n"
              + "/trending — Trending tokens\n"
              + "/signals — Signal alerts\n"
              + "/kol — KOL wallet trades\n"
              + "/smartmoney — Smart money trades\n"
              + "/deep <b>address chain</b> — Deep screen\n"
              + "/help — This help",
              { reply_markup: mainMenuKeyboard() }
            );
          } else {
            await sendMessage(chatId,
              "🐺 <b>Irene Screener</b>\n\nPilih fitur di bawah:",
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
