const chalk = require('chalk');
const { table, getBorderCharacters } = require('table');
const screener = require('./screener');

function gradeColor(grade) {
  const colors = {
    A: chalk.green.bold,
    B: chalk.green,
    C: chalk.yellow,
    D: chalk.red,
    F: chalk.red.bold,
  };
  return (colors[grade] || chalk.white)(grade);
}

function flagColor(text) {
  return chalk.red.bold(`[!] ${text}`);
}

function warningColor(text) {
  return chalk.yellow(`[~] ${text}`);
}

function passColor(text) {
  return chalk.green(`[+] ${text}`);
}

function printHeader(text) {
  const border = '='.repeat(60);
  console.log(`\n${chalk.cyan.bold(border)}`);
  console.log(chalk.cyan.bold(`  ${text}`));
  console.log(chalk.cyan.bold(border));
}

function printTokenSummary(result, opts = {}) {
  const { chain, token, score, type } = result;
  const symbol = token.symbol || 'Unknown';
  const address = token.address || '';
  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'N/A';

  console.log(`\n${chalk.bold(symbol)} (${shortAddr})`);
  if (opts.fullAddress !== false) {
    console.log(`  ${chalk.gray(address)}`);
  }
  console.log(`  Chain: ${screener.formatChain(chain)}${type ? ` | Type: ${type}` : ''}`);
  console.log(`  Grade: ${gradeColor(score.grade)} (${score.total}/${score.maxTotal})`);

  const change1h = token.price_change_1h ?? token.price_change_percent1h;
  if (change1h !== undefined) {
    const change = typeof change1h === 'string' ? parseFloat(change1h) : change1h;
    const color = change >= 0 ? chalk.green : chalk.red;
    console.log(`  1h Change: ${color(`${change >= 0 ? '+' : ''}${change.toFixed(2)}%`)}`);
  }

  const volume = token.volume_24h ?? token.volume ?? 0;
  if (volume) console.log(`  Volume: ${screener.formatNumber(volume)}`);
  if (token.liquidity) console.log(`  Liquidity: ${screener.formatNumber(token.liquidity)}`);
  const mc = token.usd_market_cap ?? token.market_cap ?? 0;
  if (mc) console.log(`  MC: ${screener.formatNumber(mc)}`);
  if (token.holder_count) console.log(`  Holders: ${token.holder_count}`);
  if (token.smart_degen_count) console.log(`  Smart Money: ${token.smart_degen_count}`);
  if (token.renowned_count) console.log(`  KOLs: ${token.renowned_count}`);
  const ts = token.created_timestamp ?? token.creation_timestamp ?? token.open_timestamp;
  if (ts) console.log(`  Created: ${screener.formatTimestamp(ts)}`);

  if (score.flags.length > 0) {
    console.log(`\n  ${chalk.red.bold('RED FLAGS:')}`);
    score.flags.forEach(f => console.log(`    ${flagColor(f)}`));
  }

  if (score.warnings.length > 0) {
    console.log(`\n  ${chalk.yellow.bold('WARNINGS:')}`);
    score.warnings.forEach(w => console.log(`    ${warningColor(w)}`));
  }

  if (score.passed.length > 0) {
    console.log(`\n  ${chalk.green.bold('PASSED:')}`);
    score.passed.forEach(p => console.log(`    ${passColor(p)}`));
  }
}

function printTable(results, options = {}) {
  const minGrade = options.minGrade || 'D';
  const gradeOrder = ['A', 'B', 'C', 'D', 'F'];
  const minIndex = gradeOrder.indexOf(minGrade);

  const filtered = results.filter(r => {
    const idx = gradeOrder.indexOf(r.score.grade);
    return idx <= minIndex;
  });

  if (filtered.length === 0) {
    console.log(chalk.yellow('\nNo tokens match the filter criteria.'));
    return;
  }

  const data = [
    [
      chalk.cyan.bold('Grade'),
      chalk.cyan.bold('Symbol'),
      chalk.cyan.bold('Chain'),
      chalk.cyan.bold('Volume'),
      chalk.cyan.bold('Liquidity'),
      chalk.cyan.bold('MC'),
      chalk.cyan.bold('Smart'),
      chalk.cyan.bold('KOL'),
      chalk.cyan.bold('Rug%'),
      chalk.cyan.bold('Address'),
    ],
  ];

  filtered.forEach(r => {
    const t = r.token;
    const volume = t.volume_24h ?? t.volume ?? 0;
    const mc = t.usd_market_cap ?? t.market_cap ?? 0;
    data.push([
      gradeColor(r.score.grade),
      t.symbol || 'Unknown',
      screener.formatChain(r.chain),
      screener.formatNumber(volume),
      screener.formatNumber(t.liquidity || 0),
      screener.formatNumber(mc),
      String(t.smart_degen_count || 0),
      String(t.renowned_count || 0),
      screener.formatPercent(t.rug_ratio || 0),
      t.address || 'N/A',
    ]);
  });

  console.log(table(data, {
    border: getBorderCharacters('ramac'),
    columnDefault: { paddingLeft: 1, paddingRight: 1 },
  }));
}

