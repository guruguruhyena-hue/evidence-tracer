# Evidence Tracer

Open-source, local-first blockchain evidence generator. Each case is entered by the user. No default victim, wallet, or case profile is bundled.

> **MVP status:** v0.1.x is an experimental evidence-assistance tool. Independently verify exported transaction facts before police/legal use.

## Privacy invariants
- No app account or login
- No wallet connection
- No server-side application storage
- No analytics / telemetry
- Wallet trace caching and target-address storage use browser localStorage (user-controlled; not encrypted)
- Public addresses only
- API keys remain in page memory only
- Evidence exports are generated in the browser

External blockchain/RPC providers can observe queries made to them. For stronger privacy, use a user-controlled RPC where supported. The hosting CDN may receive ordinary page requests, but wallet values are not sent to Evidence Tracer infrastructure.

## MVP chains
- Bitcoin — Blockstream Esplora direct browser query
- EVM — Etherscan V2 API direct browser query (Ethereum, BNB, Polygon, Arbitrum, OP Mainnet, Base, Avalanche, Linea, Scroll, zkSync Era, HyperEVM, opBNB)
- Solana — JSON-RPC `getSignaturesForAddress` + `getTransaction`
- XRP Ledger — JSON-RPC `account_tx`

## Evidence model
The app separates blockchain facts from address attribution. `IZAKAYA_DEPOSIT` means a deposit address backed by the case-profile evidence. `RELATED_WALLET` is never presented as a customer deposit address.


## Historical JPY Valuation / 入金時点の円時価評価

Open the standalone [`valuation.html`](./valuation.html) page for an **open-source, local-first crypto-to-JPY historical valuation tool**. It accepts a user-supplied transaction CSV, fetches historical **Binance USDT-quoted daily candles** and **Frankfurter USD/JPY daily reference rates** from external public APIs, then computes an **estimated JPY reference price**, accepts independently sourced price CSV files, and exports a per-row valuation CSV with price provenance. **No personal transactions, recipient addresses, or case records are bundled with the public app.**

- **Large CSV support:** Web Worker-based chunked browser-side reading (512 KiB slices), up to 500 MiB per CSV and 1,000,000 rows (whichever limit is reached first); table view shows 100 rows at a time and CSV exports are constructed in batches. Actual performance is device-memory dependent; extremely large CSV files may still require splitting.
- Sample input: [`examples/valuation-transactions.example.csv`](./examples/valuation-transactions.example.csv) (fictional example only)
- Required input columns: `datetime_jst,asset,amount`; optional columns: `txid,address,category,notes,id`.
- Historical-price input columns: `date_utc,asset,price_jpy,source`.
- Data is processed in the browser, without uploading CSV files to this repository or a project backend. **External quote API calls disclose symbols and requested dates to the quote provider**, and website hosting may record ordinary access logs.
- Valuations multiply decimal strings with **BigInt**, round **each transaction** half-up to 0.01 JPY, then sum the rounded cents; no JavaScript binary floating-point multiplication is used. Imported quote precision is limited to that actually provided by the market API or price CSV.
- API-derived JPY values are **approximate USDT-market-to-JPY conversions**: Binance close for COIN/USDT × Frankfurter USD/JPY reference exchange rate, treating USDT as if 1 USDT = 1 USD. USDT-only uses USD/JPY under the same assumption. The spot USDT/USD exchange rate may diverge from 1, so this is **not** a verified crypto/JPY trade price or second-by-second deposit value. For holidays, the most recent prior reference FX date is recorded. Distinguish the quote method in official submissions.
- Prices are **UTC daily closes**, not the exact price at the deposit second. Missing/unsupported historical prices remain empty. Classifications such as refund, service credit, zero amount, or suspected duplicates must be reviewed manually.
- **A valuation is not evidence of acquisition cost, returned principal, or final legal damages.** Keep bank transaction records, exchange receipts, chain TxIDs, original CSV/PDF files, and quote-source evidence separately.
- The valuation page uses a restrictive Content Security Policy (same-origin Web Worker only) and displays CSV text using safe text-only DOM APIs. No CSV files are uploaded to an application server. API lookups are still subject to CORS/geographic blocks and provider rate limits. The legacy keyless CryptoCompare endpoint stopped working in 2026; do not rely on it. Manual quote CSV import remains supported.
- The tool is part of this repository and is distributed under the [MIT License](./LICENSE).

For GitHub Pages deployments using the repository root as the publishing source, the direct path is `/valuation.html`. If Pages is not enabled, users can download the repository and open the standalone HTML file locally.

## Local use
No build step is required. Serve the repository as static files:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Running directly as `file://` may be blocked by browser module/fetch security rules.

## Privacy test

```bash
npm run privacy:test
```

## Documentation
- `docs/PRIVACY.md`
- `docs/THREAT-MODEL.md`
- `docs/FORENSIC-METHODOLOGY.md`
- `docs/EVIDENCE-FORMAT.md`
- `docs/POLICE-GUIDE-JA.md`

## Status / limitations
v0.1.x MVP. Before a v1.0 police-use release, chain parsers need fixture tests against known transactions, pagination/source hardening, exact decimal-safe token math, Solana SPL support, XRPL delivered-amount handling, and independent review.

## Police Evidence Pack (separate page)
Open `report.html` to prepare a generic police submission summary. This page ships without individual case data, stores nothing persistently, computes local SHA-256 of selected files and accepts an optional reconciliation JSON. It is an evidence-organizing tool, not a forensic certification. The user must preserve originals separately.

**Historical exposure:** Earlier public commits accidentally contained case-specific details. Removing files from the current Git tree does not remove public commit history, clones, archives or caches; consider restricting the old repository and moving the cleaned code to a new public repository with no inherited history.
