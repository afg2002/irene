#!/usr/bin/env node

require('dotenv').config();

const { Command } = require('commander');
const chalk = require('chalk');
const config = require('./config');
const screener = require('./screener');
const formatter = require('./formatter');

const program = new Command();

program
  .name('cerberus')
  .description('Multi-chain token screening CLI powered by GMGN API')
  .version('1.0.0');

program.command('screen')
  .description('Screen new tokens from trenches across chains')
  .option('-c, --chain <chain>', 'Chain to screen (bsc, base, sol, eth)', null)
  .option('-t, --type <type>', 'Trench type: new_creation, near_completion, completed', 'new_creation')
  .option('-l, --limit <limit>', 'Max tokens per chain', parseInt)
  .option('--filter-preset <preset>', 'Filter preset: safe, strict', null)
  .option('--min-volume <amount>', 'Min 24h volume', parseFloat)
  .option('--max-rug <ratio>', 'Max rug ratio', parseFloat)
  .option('--min-smart <count>', 'Min smart money count', parseInt)
  .option('--table', 'Show results as table', false)
  .option('--min-grade <grade>', 'Minimum grade to show (A, B, C, D, F)', 'D')
  .option('--no-address', 'Hide full address line')
  .action(async (opts) => {
    formatter.printHeader('CERBERUS - TOKEN SCREENER');

    const chains = opts.chain ? [opts.chain] : config.SCREEN_CHAINS;
    const allResults = [];

    for (const chain of chains) {
      console.log(chalk.cyan(`\nScanning ${screener.formatChain(chain)} trenches...`));

      const results = await screener.screenTrenches(chain, {
        filterPreset: opts.filterPreset,
        minVolume24h: opts.minVolume,
        maxRugRatio: opts.maxRug,
        minSmartDegenCount: opts.minSmart,
        limit: opts.limit,
      });

      allResults.push(...results);
    }

    if (opts.table) {
      formatter.printTable(allResults, { minGrade: opts.minGrade });
    } else {
      const passed = allResults.filter(r => {
        const gradeOrder = ['A', 'B', 'C', 'D', 'F'];
        return gradeOrder.indexOf(r.score.grade) <= gradeOrder.indexOf(opts.minGrade);
      });

      if (passed.length === 0) {
        console.log(chalk.yellow('\nNo tokens passed the screening criteria.'));
      } else {
        console.log(chalk.green(`\nFound ${passed.length} token(s) passing screening:\n`));
        for (const result of passed) {
          formatter.printTokenSummary(result, { fullAddress: opts.address !== false });
          console.log(chalk.gray('-'.repeat(40)));
        }
      }
    }

    console.log(chalk.gray(`\nScreened ${allResults.length} tokens across ${chains.length} chain(s).`));
  });

program.command('trending')
  .description('Screen trending tokens on a chain')
  .option('-c, --chain <chain>', 'Chain (bsc, base, sol, eth)', 'bsc')
  .option('-i, --interval <interval>', 'Time interval: 1m, 5m, 1h, 6h, 24h', '1h')
  .option('-l, --limit <limit>', 'Max tokens', parseInt)
  .option('--order-by <field>', 'Sort by: volume, smart_degen_count, market_cap, price_change', 'volume')
  .option('--table', 'Show results as table', false)
  .option('--min-grade <grade>', 'Minimum grade to show (A, B, C, D, F)', 'D')
  .option('--no-address', 'Hide full address line')
  .action(async (opts) => {
    formatter.printHeader('CERBERUS - TRENDING TOKENS');

    console.log(chalk.cyan(`\nFetching trending on ${screener.formatChain(opts.chain)} (${opts.interval})...`));

    const results = await screener.screenTrending(opts.chain, {
      interval: opts.interval,
      limit: opts.limit,
      orderBy: opts.orderBy,
    });

    if (opts.table) {
      formatter.printTable(results, { minGrade: opts.minGrade });
    } else {
      const passed = results.filter(r => {
        const gradeOrder = ['A', 'B', 'C', 'D', 'F'];
        return gradeOrder.indexOf(r.score.grade) <= gradeOrder.indexOf(opts.minGrade);
      });

      if (passed.length === 0) {
        console.log(chalk.yellow('\nNo trending tokens passed screening.'));
      } else {
        console.log(chalk.green(`\nFound ${passed.length} trending token(s) passing screening:\n`));
        for (const result of passed) {
          formatter.printTokenSummary(result, { fullAddress: opts.address !== false });
          console.log(chalk.gray('-'.repeat(40)));
        }
      }
    }
  });

program.command('deep')
  .description('Deep screen a specific token address')
  .argument('<address>', 'Token contract address')
  .option('-c, --chain <chain>', 'Chain (bsc, base, sol, eth)', 'bsc')
  .action(async (address, opts) => {
    formatter.printHeader('CERBERUS - DEEP SCREEN');
    console.log(chalk.cyan(`\nAnalyzing ${address} on ${screener.formatChain(opts.chain)}...\n`));

    const result = await screener.deepScreen(opts.chain, address);
    formatter.printDeepScreen(result);
  });

