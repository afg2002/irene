const fetch = require('node-fetch');
const crypto = require('crypto');
const config = require('./config');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const TRENCHES_PLATFORMS = {
  sol: ['Pump.fun', 'pump_mayhem', 'pump_mayhem_agent', 'pump_agent', 'letsbonk', 'bonkers', 'bags', 'memoo', 'liquid', 'bankr', 'zora', 'surge', 'anoncoin', 'moonshot_app', 'wendotdev', 'heaven', 'sugar', 'token_mill', 'believe', 'trendsfun', 'trends_fun', 'jup_studio', 'Moonshot', 'boop', 'ray_launchpad', 'meteora_virtual_curve', 'xstocks'],
  bsc: ['fourmeme', 'fourmeme_agent', 'bn_fourmeme', 'four_xmode_agent', 'flap', 'clanker', 'lunafun'],
  base: ['clanker', 'bankr', 'flaunch', 'zora', 'zora_creator', 'baseapp', 'basememe', 'virtuals_v2', 'klik'],
};

const TRENCHES_QUOTE_ADDRESS_TYPES = {
  sol: [4, 5, 3, 1, 13, 0],
  bsc: [6, 7, 1, 16, 8, 3, 9, 10, 2, 17, 18, 0],
  base: [11, 3, 12, 13, 0],
};

function buildAuthQuery() {
  return {
    timestamp: Math.floor(Date.now() / 1000),
    client_id: crypto.randomUUID(),
  };
}

function buildUrl(base, query) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, item);
    } else {
      params.set(k, String(v));
    }
  }
  return `${base}?${params.toString()}`;
}

