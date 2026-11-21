# Forensic methodology (draft v0.1)

1. Fetch public blockchain history directly from the user's browser.
2. Extract outgoing transfers from the user-supplied public address.
3. Compare only the destination against a versioned static case-profile address database.
4. Preserve the raw provider response inside each matched record.
5. Export evidence JSON + manifest + SHA-256 hashes locally.
6. Never infer legal ownership, criminality, beneficial ownership, or victim status from an on-chain match alone.

## Bitcoin
Treat each vout to the matched destination as the transferred amount. UTXO transaction total is not used as the victim transfer amount.

## EVM
Native-value transfers and token transfers are collected separately. Token attribution comes from indexed transfer data; production version must use decimal-safe conversion rather than floating point.

## Solana
History discovery uses `getSignaturesForAddress`; transaction detail uses `getTransaction` with finalized commitment. Production parser will additionally resolve SPL token account ownership and mint metadata.

## XRP Ledger
Only outgoing Payment transactions from the supplied account are considered. DestinationTag is preserved when present. Production version should preserve Ripple epoch timestamps and delivered_amount where applicable.