program.command('chains')
  .description('List supported chains')
  .action(() => {
    formatter.printHeader('CERBERUS - SUPPORTED CHAINS');
    console.log(`
  ${chalk.bold('Chain')}    ${chalk.bold('Code')}    ${chalk.bold('Native')}    ${chalk.bold('Quote')}
  ${chalk.gray('─'.repeat(50))}
  Solana      sol       SOL          SOL, USDC
  BNB Chain   bsc       BNB          BNB, USDC
  Base        base      ETH          ETH, USDC
  Ethereum    eth       ETH          ETH, USDC
`);
  });

program.command('signals')
  .description('Get real-time signal alerts (price spikes, smart money buys, large buys, etc.)')
  .option('-c, --chain <chain>', 'Chain (sol, bsc)', 'sol')
  .option('-t, --signal-type <type...>', 'Signal types (1-18), repeatable', (v, acc) => { acc.push(parseInt(v, 10)); return acc; }, [])
  .option('--mc-min <usd>', 'Min market cap at trigger (USD)', parseFloat)
  .option('--mc-max <usd>', 'Max market cap at trigger (USD)', parseFloat)
  .option('--trigger-mc-min <usd>', 'Min MC at signal trigger (USD)', parseFloat)
  .option('--trigger-mc-max <usd>', 'Max MC at signal trigger (USD)', parseFloat)
  .option('--groups <json>', 'Multi-group JSON override')
  .action(async (opts) => {
    const { getSignals } = require('./gmgn');
    const config = require('./config');

    formatter.printHeader('CERBERUS - SIGNAL ALERTS');

    const chain = opts.chain;
    console.log(chalk.cyan(`\nFetching signals on ${screener.formatChain(chain)}...\n`));

    try {
      const data = await getSignals(chain, {
        signalTypes: opts.signalType,
        mcMin: opts.mcMin,
        mcMax: opts.mcMax,
        triggerMcMin: opts.triggerMcMin,
        triggerMcMax: opts.triggerMcMax,
        groups: opts.groups ? JSON.parse(opts.groups) : null,
      });

      const signals = Array.isArray(data) ? data : (data?.list || data?.signals || []);
      formatter.printSignals(signals, chain);
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program.command('track')
  .description('Track on-chain activity from KOLs, smart money, or followed wallets')
  .action(() => {
    console.log(chalk.yellow('Usage:'));
    console.log(`  node src/index.js track kol [options]`);
    console.log(`  node src/index.js track smartmoney [options]`);
    console.log(`  node src/index.js track wallet [options]`);
    console.log(`\nRun 'node src/index.js track kol --help' for details.\n`);
  });

program.command('kol')
  .description('Track KOL wallet trades')
  .option('-c, --chain <chain>', 'Chain (sol, bsc, base, eth)', 'sol')
  .option('-l, --limit <n>', 'Max trades (1-200)', parseInt)
  .option('--side <side>', 'Filter: buy or sell')
  .action(async (opts) => {
    const { getKol } = require('./gmgn');

    formatter.printHeader('CERBERUS - KOL TRACKER');
    console.log(chalk.cyan(`\nFetching KOL trades on ${screener.formatChain(opts.chain)}...\n`));

    try {
      const data = await getKol(opts.chain, opts.limit || 100);
      let trades = data?.list || [];
      if (opts.side) {
        trades = trades.filter(t => t.side === opts.side);
      }
      formatter.printSmartMoney(trades, 'kol');
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program.command('smartmoney')
  .description('Track smart money wallet trades')
  .option('-c, --chain <chain>', 'Chain (sol, bsc, base)', 'sol')
  .option('-l, --limit <n>', 'Max trades (1-200)', parseInt)
  .option('--side <side>', 'Filter: buy or sell')
  .action(async (opts) => {
    const { getSmartMoney } = require('./gmgn');

    formatter.printHeader('CERBERUS - SMART MONEY TRACKER');
    console.log(chalk.cyan(`\nFetching smart money trades on ${screener.formatChain(opts.chain)}...\n`));

    try {
      const data = await getSmartMoney(opts.chain, opts.limit || 100);
      let trades = data?.list || [];
      if (opts.side) {
        trades = trades.filter(t => t.side === opts.side);
      }
      formatter.printSmartMoney(trades, 'smartmoney');
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program.command('wallet')
  .description('Track followed wallet trades (requires private key for critical auth)')
  .option('-c, --chain <chain>', 'Chain (sol, bsc, base, eth)', 'sol')
  .option('--wallet <address>', 'Filter by wallet address')
  .option('-l, --limit <n>', 'Max trades (1-100)', parseInt)
  .option('--side <side>', 'Filter: buy or sell')
  .option('--min-usd <n>', 'Min trade amount (USD)', parseFloat)
  .option('--max-usd <n>', 'Max trade amount (USD)', parseFloat)
  .action(async (opts) => {
    const { getFollowWallet } = require('./gmgn');

    formatter.printHeader('CERBERUS - WALLET TRACKER');
    console.log(chalk.cyan(`\nFetching followed wallet trades on ${screener.formatChain(opts.chain)}...\n`));

    try {
      const data = await getFollowWallet(opts.chain, {
        wallet: opts.wallet,
        limit: opts.limit || 10,
        side: opts.side,
        minAmountUsd: opts.minUsd,
        maxAmountUsd: opts.maxUsd,
      });
      const trades = data?.list || [];
      formatter.printSmartMoney(trades, 'follow-wallet');
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program.parse(process.argv);