function printDeepScreen(result) {
  const { chain, address, info, security, pool, smartHolders, topTraders, score } = result;

  printHeader(`DEEP SCREEN: ${info?.symbol || 'Unknown'} (${chain.toUpperCase()})`);

  console.log(`\n${chalk.bold('Address:')} ${address}`);
  console.log(`\n${chalk.bold('Grade:')} ${gradeColor(score.grade)} (${score.total}/${score.maxTotal})`);

  console.log(`\n${chalk.bold.underline('TOKEN INFO')}`);
  if (info) {
    console.log(`  Symbol: ${info.symbol || 'N/A'}`);
    console.log(`  Name: ${info.name || 'N/A'}`);
    console.log(`  Price: ${info.price ? '$' + info.price.toFixed(8) : 'N/A'}`);
    console.log(`  Market Cap: ${screener.formatNumber(info.market_cap)}`);
    console.log(`  Liquidity: ${screener.formatNumber(info.liquidity)}`);
    console.log(`  Holders: ${info.holder_count || 'N/A'}`);
    console.log(`  Volume 24h: ${screener.formatNumber(info.volume_24h)}`);
    if (info.price_change_1h !== undefined) {
      const c = info.price_change_1h;
      console.log(`  1h Change: ${c >= 0 ? chalk.green('+') : chalk.red('')}${c.toFixed(2)}%`);
    }
    if (info.price_change_24h !== undefined) {
      const c = info.price_change_24h;
      console.log(`  24h Change: ${c >= 0 ? chalk.green('+') : chalk.red('')}${c.toFixed(2)}%`);
    }
    if (info.link) {
      const links = [];
      if (info.link.website) links.push(`Web: ${info.link.website}`);
      if (info.link.twitter_username) links.push(`Twitter: @${info.link.twitter_username}`);
      if (info.link.telegram) links.push(`Telegram: ${info.link.telegram}`);
      if (links.length > 0) console.log(`  Socials: ${links.join(' | ')}`);
      else console.log(`  Socials: ${chalk.yellow('None found')}`);
    }
    if (info.wallet_tags_stat) {
      const stats = info.wallet_tags_stat;
      if (stats.smart_wallets) console.log(`  Smart Wallets: ${stats.smart_wallets}`);
      if (stats.renowned_wallets) console.log(`  Renowned Wallets: ${stats.renowned_wallets}`);
    }
  }

  console.log(`\n${chalk.bold.underline('SECURITY')}`);
  if (security) {
    if (chain !== 'sol') {
      const hp = security.is_honeypot;
      console.log(`  Honeypot: ${hp === 'yes' ? chalk.red.bold('YES - DANGER') : hp === 'no' ? chalk.green('No') : chalk.yellow('Unknown')}`);
    }
    console.log(`  Open Source: ${security.open_source === 'yes' ? chalk.green('Yes') : security.open_source === 'no' ? chalk.red('No') : chalk.yellow('Unknown')}`);
    if (chain === 'sol') {
      console.log(`  Mint Renounced: ${security.renounced_mint === true ? chalk.green('Yes') : chalk.red('No')}`);
      console.log(`  Freeze Renounced: ${security.renounced_freeze_account === true ? chalk.green('Yes') : chalk.red('No')}`);
    } else {
      console.log(`  Owner Renounced: ${security.owner_renounced === 'yes' ? chalk.green('Yes') : security.owner_renounced === 'no' ? chalk.red('No') : chalk.yellow('Unknown')}`);
    }
    console.log(`  Buy Tax: ${screener.formatPercent(security.buy_tax)}`);
    console.log(`  Sell Tax: ${screener.formatPercent(security.sell_tax)}`);
    console.log(`  Top 10 Holder Rate: ${screener.formatPercent(security.top_10_holder_rate)}`);
    console.log(`  Rug Ratio: ${screener.formatPercent(security.rug_ratio)}`);
    console.log(`  Creator Status: ${security.creator_token_status || 'N/A'}`);
    console.log(`  Sniper Count: ${security.sniper_count || 0}`);
  }

  console.log(`\n${chalk.bold.underline('LIQUIDITY POOL')}`);
  if (pool && pool.length > 0) {
    pool.forEach(p => {
      console.log(`  DEX: ${p.exchange || 'N/A'}`);
      console.log(`  Liquidity: ${screener.formatNumber(p.liquidity)}`);
      console.log(`  Created: ${screener.formatTimestamp(p.creation_timestamp)}`);
      console.log(`  Base Token: ${p.base_token_symbol || 'N/A'}`);
      console.log(`  Quote Token: ${p.quote_token_symbol || 'N/A'}`);
      console.log('');
    });
  } else {
    console.log('  No pool data available');
  }

  console.log(`${chalk.bold.underline('SMART MONEY HOLDERS')}`);
  if (smartHolders && smartHolders.length > 0) {
    smartHolders.forEach((h, i) => {
      console.log(`  ${i + 1}. ${h.address?.slice(0, 8)}... | Buy: ${screener.formatNumber(h.buy_cost || 0)} | Unrealized PnL: ${screener.formatNumber(h.unrealized_profit || 0)}`);
    });
  } else {
    console.log('  No smart money holders found');
  }

  console.log(`\n${chalk.bold.underline('TOP TRADERS (by Profit)')}`);
  if (topTraders && topTraders.length > 0) {
    topTraders.forEach((t, i) => {
      const profitColor = t.realized_profit >= 0 ? chalk.green : chalk.red;
      console.log(`  ${i + 1}. ${t.address?.slice(0, 8)}... | Realized: ${profitColor(screener.formatNumber(t.realized_profit || 0))} | Buys: ${t.buy_count || 0} | Sells: ${t.sell_count || 0}`);
    });
  } else {
    console.log('  No trader data available');
  }

  console.log(`\n${chalk.bold.underline('SCREENING SCORE')}`);
  if (score.flags.length > 0) {
    console.log(`\n  ${chalk.red.bold('RED FLAGS:')}`);
    score.flags.forEach(f => console.log(`    ${flagColor(f)}`));
  }
  if (score.warnings.length > 0) {
    console.log(`\n  ${chalk.yellow.bold('WARNINGS:')}`);
    score.warnings.forEach(w => console.log(`    ${warningColor(w)}`));
  }
  if (score.passed.length > 0) {
    console.log(`\n  ${chalk.green.bold('PASSED:')}`);
    score.passed.forEach(p => console.log(`    ${passColor(p)}`));
  }

  console.log(`\n${'='.repeat(60)}\n`);
}

