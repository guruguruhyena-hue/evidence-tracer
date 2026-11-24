#!/usr/bin/env python3
"""Generate a public, non-personal daily JPY reference-price cache for IZAKA-YA asset symbols.

Method: Binance UTC close for ASSET/USDT * Frankfurter USD/JPY reference rate.
USDT: 1 USDT = 1 USD assumption, not a verified USDT/JPY trading quote.
Avoid current incomplete UTC day. Preserve old files if an API query fails.
Only market-rate data and evidence URLs are published; never user transactions.
"""
import csv
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

START = date(2024, 1, 1)
END = datetime.now(timezone.utc).date() - timedelta(days=1)
PAIRS = {
    "BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT",
    "XRP": "XRPUSDT", "USDC": "USDCUSDT", "SHIB": "SHIBUSDT",
    "OP": "OPUSDT",
}
ASSETS = tuple(PAIRS) + ("USDT",)
UNSUPPORTED = ("AKC", "IZKY")
ROOT = Path(__file__).resolve().parents[1] / "prices"
FIELDS = ["date_utc", "asset", "price_jpy", "source", "source_url", "source_sha256",
          "evidence_ref", "method", "checked_at_utc"]
USER_AGENT = "EvidenceTracer-HistoricalValuation/1.0 (+https://github.com/guruguruhyena-hue/evidence-tracer)"


def get_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    last_error = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                return json.load(response)
        except (OSError, TimeoutError, ValueError, urllib.error.HTTPError) as exc:
            last_error = exc
            time.sleep(min(2 ** attempt, 8))
    raise RuntimeError(f"Could not fetch {url.split('?')[0]}: {last_error}")


def fetch_fx():
    lookback = START - timedelta(days=10)
    url = (f"https://api.frankfurter.dev/v1/{lookback.isoformat()}..{END.isoformat()}"
           "?base=USD&symbols=JPY")
    data = get_json(url)
    rates = []
    for day, values in sorted(data.get("rates", {}).items()):
        if values.get("JPY") is not None and Decimal(str(values["JPY"])) > 0:
            rates.append((date.fromisoformat(day), Decimal(str(values["JPY"]))))
    if not rates:
        raise RuntimeError("No historical USD/JPY reference rates")
    return rates, url


def fetch_klines(pair):
    """Request <=1000 candles per page. Binance public endpoint, no credentials."""
    output = {}
    cursor = int(datetime.combine(START, datetime.min.time(), timezone.utc).timestamp() * 1000)
    end_ms = int(datetime.combine(END + timedelta(days=1), datetime.min.time(), timezone.utc).timestamp() * 1000)
    urls = []
    host = "https://data-api.binance.vision"
    while cursor < end_ms:
        params = urllib.parse.urlencode({
            "symbol": pair, "interval": "1d", "startTime": cursor,
            "endTime": end_ms, "limit": 1000,
        })
        url = f"{host}/api/v3/klines?{params}"
        candles = get_json(url)
        urls.append(url)
        if not isinstance(candles, list):
            raise RuntimeError(f"{pair} unexpected response")
        if not candles:
            break
        for candle in candles:
            when = datetime.fromtimestamp(int(candle[0]) / 1000, timezone.utc).date()
            if START <= when <= END:
                close = Decimal(str(candle[4]))
                if close > 0:
                    output[when] = close
        next_cursor = int(candles[-1][0]) + 86400000
        if next_cursor <= cursor:
            raise RuntimeError(f"{pair} cursor failed to advance")
        cursor = next_cursor
        if len(candles) < 1000:
            break
        time.sleep(0.12)
    if not output:
        raise RuntimeError(f"{pair} no historical prices")
    return output, urls


def decimal_price(amount, fx):
    result = (amount * fx).quantize(Decimal("0.000000000001"), rounding=ROUND_HALF_UP)
    return format(result, "f")


def existing_rows(asset):
    rows = {}
    for path in (ROOT / asset).glob("*.csv"):
        with path.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                if row.get("asset") == asset and row.get("date_utc"):
                    rows[row["date_utc"]] = row
    return rows


