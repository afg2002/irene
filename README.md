# irene

Multi-chain token screening CLI powered by GMGN API. Screen, score, and track tokens across Base, BSC, Solana, and Ethereum — straight from the terminal.

## Features

- **Token Screener** — Filter new tokens from trenches with configurable safety thresholds
- **Trending Tokens** — Discover trending tokens by volume, smart money, market cap, or price change
- **Deep Screen** — Full security audit on any token address
- **Signal Alerts** — Real-time on-chain signals (price spikes, smart money buys, large buys, etc.)
- **Smart Money Tracker** — Track KOL, smart money, and followed wallet trades
- **Safety Scoring** — Automated A–F grade per token based on 10+ risk factors

## Supported Chains

| Chain | Code |
|-------|------|
| Solana | `sol` |
| BNB Chain | `bsc` |
| Base | `base` |
| Ethereum | `eth` |

## Installation

```bash
npm install
cp .env.example .env
# Edit .env with your GMGN API key
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GMGN_API_KEY` | — | Your GMGN API key (required) |
| `GMGN_REQUEST_DELAY_MS` | `2500` | Delay between API calls (ms) |
| `SCREEN_CHAINS` | `bsc,base` | Chains to screen by default |
| `SCREEN_LIMIT` | `20` | Max tokens per chain |
| `SCREEN_FILTER_PRESET` | `safe` | Default filter preset |
| `MIN_VOLUME_24H` | `1000` | Min 24h volume (USD) |
| `MAX_RUG_RATIO` | `0.3` | Max acceptable rug ratio |
| `MAX_BUNDLER_RATE` | `0.3` | Max bundler rate |
| `MAX_INSIDER_RATIO` | `0.3` | Max insider/rat trader ratio |
| `MIN_SMART_DEGEN_COUNT` | `1` | Min smart wallet holders |

## Usage

### Screen new tokens from trenches

```bash
node src/index.js screen
node src/index.js screen -c sol --filter-preset safe --min-grade B
node src/index.js screen -c bsc --max-rug 0.1 --min-smart 3 --table
```

### Trending tokens

```bash
node src/index.js trending
node src/index.js trending -c sol -i 1h --order-by smart_degen_count
node src/index.js trending -c base -i 24h --table --min-grade A
```

### Deep screen a specific token

```bash
node src/index.js deep <TOKEN_ADDRESS> -c sol
node src/index.js deep <TOKEN_ADDRESS> -c bsc
```

### Signal alerts

```bash
node src/index.js signals -c sol
node src/index.js signals -c bsc --mc-min 50000 --mc-max 500000
node src/index.js signals -c sol -t 1 -t 5 -t 8
```

### Track wallets

```bash
# KOL trades
node src/index.js kol -c sol --side buy

# Smart money trades
node src/index.js smartmoney -c bsc -l 50

# Followed wallets
node src/index.js wallet -c sol --min-usd 500
node src/index.js wallet -c sol --wallet <WALLET_ADDRESS>
```

### List supported chains

```bash
node src/index.js chains
```

## Scoring System

Each token is scored 0–100 and graded A–F:

| Grade | Score | Meaning |
|-------|-------|---------|
| A | 80–100 | Excellent |
| B | 60–79 | Good |
| C | 40–59 | Average |
| D | 20–39 | Poor |
| F | 0–19 or any flag | Dangerous |

**Instant F flags:** Honeypot detected, high rug ratio, high bundler rate, wash trading, high rat trader ratio.

**Positive signals:** Open source contract, owner renounced, zero sell tax, smart money interest, KOL activity, good liquidity, social links present.

## CLI Options

### `screen`

| Option | Description |
|--------|-------------|
| `-c, --chain` | Chain: `bsc`, `base`, `sol`, `eth` |
| `-t, --type` | Trench type: `new_creation`, `near_completion`, `completed` |
| `-l, --limit` | Max tokens per chain |
| `--filter-preset` | `safe` or `strict` |
| `--min-volume` | Min 24h volume (USD) |
| `--max-rug` | Max rug ratio |
| `--min-smart` | Min smart money count |
| `--min-grade` | Min grade to show: `A`, `B`, `C`, `D`, `F` |
| `--table` | Show as table |
| `--no-address` | Hide full address |

### `trending`

| Option | Description |
|--------|-------------|
| `-c, --chain` | Chain |
| `-i, --interval` | `1m`, `5m`, `1h`, `6h`, `24h` |
| `-l, --limit` | Max tokens |
| `--order-by` | `volume`, `smart_degen_count`, `market_cap`, `price_change` |
| `--min-grade` | Min grade to show |
| `--table` | Show as table |

### `signals`

| Option | Description |
|--------|-------------|
| `-c, --chain` | `sol` or `bsc` |
| `-t, --signal-type` | Signal type IDs (1–18), repeatable |
| `--mc-min` | Min market cap (USD) |
| `--mc-max` | Max market cap (USD) |
| `--trigger-mc-min` | Min MC at signal trigger |
| `--trigger-mc-max` | Max MC at signal trigger |

## License

MIT