const SIGNAL_NAMES = {
  1: 'Price Spike (K-line)',
  2: 'Dex Ad',
  3: 'Dex Link Updated',
  4: 'Dex Trending',
  5: 'Dex Boost',
  6: 'Price Spike',
  7: 'All-Time High',
  8: 'MC Key Level',
  9: 'Live Stream',
  10: 'Bundler Sell',
  11: 'Community Takeover',
  12: 'Smart Money Buy',
  13: 'Platform Call',
  14: 'Large Buy',
  15: 'Multiple Buys',
  16: 'Multiple Large Buys',
  17: 'Bags Claim',
  18: 'Pump Claim',
};

function formatTimestampAgo(ts) {
  if (!ts) return 'N/A';
  const tsMs = ts > 1e12 ? ts : ts * 1000;
  const date = new Date(tsMs);
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h ago`;
}

function printSignals(signals, chain) {
  printHeader(`CERBERUS - SIGNAL ALERTS (${screener.formatChain(chain)})`);

  if (!signals || signals.length === 0) {
    console.log(chalk.yellow('\nNo signals found.'));
    return;
  }

  console.log(chalk.green(`\nFound ${signals.length} signal(s):\n`));

  signals.forEach(s => {
    const tokenAddr = s.token_address || '';
    const shortAddr = tokenAddr ? `${tokenAddr.slice(0, 6)}...${tokenAddr.slice(-4)}` : 'N/A';
    const sigName = SIGNAL_NAMES[s.signal_type] || `Signal #${s.signal_type}`;
    const mc = s.trigger_mc || s.market_cap || 0;
    const curData = s.cur_data || {};

    let sigColor = chalk.white;
    if ([6, 7, 8].includes(s.signal_type)) sigColor = chalk.magenta;
    else if (s.signal_type === 12) sigColor = chalk.green;
    else if ([14, 15, 16].includes(s.signal_type)) sigColor = chalk.yellow;
    else if (s.signal_type === 10) sigColor = chalk.red;
    else if (s.signal_type === 11) sigColor = chalk.cyan;

    console.log(`  ${sigColor.bold(sigName)}`);
    console.log(`  Token: ${chalk.bold(s.token_symbol || shortAddr)} (${tokenAddr})`);
    console.log(`  Time: ${formatTimestampAgo(s.trigger_at)}`);
    console.log(`  Trigger MC: ${screener.formatNumber(mc)}`);
    if (s.market_cap && s.market_cap !== mc) {
      console.log(`  Current MC: ${screener.formatNumber(s.market_cap)}`);
    }
    if (s.ath) {
      console.log(`  ATH MC: ${screener.formatNumber(s.ath)}`);
    }
    if (s.signal_times > 1) {
      console.log(`  Signal Count: ${s.signal_times}x`);
    }
    if (curData.holder_count) {
      console.log(`  Holders: ${curData.holder_count}`);
    }
    if (curData.liquidity) {
      console.log(`  Liquidity: ${screener.formatNumber(curData.liquidity)}`);
    }
    if (curData.top_10_holder_rate !== undefined) {
      console.log(`  Top 10 Holders: ${screener.formatPercent(curData.top_10_holder_rate)}`);
    }
    console.log(chalk.gray('  ' + '-'.repeat(40)));
  });
}

