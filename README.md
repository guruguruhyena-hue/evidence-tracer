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
