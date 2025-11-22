# laughing-winner
"""Binance P2P MMK/USD (USDT) price monitor.

Fetches bid/ask prices for USDT quoted in MMK from Binance's P2P API
and prints a dashboard-friendly table with basic summary statistics.
"""
from __future__ import annotations

import datetime as _dt
import json
import statistics
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Iterable, List, Sequence

API_URL = "https://api1.binance.com/api/v1/public/c2c/adv/search"


@dataclass
class P2PQuote:
    """Represents a single P2P advertisement entry."""

    trade_type: str
    price_mmk: float
    available_usdt: float
    payment_methods: str
    trader_rating: str


class P2PClientError(RuntimeError):
    """Raised when Binance responds with an error payload."""


class P2PNetworkError(RuntimeError):
    """Raised when the network request fails."""


def _format_payment_methods(trade_methods: Sequence[dict] | None) -> str:
    names = [method.get("tradeMethodName", "?") for method in trade_methods or ()]
    return ", ".join(names) if names else "N/A"


def _format_trader_rating(advertiser: dict | None) -> str:
    if not advertiser:
        return "N/A"
    nickname = advertiser.get("nickName") or advertiser.get("userNickName") or "?"
    orders = advertiser.get("monthOrderCount")
    completion = advertiser.get("monthFinishRate") or advertiser.get("monthOrderFinishRate")
    if completion is not None:
        try:
            completion_pct = float(completion)
            completion_str = f"{completion_pct:.1f}%"
        except (TypeError, ValueError):
            completion_str = str(completion)
    else:
        completion_str = "?"

    orders_str = f"{orders}" if orders is not None else "?"
    return f"{nickname} | {orders_str} orders | {completion_str} completion"


def _post_json(url: str, payload: dict, timeout: float = 10.0) -> dict:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:  # pragma: no cover - network dependent
        raise P2PNetworkError(f"HTTP error {exc.code}: {exc.reason}") from exc
    except urllib.error.URLError as exc:  # pragma: no cover - network dependent
        raise P2PNetworkError(f"Network error contacting Binance: {exc.reason}") from exc

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:  # pragma: no cover - network dependent
        raise P2PClientError("Invalid JSON response from Binance") from exc


def fetch_p2p_quotes(trade_type: str, rows: int = 20, page: int = 1) -> List[P2PQuote]:
    """Fetch P2P quotes from Binance.

    Args:
        trade_type: "BUY" to fetch asks (sellers of USDT) or "SELL" to fetch bids.
        rows: Number of results to request.
        page: Page number for pagination.

    Returns:
        A list of :class:`P2PQuote` instances.

    Raises:
        P2PNetworkError: When the HTTP request fails.
        P2PClientError: When Binance responds with an error payload.
    """

    payload = {
        "page": page,
        "rows": rows,
        "asset": "USDT",
        "fiat": "MMK",
        "tradeType": trade_type,
        "publisherType": None,
    }

    data = _post_json(API_URL, payload)

    if data.get("code") not in ("000000", 0, None):
        message = data.get("message") or data.get("msg") or "Unknown error"
        raise P2PClientError(f"Binance error {data.get('code')}: {message}")

    quotes: List[P2PQuote] = []
    for item in data.get("data", []):
        adv = item.get("adv", {})
        advertiser = item.get("advertiser", {})
        try:
            price = float(adv.get("price"))
        except (TypeError, ValueError):
            continue

        try:
            available = float(adv.get("surplusAmount"))
        except (TypeError, ValueError):
            available = 0.0

        quote = P2PQuote(
            trade_type="Bid" if trade_type.upper() == "SELL" else "Ask",
            price_mmk=price,
            available_usdt=available,
            payment_methods=_format_payment_methods(adv.get("tradeMethods")),
            trader_rating=_format_trader_rating(advertiser),
        )
        quotes.append(quote)

    return quotes


def _format_table(quotes: Iterable[P2PQuote]) -> str:
    headers = [
        ("Trade Type", 10),
        ("Price (MMK/USDT)", 18),
        ("Available (USDT)", 18),
        ("Payment Methods", 30),
        ("Trader Rating", 35),
    ]

    col_headers = [name.ljust(width) for name, width in headers]
    lines = [" | ".join(col_headers), "-" * (sum(width for _, width in headers) + 3 * (len(headers) - 1))]

    for quote in quotes:
        row = [
            quote.trade_type.ljust(10),
            f"{quote.price_mmk:,.2f}".rjust(18),
            f"{quote.available_usdt:,.4f}".rjust(18),
            quote.payment_methods.ljust(30),
            quote.trader_rating.ljust(35),
        ]
        lines.append(" | ".join(row))

    return "\n".join(lines)


def summarize_quotes(bids: Sequence[P2PQuote], asks: Sequence[P2PQuote]) -> str:
    lines = []
    bid_prices = [q.price_mmk for q in bids]
    ask_prices = [q.price_mmk for q in asks]

    def mean_or_dash(values: Sequence[float]) -> str:
        return f"{statistics.mean(values):,.2f}" if values else "--"

    best_bid = f"{max(bid_prices):,.2f}" if bid_prices else "--"
    best_ask = f"{min(ask_prices):,.2f}" if ask_prices else "--"
    spread = "--"
    if bid_prices and ask_prices:
        spread_val = min(ask_prices) - max(bid_prices)
        spread = f"{spread_val:,.2f}"

    lines.append(f"Best Bid: {best_bid}")
    lines.append(f"Best Ask: {best_ask}")
    lines.append(f"Avg Bid:  {mean_or_dash(bid_prices)}")
    lines.append(f"Avg Ask:  {mean_or_dash(ask_prices)}")
    lines.append(f"Spread:   {spread}")
    return "\n".join(lines)


def main() -> None:  # pragma: no cover - CLI helper
    timestamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S %Z")
    try:
        asks = fetch_p2p_quotes("BUY")
        bids = fetch_p2p_quotes("SELL")
    except (P2PClientError, P2PNetworkError) as exc:
        print("Failed to retrieve Binance P2P data:", exc)
        print("Troubleshooting: check network connectivity, confirm the API endpoint is reachable, and retry in a few moments.")
        return

    asks_sorted = sorted(asks, key=lambda q: q.price_mmk)
    bids_sorted = sorted(bids, key=lambda q: q.price_mmk, reverse=True)

    print(f"Binance P2P MMK/USD via USDT snapshot | {timestamp}")
    print()
    print(summarize_quotes(bids_sorted, asks_sorted))
    print()
    print("Asks (lowest first):")
    print(_format_table(asks_sorted))
    print()
    print("Bids (highest first):")
    print(_format_table(bids_sorted))


if __name__ == "__main__":  # pragma: no cover
    main()
