# Setup

## Requirements

- Target workflow runtime: n8n self-hosted 2.17.5.
- No community nodes.
- No credentials for the manual demo.
- Node.js 20+ and Python 3.10+ only if you want to run repository checks locally.

## 1. Import

In n8n, import:

```text
workflows/marketpulse-marketplace-opportunity-radar.json
```

The workflow is inactive after import. Its canvas nodes use phase prefixes such as `Collect ·`, `Normalize ·`, and `Score ·` to organize the processing stages.

## 2. Run the demo

1. Open `Trigger · Run Demo`.
2. Start a test execution.
3. Inspect the executive report and three export branches.

Expected fixture result:

| Output | Expected |
|---|---:|
| Raw offers | 30 |
| Accepted products | 30 |
| Breakout | 5 |
| Rising | 10 |
| High risk | 1 |
| Selected products | 12 |

The demo makes no HTTP requests. Timestamps and run IDs change, while product values and scores remain stable.

## 3. Protect the webhooks

The webhook nodes use `headerAuth`. Create an n8n **Header Auth** credential, for example:

```text
Header name: X-MarketPulse-Key
Header value: <a long random secret>
```

Assign it to all four webhook nodes:

- `Trigger · On-Demand Scan API`
- `Trigger · Latest Opportunities API`
- `Trigger · MarketPulse Health API`
- `Trigger · Failure Event Intake API`

You may use separate credentials for administrative endpoints. Never place the value in the workflow JSON, documentation, curl history, screenshots, or Git commits.

## 4. Persist a demo snapshot

n8n workflow static data is not saved after a manual test. To test durable state without calling marketplaces:

1. Assign webhook credentials.
2. Activate the workflow.
3. Send the sample request to the production webhook URL.

```bash
curl --fail-with-body \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-MarketPulse-Key: <secret>' \
  --data @samples/scan-request.json \
  'https://<n8n-host>/webhook/marketpulse-scan'
```

Then query:

```bash
curl --fail-with-body \
  --header 'X-MarketPulse-Key: <secret>' \
  'https://<n8n-host>/webhook/marketpulse-opportunities'
```

The response should include `success: true` and the latest API envelope.

## 5. Configure live collection

The schedule branch and an API request with `demo_mode: false` enter live collection. Do not activate this path until you have:

- confirm marketplace terms and allowed use;
- test current response shapes in your region;
- confirmed the destination/region configuration;
- confirm request volume and timeout policy;
- confirm the source mappings, scoring assumptions, and delivery settings.

The workflow accepts only three source names and constructs URLs internally. It does not accept an arbitrary URL from the webhook body.

Set `MARKETPULSE_WB_DESTINATION_ID` as an n8n Variable or permitted environment variable before enabling Wildberries live collection. Keep the operational destination identifier out of the workflow JSON.

The default schedule is `0 8 * * *` in `Europe/Moscow`. Adjust it in n8n if required.

## 6. Configure optional delivery

Delivery is disabled unless `MARKETPULSE_ENABLE_DELIVERY` resolves to `true`, `1`, `yes`, or `on` and all required values pass validation:

```text
MARKETPULSE_TELEGRAM_API_URL
MARKETPULSE_TELEGRAM_CHAT_ID
MARKETPULSE_SLACK_WEBHOOK_URL
MARKETPULSE_WAREHOUSE_WEBHOOK_URL
```

The configuration node tries self-hosted environment values first and n8n Variables second. Environment access from Code nodes depends on your n8n security policy; n8n Variables may depend on edition and instance configuration. Missing access is handled safely and leaves delivery disabled.

For a production deployment, prefer secret-manager-injected environment values or replace the delivery HTTP nodes with credential-backed native/custom nodes. Do not commit a real Telegram URL, chat ID, Slack webhook, or warehouse endpoint. The placeholders in the export deliberately fail validation when delivery is enabled.

## 7. Failure intake

`POST /webhook/marketpulse-failure-intake` accepts a failure-shaped payload, clips identifiers and text, removes control characters, excludes execution URLs, and retains at most 50 events.

It is an optional integration point. If you need automatic n8n execution-error handling, create a separate Error Workflow with an Error Trigger and send a minimal failure event to this endpoint or directly to your observability stack.

## 8. Pre-activation checklist

- [ ] Workflow imported without missing node types.
- [ ] Manual demo completed with expected counts.
- [ ] Header Auth assigned to every webhook.
- [ ] Production webhook URL tested with `demo_mode: true`.
- [ ] Latest and health endpoints return the expected responses.
- [ ] Live collectors tested separately against current responses.
- [ ] Request policy approved for every marketplace.
- [ ] Cost, fee, tax, return, and margin assumptions calibrated.
- [ ] Delivery remains disabled or uses trusted runtime secrets.
- [ ] Execution-data retention and privacy settings configured.
- [ ] A separate n8n Error Workflow configured if automatic error capture is required.
