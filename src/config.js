require('dotenv').config();

module.exports = {
  GMGN_API_KEY: process.env.GMGN_API_KEY || '',
  GMGN_REQUEST_DELAY_MS: parseInt(process.env.GMGN_REQUEST_DELAY_MS || '2500', 10),
  SCREEN_CHAINS: (process.env.SCREEN_CHAINS || 'bsc,base').split(',').map(c => c.trim()),
  SCREEN_LIMIT: parseInt(process.env.SCREEN_LIMIT || '20', 10),
  SCREEN_FILTER_PRESET: process.env.SCREEN_FILTER_PRESET || 'safe',
  MIN_VOLUME_24H: parseFloat(process.env.MIN_VOLUME_24H || '1000'),
  MAX_RUG_RATIO: parseFloat(process.env.MAX_RUG_RATIO || '0.3'),
  MAX_BUNDLER_RATE: parseFloat(process.env.MAX_BUNDLER_RATE || '0.3'),
  MAX_INSIDER_RATIO: parseFloat(process.env.MAX_INSIDER_RATIO || '0.3'),
  MIN_SMART_DEGEN_COUNT: parseInt(process.env.MIN_SMART_DEGEN_COUNT || '1', 10),
  GMGN_API_BASE: 'https://openapi.gmgn.ai',
};
