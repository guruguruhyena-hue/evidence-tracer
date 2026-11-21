# Threat model

## Protected information
User-entered public wallet addresses, API keys, scan results and case notes must not be retained by Evidence Tracer infrastructure.

## Architecture controls
- Static application; no application API backend.
- No accounts, cookies, analytics, telemetry, localStorage or IndexedDB.
- No wallet SDK and no signing request.
- Inputs are held in JavaScript memory until reload/clear.
- Exports are created in the browser.

## Residual risks
- External RPC/indexer providers can log the user's IP address and queried public wallet.
- Hosting/CDN providers can log ordinary page requests, but the application does not include wallet values in those requests.
- Browser extensions or compromised devices can access page contents.
- Public-address attribution can be wrong; attribution requires evidence references and classification levels.

## Maximum-privacy path
Use a user-controlled RPC/indexer where supported, host the static app locally, and verify source/release hashes before use.