async function gmgnFetch(method, subPath, queryExtra = {}, body = null) {
  if (!config.GMGN_API_KEY) {
    throw new Error('GMGN_API_KEY is not set. Copy .env.example to .env and add your API key.');
  }

  const { timestamp, client_id } = buildAuthQuery();
  const query = { ...queryExtra, timestamp, client_id };
  const url = buildUrl(`${config.GMGN_API_BASE}${subPath}`, query);

  const headers = {
    'X-APIKEY': config.GMGN_API_KEY,
    'Content-Type': 'application/json',
  };

  const bodyStr = body !== null ? JSON.stringify(body) : null;

  const res = await fetch(url, {
    method,
    headers,
    body: bodyStr ?? undefined,
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('x-ratelimit-reset') || '5', 10);
    const waitMs = Math.max(retryAfter * 1000 - Date.now(), 0) + 1000;
    console.error(`Rate limited. Waiting ${Math.ceil(waitMs / 1000)}s...`);
    await sleep(waitMs);
    return gmgnFetch(method, subPath, queryExtra, body);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GMGN API error ${res.status}: ${text}`);
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`GMGN API non-JSON response: ${text.slice(0, 200)}`);
  }

  if (json.code !== 0) {
    throw new Error(`GMGN API error code=${json.code} error=${json.error || 'unknown'} message=${json.message || ''}`);
  }

  let result = json.data;
  if (result && result.code === 0 && result.data !== undefined) {
    result = result.data;
  }
  return result;
}

function buildTrenchesBody(chain, types, options = {}) {
  const selectedTypes = types && types.length ? types : ['new_creation', 'near_completion', 'completed'];
  const launchpad_platform = options.platforms || (TRENCHES_PLATFORMS[chain] || []);
  const quote_address_type = TRENCHES_QUOTE_ADDRESS_TYPES[chain] || [];
  const limit = options.limit || config.SCREEN_LIMIT;

  const filters = options.filters || ['offchain', 'onchain'];

  const section = {
    filters,
    launchpad_platform,
    quote_address_type,
    launchpad_platform_v2: true,
    limit,
  };

  if (options.maxRugRatio !== undefined) section.max_rug_ratio = options.maxRugRatio;
  if (options.maxBundlerRate !== undefined) section.max_bundler_rate = options.maxBundlerRate;
  if (options.maxInsiderRatio !== undefined) section.max_rat_trader_amount_rate = options.maxInsiderRatio;
  if (options.minSmartDegenCount !== undefined) section.min_smart_degen_count = options.minSmartDegenCount;
  if (options.minVolume24h !== undefined) section.min_volume_24h = options.minVolume24h;
  if (options.filterPreset) section.filter_preset = options.filterPreset;
  if (options.sortBy) section.sort_by = options.sortBy;

  const body = { version: 'v2' };
  for (const type of selectedTypes) {
    body[type] = { ...section };
  }
  return body;
}

async function getTrenches(chain, types = null, options = {}) {
  const selectedTypes = types || ['new_creation', 'near_completion', 'completed'];
  const body = buildTrenchesBody(chain, selectedTypes, options);
  return gmgnFetch('POST', '/v1/trenches', { chain }, body);
}

async function getTrending(chain, options = {}) {
  return gmgnFetch('GET', '/v1/market/rank', {
    chain,
    interval: options.interval || '1h',
    order_by: options.orderBy || 'volume',
    limit: options.limit || config.SCREEN_LIMIT,
  });
}

async function getTokenInfo(chain, address) {
  return gmgnFetch('GET', '/v1/token/info', { chain, address });
}

async function getTokenSecurity(chain, address) {
  return gmgnFetch('GET', '/v1/token/security', { chain, address });
}

async function getTokenPool(chain, address) {
  return gmgnFetch('GET', '/v1/token/pool_info', { chain, address });
}

async function getTokenHolders(chain, address, options = {}) {
  return gmgnFetch('GET', '/v1/market/token_top_holders', {
    chain,
    address,
    tag: options.tag || '',
    order_by: options.orderBy || 'buy_volume_cur',
    direction: options.direction || 'desc',
    limit: options.limit || 20,
  });
}

async function getTokenTraders(chain, address, options = {}) {
  return gmgnFetch('GET', '/v1/market/token_top_traders', {
    chain,
    address,
    tag: options.tag || '',
    order_by: options.orderBy || 'profit',
    direction: options.direction || 'desc',
    limit: options.limit || 20,
  });
}

async function getMarketKline(chain, address, options = {}) {
  return gmgnFetch('GET', '/v1/market/token_kline', {
    chain,
    address,
    resolution: options.interval || '5m',
    limit: options.limit || 50,
  });
}

async function getKol(chain, limit = 100) {
  return gmgnFetch('GET', '/v1/user/kol', { chain, limit });
}

async function getSmartMoney(chain, limit = 100) {
  return gmgnFetch('GET', '/v1/user/smartmoney', { chain, limit });
}

async function getFollowWallet(chain, options = {}) {
  return gmgnFetch('GET', '/v1/trade/follow_wallet', {
    chain,
    wallet_address: options.wallet || '',
    limit: options.limit || 10,
    side: options.side || '',
    min_amount_usd: options.minAmountUsd || 0,
    max_amount_usd: options.maxAmountUsd || 0,
  });
}

async function getSignals(chain, options = {}) {
  const signalTypes = options.signalTypes || [];
  const filteredTypes = signalTypes.length > 0 ? signalTypes.filter(t => ![14, 15, 16].includes(t)) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17, 18];
  const group = { signal_type: filteredTypes };
  if (options.mcMin) group.mc_min = options.mcMin;
  if (options.mcMax) group.mc_max = options.mcMax;
  if (options.triggerMcMin) group.trigger_mc_min = options.triggerMcMin;
  if (options.triggerMcMax) group.trigger_mc_max = options.triggerMcMax;
  if (options.totalFeeMin) group.total_fee_min = options.totalFeeMin;
  if (options.totalFeeMax) group.total_fee_max = options.totalFeeMax;
  if (options.minCreateOrOpenTs) group.min_create_or_open_ts = options.minCreateOrOpenTs;
  if (options.maxCreateOrOpenTs) group.max_create_or_open_ts = options.maxCreateOrOpenTs;

  const groups = options.groups || [group];

  return gmgnFetch('POST', '/v1/market/token_signal', {}, { chain, groups });
}

module.exports = {
  sleep,
  gmgnFetch,
  getTrenches,
  getTrending,
  getTokenInfo,
  getTokenSecurity,
  getTokenPool,
  getTokenHolders,
  getTokenTraders,
  getMarketKline,
  getKol,
  getSmartMoney,
  getFollowWallet,
  getSignals,
};
