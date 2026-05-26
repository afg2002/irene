const gmgn = require('./gmgn');
const config = require('./config');

const CHAIN_NAMES = {
  sol: 'Solana',
  bsc: 'BNB Chain',
  base: 'Base',
  eth: 'Ethereum',
};

function formatChain(chain) {
  return CHAIN_NAMES[chain] || chain;
}

function formatNumber(num) {
  if (num === undefined || num === null) return 'N/A';
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return 'N/A';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPercent(rate) {
  if (rate === undefined || rate === null) return 'N/A';
  const n = typeof rate === 'string' ? parseFloat(rate) : rate;
  if (isNaN(n)) return 'N/A';
  return `${(n * 100).toFixed(1)}%`;
}

function formatTimestamp(ts) {
  if (!ts) return 'N/A';
  const tsMs = ts > 1e12 ? ts : ts * 1000;
  const date = new Date(tsMs);
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function extractTokensFromTrenches(data) {
  const tokens = [];
  if (!data) return tokens;
  for (const [type, items] of Object.entries(data)) {
    if (Array.isArray(items)) {
      for (const item of items) {
        tokens.push({ type, ...item });
      }
    }
  }
  return tokens;
}

async function screenTrenches(chain, options = {}) {
  const results = [];

  try {
    const data = await gmgn.getTrenches(chain, null, {
      filterPreset: options.filterPreset,
      minVolume24h: options.minVolume24h,
      maxRugRatio: options.maxRugRatio,
      maxBundlerRate: options.maxBundlerRate,
      maxInsiderRatio: options.maxInsiderRatio,
      minSmartDegenCount: options.minSmartDegenCount,
      limit: options.limit,
    });

    const tokens = extractTokensFromTrenches(data);

    for (const token of tokens) {
      const score = await scoreToken(chain, token);
      results.push({
        chain,
        type: token.type,
        token,
        score,
      });
    }

    await gmgn.sleep(config.GMGN_REQUEST_DELAY_MS);
  } catch (err) {
    console.error(`Error fetching trenches on ${chain}: ${err.message}`);
  }

  return results.sort((a, b) => b.score.total - a.score.total);
}

async function screenTrending(chain, options = {}) {
  const results = [];

  try {
    const data = await gmgn.getTrending(chain, {
      interval: options.interval,
      limit: options.limit,
      orderBy: options.orderBy,
    });

    const tokens = data?.rank || data?.tokens || (Array.isArray(data) ? data : []);

    for (const token of tokens) {
      const score = await scoreToken(chain, token);
      results.push({
        chain,
        token,
        score,
      });
    }

    await gmgn.sleep(config.GMGN_REQUEST_DELAY_MS);
  } catch (err) {
    console.error(`Error fetching trending on ${chain}: ${err.message}`);
  }

  return results.sort((a, b) => b.score.total - a.score.total);
}

async function scoreToken(chain, token) {
  const score = {
    total: 0,
    maxTotal: 100,
    flags: [],
    warnings: [],
    passed: [],
    grade: 'N/A',
  };

  const address = token.address;
  if (!address) return score;

  let security = null;
  if (token.is_honeypot !== undefined) {
    security = {
      is_honeypot: token.is_honeypot === true || token.is_honeypot === 1 || token.is_honeypot === 'yes' ? true : false,
      open_source: token.is_open_source === true || token.is_open_source === 1 || token.is_open_source === 'yes' ? true : token.is_open_source === false || token.is_open_source === 0 || token.is_open_source === 'no' ? false : null,
      owner_renounced: token.is_renounced === true || token.is_renounced === 1 || token.is_renounced === 'yes' ? true : token.is_renounced === false || token.is_renounced === 0 || token.is_renounced === 'no' ? false : null,
      renounced_mint: token.renounced_mint,
      renounced_freeze_account: token.renounced_freeze_account,
      buy_tax: parseFloat(token.buy_tax || 0),
      sell_tax: parseFloat(token.sell_tax || 0),
      top_10_holder_rate: token.top_10_holder_rate || 0,
      rug_ratio: token.rug_ratio ?? 0,
      creator_token_status: token.creator_token_status,
      sniper_count: token.sniper_count || 0,
    };
  } else {
    try {
      const secData = await gmgn.getTokenSecurity(chain, address);
      security = secData || {};
      await gmgn.sleep(config.GMGN_REQUEST_DELAY_MS);
    } catch (err) {
      score.warnings.push(`Security check failed: ${err.message}`);
    }
  }

  let info = null;
  if (!security || security.open_source === null) {
    try {
      const infoData = await gmgn.getTokenInfo(chain, address);
      info = infoData || {};
      if (!security) await gmgn.sleep(config.GMGN_REQUEST_DELAY_MS);
    } catch (err) {
      score.warnings.push(`Info check failed: ${err.message}`);
    }
  }

  if (security) {
    const isHoneypot = security.is_honeypot === true || security.is_honeypot === 1 || security.is_honeypot === 'yes';
    if (chain !== 'sol' && isHoneypot) {
      score.flags.push('HONEYPOT DETECTED');
      score.total = 0;
      score.grade = 'F';
      return score;
    }

    const isOpenSource = security.open_source === true || security.open_source === 1 || security.open_source === 'yes';
    const isNotOpenSource = security.open_source === false || security.open_source === 0 || security.open_source === 'no';
    if (isNotOpenSource) {
      score.flags.push('Contract not open source');
      score.total -= 20;
    } else if (isOpenSource) {
      score.passed.push('Contract open source');
      score.total += 5;
    }

    if (chain === 'sol') {
      if (security.renounced_mint === false) {
        score.flags.push('Mint not renounced (SOL)');
        score.total -= 15;
      } else if (security.renounced_mint === true) {
        score.passed.push('Mint renounced (SOL)');
        score.total += 5;
      }

      if (security.renounced_freeze_account === false) {
        score.flags.push('Freeze account not renounced (SOL)');
        score.total -= 15;
      } else if (security.renounced_freeze_account === true) {
        score.passed.push('Freeze account renounced (SOL)');
        score.total += 5;
      }
    }

    const isRenounced = security.owner_renounced === true || security.owner_renounced === 1 || security.owner_renounced === 'yes';
    const isNotRenounced = security.owner_renounced === false || security.owner_renounced === 0 || security.owner_renounced === 'no';
    if (chain !== 'sol' && isNotRenounced) {
      score.warnings.push('Owner not renounced');
      score.total -= 10;
    } else if (isRenounced) {
      score.passed.push('Owner renounced');
      score.total += 10;
    }

    const buyTax = security.buy_tax || 0;
    const sellTax = security.sell_tax || 0;
    if (sellTax > 0.1) {
      score.flags.push(`High sell tax: ${formatPercent(sellTax)}`);
      score.total -= 20;
    } else if (sellTax > 0.05) {
      score.warnings.push(`Medium sell tax: ${formatPercent(sellTax)}`);
      score.total -= 5;
    } else if (sellTax === 0) {
      score.passed.push('Zero sell tax');
      score.total += 10;
    }

    if (buyTax > 0.1) {
      score.warnings.push(`High buy tax: ${formatPercent(buyTax)}`);
      score.total -= 5;
    }

    const top10Rate = security.top_10_holder_rate || 0;
    if (top10Rate > 0.5) {
      score.flags.push(`Top 10 holders too concentrated: ${formatPercent(top10Rate)}`);
      score.total -= 15;
    } else if (top10Rate > 0.2) {
      score.warnings.push(`Top 10 holders moderate: ${formatPercent(top10Rate)}`);
      score.total -= 5;
    } else {
      score.passed.push(`Good holder distribution: ${formatPercent(top10Rate)}`);
      score.total += 10;
    }

    const rugRatio = security.rug_ratio ?? token.rug_ratio ?? 0;
    if (rugRatio > 0.3) {
      score.flags.push(`High rug ratio: ${formatPercent(rugRatio)}`);
      score.total -= 20;
    } else if (rugRatio > 0.1) {
      score.warnings.push(`Medium rug ratio: ${formatPercent(rugRatio)}`);
      score.total -= 5;
    } else {
      score.passed.push(`Low rug ratio: ${formatPercent(rugRatio)}`);
      score.total += 10;
    }

    if (security.creator_token_status === 'creator_hold') {
      score.warnings.push('Creator still holding tokens');
      score.total -= 5;
    } else if (security.creator_token_status === 'creator_close') {
      score.passed.push('Creator closed position');
      score.total += 5;
    }

    const sniperCount = security.sniper_count || 0;
    if (sniperCount > 20) {
      score.warnings.push(`High sniper count: ${sniperCount}`);
      score.total -= 5;
    } else if (sniperCount < 5) {
      score.passed.push(`Low sniper count: ${sniperCount}`);
      score.total += 5;
    }
  }

  const rugRatio = token.rug_ratio ?? 0;
  if (rugRatio > 0.3) {
    if (!score.flags.some(f => f.includes('rug ratio'))) {
      score.flags.push(`High rug ratio: ${formatPercent(rugRatio)}`);
      score.total -= 10;
    }
  }

  if (token.is_wash_trading === true) {
    score.flags.push('Wash trading detected');
    score.total -= 15;
  }

  const bundlerRate = token.bundler_rate ?? 0;
  if (bundlerRate > 0.3) {
    score.flags.push(`High bundler rate: ${formatPercent(bundlerRate)}`);
    score.total -= 10;
  }

  const insiderRatio = token.rat_trader_amount_rate ?? 0;
  if (insiderRatio > 0.3) {
    score.flags.push(`High rat trader ratio: ${formatPercent(insiderRatio)}`);
    score.total -= 10;
  }

  const smartDegenCount = token.smart_degen_count ?? 0;
  if (smartDegenCount >= 3) {
    score.passed.push(`Strong smart money interest: ${smartDegenCount} wallets`);
    score.total += 15;
  } else if (smartDegenCount >= 1) {
    score.passed.push(`Smart money present: ${smartDegenCount} wallets`);
    score.total += 10;
  }

  const renownedCount = token.renowned_count ?? 0;
  if (renownedCount >= 1) {
    score.passed.push(`KOL interest: ${renownedCount} wallets`);
    score.total += 10;
  }

  const volume = token.volume_24h ?? token.volume ?? 0;
  const volumeNum = typeof volume === 'string' ? parseFloat(volume) : volume;
  if (volumeNum >= 50000) {
    score.passed.push(`Strong volume: ${formatNumber(volumeNum)}`);
    score.total += 10;
  } else if (volumeNum >= 10000) {
    score.passed.push(`Good volume: ${formatNumber(volumeNum)}`);
    score.total += 5;
  } else if (volumeNum < 1000) {
    score.warnings.push(`Low volume: ${formatNumber(volumeNum)}`);
    score.total -= 5;
  }

  const liquidity = token.liquidity ?? info?.liquidity ?? 0;
  const liqNum = typeof liquidity === 'string' ? parseFloat(liquidity) : liquidity;
  if (liqNum >= 50000) {
    score.passed.push(`Strong liquidity: ${formatNumber(liqNum)}`);
    score.total += 10;
  } else if (liqNum >= 10000) {
    score.passed.push(`Good liquidity: ${formatNumber(liqNum)}`);
    score.total += 5;
  } else if (liqNum < 5000) {
    score.warnings.push(`Low liquidity: ${formatNumber(liqNum)}`);
    score.total -= 10;
  }

  const holderCount = token.holder_count ?? info?.holder_count ?? 0;
  if (holderCount >= 100) {
    score.passed.push(`Good holder count: ${holderCount}`);
    score.total += 5;
  }

  if (info?.link) {
    const links = info.link;
    const hasSocial = links.website || links.twitter_username || links.telegram;
    if (hasSocial) {
      score.passed.push('Has social links');
      score.total += 5;
    } else {
      score.warnings.push('No social links found');
      score.total -= 5;
    }
  }

  score.total = Math.max(0, Math.min(100, score.total));

  if (score.flags.length > 0) {
    score.grade = 'F';
  } else if (score.total >= 80) {
    score.grade = 'A';
  } else if (score.total >= 60) {
    score.grade = 'B';
  } else if (score.total >= 40) {
    score.grade = 'C';
  } else if (score.total >= 20) {
    score.grade = 'D';
  } else {
    score.grade = 'F';
  }

  return score;
}

async function deepScreen(chain, address) {
  const result = {
    chain,
    address,
    info: null,
    security: null,
    pool: null,
    smartHolders: null,
    topTraders: null,
    score: null,
  };

  try {
    result.info = await gmgn.getTokenInfo(chain, address);
    await gmgn.sleep(config.GMGN_REQUEST_DELAY_MS);
  } catch (err) {
    console.error(`Info fetch failed: ${err.message}`);
  }

  try {
    result.security = await gmgn.getTokenSecurity(chain, address);
    await gmgn.sleep(config.GMGN_REQUEST_DELAY_MS);
  } catch (err) {
    console.error(`Security fetch failed: ${err.message}`);
  }

  try {
    result.pool = await gmgn.getTokenPool(chain, address);
    await gmgn.sleep(config.GMGN_REQUEST_DELAY_MS);
  } catch (err) {
    console.error(`Pool fetch failed: ${err.message}`);
  }

  try {
    const holdersData = await gmgn.getTokenHolders(chain, address, {
      tag: 'smart_degen',
      limit: 10,
    });
    result.smartHolders = holdersData?.holders || [];
    await gmgn.sleep(config.GMGN_REQUEST_DELAY_MS);
  } catch (err) {
    console.error(`Holders fetch failed: ${err.message}`);
  }

  try {
    const tradersData = await gmgn.getTokenTraders(chain, address, {
      limit: 10,
      orderBy: 'profit',
    });
    result.topTraders = tradersData?.traders || [];
  } catch (err) {
    console.error(`Traders fetch failed: ${err.message}`);
  }

  result.score = await scoreToken(chain, {
    address,
    ...(result.info || {}),
    ...(result.security || {}),
  });

  return result;
}

module.exports = {
  formatChain,
  formatNumber,
  formatPercent,
  formatTimestamp,
  screenTrenches,
  screenTrending,
  scoreToken,
  deepScreen,
};
