# IZAKA-YA shared historical JPY reference-rate database

This folder contains **public market-reference quotes only** — never victim transactions, wallet addresses, police evidence or account numbers.

## Coverage
- **In scope**: BTC, ETH, SOL, XRP, USDC, USDT, SHIB, OP — UTC daily data beginning 2025-01-01.
- **No automatic reference prices**: AKC and IZKY. These assets require evidence-based manual valuation; no invented zeros or estimates.
- Dates through the preceding completed **UTC day**. Earlier years are not populated by default.

## Files after first successful GitHub Actions run
- `manifest.json`: coverage counts, update UTC time, per-asset refresh errors and first/last dates.
- `<ASSET>/<YYYY>.json`: same-origin compact cache for the browser app.
- `<ASSET>/<YYYY>.csv`: human-auditable export with price, source, source URL and calculation method.

**The presence of this README does not imply the database has been populated.** When first-run workflows are blocked or source APIs fail, `manifest.json` or annual files may be absent; users will be told that the cache is unavailable.

## Price calculation
- Binance public **ASSET/USDT 1d UTC closing price** multiplied by Frankfurter historical **USD/JPY reference rate**.
- USDT: treats 1 USDT as 1 USD as an explicit approximation. Not a verified USDT/JPY actual quote.
- For dates without a published Frankfurter rate (weekends/holidays), most recent rate at most seven calendar days old; source date is preserved.
- Each derived quote is rounded half-up to twelve decimal places; later transaction valuation uses separate decimal BigInt rules and rounds each transaction to JPY 0.01.
- These are **estimated JPY reference values**, not exact execution prices, paid principal, loss amounts or certified market observations.
- Do not overwrite missing asset/date pairs with interpolated amounts. Inspect `manifest.json` and the specific annual CSV for gaps.

## Data provenance and redistribution
Price data is derived from third-party sources with their own terms:
- Binance Spot public market-data API: https://developers.binance.com/en/docs/binance-spot-api-docs/rest-api/market-data-endpoints
- Binance Data Collection terms (for reference, if bulk archives are ever used): https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md
- Frankfurter exchange-rate reference API: https://frankfurter.dev/v1/ and https://frankfurter.dev/license/

The repository's MIT software license does not automatically license third-party underlying market data. Users should check source-specific reuse/redistribution conditions before further republishing or commercial reuse.

## Refresh process
`.github/workflows/publish-pages.yml` refreshes data daily at 03:27 UTC and during website deployment. `scripts/build-shared-price-cache.py` performs data fetching, preserves existing snapshots when a single provider fails, and commits market-only files to GitHub. The same workflow publishes these to GitHub Pages, so users do not need to call provider APIs from their own browsers.

If the GitHub Actions workflow cannot write to the repository or GitHub Pages is not enabled, the refresh/deploy is not complete. Check the Actions workflow log and Pages settings.