function printSmartMoney(trades, type) {
  const label = type === 'kol' ? 'KOL' : type === 'smartmoney' ? 'Smart Money' : 'Followed Wallet';
  printHeader(`CERBERUS - ${label.toUpperCase()} TRACKER`);

  if (!trades || trades.length === 0) {
    console.log(chalk.yellow('\nNo trades found.'));
    return;
  }

  const byToken = {};
  trades.forEach(t => {
    const addr = t.base_address || 'unknown';
    if (!byToken[addr]) {
      byToken[addr] = {
        symbol: t.base_token?.symbol || 'Unknown',
        trades: [],
        launchpad: t.base_token?.launchpad || '',
      };
    }
    byToken[addr].trades.push(t);
  });

  console.log(chalk.green(`\n${trades.length} trade(s) across ${Object.keys(byToken).length} token(s):\n`));

  for (const [addr, group] of Object.entries(byToken)) {
    const buys = group.trades.filter(t => t.side === 'buy');
    const sells = group.trades.filter(t => t.side === 'sell');
    const totalBuyUsd = buys.reduce((sum, t) => sum + (t.amount_usd || 0), 0);
    const totalSellUsd = sells.reduce((sum, t) => sum + (t.amount_usd || 0), 0);

    const netFlow = totalBuyUsd - totalSellUsd;
    const flowColor = netFlow >= 0 ? chalk.green : chalk.red;
    const flowIcon = netFlow >= 0 ? '▲' : '▼';

    console.log(`  ${chalk.bold(group.symbol)} (${addr.slice(0, 6)}...${addr.slice(-4)})`);
    if (group.launchpad) console.log(`  Launchpad: ${group.launchpad}`);
    console.log(`  Trades: ${chalk.green(`${buys.length} buys`)} / ${chalk.red(`${sells.length} sells`)} | Net: ${flowColor(`${flowIcon} ${screener.formatNumber(Math.abs(netFlow))}`)}`);

    group.trades.slice(0, 5).forEach(t => {
      const sideColor = t.side === 'buy' ? chalk.green : chalk.red;
      const sideLabel = t.side === 'buy' ? 'BUY' : 'SELL';
      const makerName = t.maker_info?.twitter_username ? `@${t.maker_info.twitter_username}` : `${t.maker?.slice(0, 6)}...${t.maker?.slice(-4)}`;
      const tags = t.maker_info?.tags ? t.maker_info.tags.join(', ') : '';
      const openClose = t.is_open_or_close === 1 ? (type === 'follow-wallet' ? '[FULL]' : '[CLOSE]') : '[ADD]';

      console.log(`    ${sideColor.bold(sideLabel)} ${screener.formatNumber(t.amount_usd || 0)} by ${makerName} ${chalk.gray(openClose)} ${chalk.gray(formatTimestampAgo(t.timestamp))}`);
      if (t.price_usd) console.log(`      Price: $${t.price_usd}`);
      if (t.buy_cost_usd > 0) console.log(`      Buy Cost: ${screener.formatNumber(t.buy_cost_usd)}`);
      if (tags) console.log(`      Tags: ${chalk.cyan(tags)}`);
    });

    if (group.trades.length > 5) {
      console.log(`    ${chalk.gray(`... and ${group.trades.length - 5} more trades`)}`);
    }

    const distinctMakers = new Set(group.trades.map(t => t.maker)).size;
    if (distinctMakers >= 3) {
      console.log(`  ${chalk.yellow.bold(`  ⚡ CLUSTER SIGNAL: ${distinctMakers} distinct wallets trading this token`)}`);
    }

    console.log(chalk.gray('  ' + '-'.repeat(40)));
  }
}

module.exports = {
  gradeColor,
  printHeader,
  printTokenSummary,
  printTable,
  printDeepScreen,
  printSignals,
  printSmartMoney,
};