def save_asset(asset, rows):
    years = {}
    for day, row in sorted(rows.items()):
        if day >= START.isoformat() and day <= END.isoformat():
            years.setdefault(day[:4], []).append(row)
    path = ROOT / asset
    path.mkdir(parents=True, exist_ok=True)
    for year, items in years.items():
        dest = path / (year + ".csv")
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=FIELDS, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(items)
        output = buf.getvalue()
        if not dest.exists() or dest.read_text(encoding="utf-8") != output:
            dest.write_text(output, encoding="utf-8")
        json_dest = path / (year + ".json")
        json_content = json.dumps({"schema_version": 1, "asset": asset, "year": int(year), "rows": items}, ensure_ascii=False, separators=(",", ":")) + "\n"
        if not json_dest.exists() or json_dest.read_text(encoding="utf-8") != json_content:
            json_dest.write_text(json_content, encoding="utf-8")


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    fx_rates, fx_url = fetch_fx()
    lookup = {}
    current = START
    fx_index = 0
    while current <= END:
        while fx_index + 1 < len(fx_rates) and fx_rates[fx_index + 1][0] <= current:
            fx_index += 1
        fx_day, value = fx_rates[fx_index]
        if fx_day <= current and (current - fx_day).days <= 7:
            lookup[current] = (value, fx_day)
        current += timedelta(days=1)

    now = datetime.now(timezone.utc).isoformat()
    manifest = {
        "schema_version": 1, "generated_at_utc": now,
        "start_utc": START.isoformat(), "end_utc": END.isoformat(),
        "assets": {}, "unsupported_assets": list(UNSUPPORTED),
        "method_warning": "Reference only: ASSET/USDT UTC closing price * USD/JPY reference. Treating USDT as USD is an assumption, not a market-observed crypto/JPY or exact-time exchange rate.",
        "fx_provider": "Frankfurter v1 USD/JPY historical reference",
        "fx_source_url": fx_url, "currency": "JPY",
    }
    any_success = False
    for asset in ASSETS:
        rows = existing_rows(asset)
        try:
            candles, sources = (fetch_klines(PAIRS[asset]) if asset != "USDT" else ({}, []))
            if asset != "USDT":
                for day, close in candles.items():
                    if day not in lookup:
                        continue
                    fx, fx_day = lookup[day]
                    url = sources[0] if sources else ""
                    previous = rows.get(day.isoformat())
                    if previous and previous.get("price_jpy") == decimal_price(close, fx) and previous.get("method") == "USDT_PAIR_DAILY_CLOSE_X_USDJPY_REFERENCE":
                        continue
                    rows[day.isoformat()] = {
                        "date_utc": day.isoformat(), "asset": asset,
                        "price_jpy": decimal_price(close, fx),
                        "source": f"Binance {PAIRS[asset]} UTC daily close x Frankfurter USD/JPY reference",
                        "source_url": url + " ; " + fx_url,
                        "source_sha256": "", "evidence_ref": f"{asset} {day.isoformat()}; FX {fx_day.isoformat()}",
                        "method": "USDT_PAIR_DAILY_CLOSE_X_USDJPY_REFERENCE",
                        "checked_at_utc": now,
                    }
            else:
                for day, (fx, fx_day) in lookup.items():
                    previous = rows.get(day.isoformat())
                    if previous and previous.get("price_jpy") == decimal_price(Decimal("1"), fx) and previous.get("method") == "USDT_USD_PARITY_ASSUMPTION_X_USDJPY_REFERENCE":
                        continue
                    rows[day.isoformat()] = {
                        "date_utc": day.isoformat(), "asset": asset,
                        "price_jpy": decimal_price(Decimal("1"), fx),
                        "source": "Frankfurter USD/JPY reference with 1 USDT = 1 USD assumption",
                        "source_url": fx_url, "source_sha256": "",
                        "evidence_ref": f"USDT {day.isoformat()}; FX {fx_day.isoformat()}",
                        "method": "USDT_USD_PARITY_ASSUMPTION_X_USDJPY_REFERENCE",
                        "checked_at_utc": now,
                    }
            save_asset(asset, rows)
            any_success = True
            status = "ok"
            message = ""
        except Exception as exc:
            status, message = "fetch_failed_previous_data_preserved", str(exc)
            print(f"WARNING {asset}: {message}", file=sys.stderr)
        dates = sorted(d for d in rows if START.isoformat() <= d <= END.isoformat())
        manifest["assets"][asset] = {
            "status": status, "rows": len(dates),
            "first_date_utc": dates[0] if dates else None,
            "last_date_utc": dates[-1] if dates else None,
            "years": sorted({d[:4] for d in dates}),
            "error": message,
        }
        print(f"{asset}: {len(dates)} rows ({status})")
    if not any_success:
        raise SystemExit("Failed to refresh all assets; no files modified")
    (ROOT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
