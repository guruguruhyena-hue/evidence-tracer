# Evidence package format v1

Each locally generated ZIP contains:
- `evidence.json`: matched transaction records, including raw provider response for each match.
- `manifest.json`: engine version, generation time, processing mode, scanned public address, case-profile version/hash and evidence record hash.
- `sha256.txt`: SHA-256 values for `evidence.json` and `manifest.json`.
- `README.txt`: interpretation limits.

The package proves only what the enclosed public-ledger data and case-profile evidence support. It does not itself establish legal ownership of a destination wallet, criminality, conspiracy, or beneficial ownership.
