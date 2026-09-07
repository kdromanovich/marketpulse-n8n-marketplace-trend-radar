# Data contracts

Field names are stable inside the workflow even when a marketplace adapter changes. Examples below are shortened; complete fictional outputs are in [`samples/`](../samples/).

## Scan request

`POST /webhook/marketpulse-scan`

```json
{
  "demo_mode": true,
  "queries": ["органайзер для кабелей"],
  "sources": ["wildberries", "ozon", "yandex_market"],
  "max_results_per_query": 20
}
```

| Field | Type | Rules |
|---|---|---|
| `demo_mode` | boolean | Only literal `true` enables demo for an API request |
| `queries` | string[] | Trimmed, deduplicated, maximum 10, each maximum 120 characters |
| `sources` | string[] | Filtered to `wildberries`, `ozon`, `yandex_market` |
| `max_results_per_query` | number | Clamped to 5–50 |

Raw URLs, delivery destinations, weights, and credentials are not accepted from the request body.

## Execution context

```json
{
  "context": {
    "trigger_type": "api",
    "requested_at": "2026-09-06T20:00:00.000Z",
    "run_id": "mpr_example",
    "request_meta": {
      "request_id": "demo-request-001",
      "caller": "api-request"
    },
    "config": {}
  }
}
```

Header-derived metadata is stripped of control characters and length-bounded. `config` is built inside the trusted configuration node.

## Canonical product: `marketpulse.product.v1`

```json
{
  "marketplace": "ozon",
  "query": "органайзер для кабелей",
  "category": "Home organization",
  "sku": "OZ-10110",
  "product_key": "ozon:OZ-10110",
  "title": "Модульный органайзер для кабелей, набор 20 штук",
  "brand": "UrbanKit",
  "seller_name": "Demo Seller",
  "price": 822,
  "old_price": 1011,
  "currency": "RUB",
  "rating": 4.9,
  "reviews_count": 2585,
  "seller_count": 16,
  "current_rank": 9,
  "sales_30d_proxy": 1325,
  "delivery_days": 1,
  "in_stock": true,
  "sponsored": false,
  "captured_at": "2026-09-06T20:00:00.000Z",
  "source_confidence": 0.82,
  "data_completeness": 1
}
```

`sales_30d_proxy` is intentionally labeled as a proxy. A source adapter also records `sales_proxy_method` so downstream consumers know how the value was inferred.

## Engine outputs

Each engine returns a dictionary keyed by `product_key`.

```json
{
  "demand_by_key": {
    "ozon:OZ-10110": {
      "demand_score": 84.2,
      "momentum_score": 78.4,
      "components": {
        "position": 95.6,
        "rating": 93.3,
        "review_base": 85.3,
        "sales_proxy": 84.4,
        "velocity": 70.1
      }
    }
  }
}
```

Equivalent maps exist for `competition_by_key`, `economics_by_key`, and `risk_by_key`.

## Scored product

```json
{
  "product_key": "ozon:OZ-10110",
  "opportunity_score": 81.55,
  "trend_stage": "breakout",
  "recommendation": "Source samples and launch a controlled test",
  "score_explanation": [
    "accelerating demand",
    "healthy estimated margin"
  ],
  "demand": {},
  "competition": {},
  "economics": {},
  "risk": {}
}
```

Stages are `breakout`, `rising`, `watch`, `crowded`, or `avoid`. A high risk can prevent a strong raw score from becoming `breakout` or `rising`.

## Executive report

Key sections:

| Field | Meaning |
|---|---|
| `report_id`, `run_id`, `generated_at`, `mode` | Traceability |
| `kpis` | Aggregate score, margin, stages, risks, and source success |
| `top_opportunities` | Ranked, compact product records |
| `category_insights` | Category averages and leaders |
| `cross_market_gaps` | Query-level price comparison; not exact SKU matching |
| `selected_products` | Selection constrained by category and marketplace |
| `source_health` | Per-source request and record counts |
| `data_quality` | Accepted, rejected, and duplicate counts |
| `baseline_status` | History strategy and stored-key count |
| `model` | Model name and weights |
| `request_log` | Bounded live-request records |

The committed full example is [demo-report.json](../samples/demo-report.json).

## Fresh scan response

The scan API returns the JSON envelope plus delivery and persistence status:

```json
{
  "success": true,
  "report_id": "radar_mpr_example",
  "generated_at": "2026-09-06T20:00:00.000Z",
  "mode": "demo",
  "kpis": {},
  "opportunities": [],
  "categories": [],
  "cross_market_gaps": [],
  "selected_products": [],
  "source_health": [],
  "data_quality": {},
  "delivery": {
    "mode": "skipped",
    "reason": "demo_mode"
  },
  "persistence": {
    "snapshot_staged": true,
    "durable_persistence_expected": true
  }
}
```

For a manual n8n test, `durable_persistence_expected` is `false`. For a successful production trigger or webhook execution, it is `true`.

## Latest snapshot response

Before a durable snapshot exists:

```json
{
  "success": false,
  "generated_at": "2026-09-06T20:00:00.000Z",
  "message": "No MarketPulse snapshot exists. Run the demo or a live scan first."
}
```

Afterward, `success` is `true`, `snapshot_age_minutes` is included, and `report` contains the latest API envelope.

## Health response

```json
{
  "success": true,
  "generated_at": "2026-09-06T20:00:00.000Z",
  "overall_status": "healthy",
  "latest_snapshot_at": "2026-09-06T19:55:00.000Z",
  "snapshot_age_hours": 0.08,
  "source_health": [],
  "retained_runs": 5,
  "historical_products": 420,
  "recent_error_count": 0,
  "latest_error": null
}
```

Possible states are `unknown`, `healthy`, `degraded`, and `stale`. If present, `latest_error` contains only timestamp, last node, error name, and a bounded message; execution URLs and references are excluded.
