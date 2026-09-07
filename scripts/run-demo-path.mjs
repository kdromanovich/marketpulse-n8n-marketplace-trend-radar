import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(projectRoot, 'workflows', 'marketpulse-marketplace-opportunity-radar.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const staticData = {};
const executedCodeNodes = new Set();

const codeByName = new Map(
  workflow.nodes
    .filter((node) => node.type === 'n8n-nodes-base.code')
    .map((node) => [node.name, node.parameters.jsCode]),
);

async function runCode(name, json = {}, inputItems, selectorData = {}) {
  const code = codeByName.get(name);
  assert.ok(code, `Code node not found: ${name}`);
  const items = inputItems || [{ json }];
  const selector = (nodeName) => {
    const selected = selectorData[nodeName] || [];
    return {
      all: () => selected,
      first: () => selected[0],
      last: () => selected[selected.length - 1],
    };
  };
  const fn = new AsyncFunction('$json', '$input', '$getWorkflowStaticData', '$', '$vars', '$env', code);
  const result = await fn(
    json,
    { all: () => items, first: () => items[0], last: () => items[items.length - 1] },
    () => staticData,
    selector,
    {},
    {},
  );
  assert.ok(Array.isArray(result), `${name} must return an item array`);
  executedCodeNodes.add(name);
  return result;
}

async function runOne(name, json = {}, inputItems, selectorData) {
  const output = await runCode(name, json, inputItems, selectorData);
  assert.ok(output[0]?.json, `${name} returned no JSON item`);
  return output[0].json;
}

function mergeJson(...items) {
  return Object.assign({}, ...items);
}

function assertFiniteTree(value, route = '$') {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `Non-finite number at ${route}`);
  if (Array.isArray(value)) value.forEach((item, index) => assertFiniteTree(item, `${route}[${index}]`));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertFiniteTree(item, `${route}.${key}`);
  }
}

const manual = await runOne('Context · Manual Demo Request');
let data = await runOne('Config · Build Runtime Policy', manual);
data = await runOne('Config · Validate Scan Request', data);
const validated = structuredClone(data);

const demoCollection = await runOne('Collect · Generate Deterministic Demo Offers', validated);
assert.equal(demoCollection.collection_mode, 'demo');
assert.equal(demoCollection.raw_products.length, 30);

const wb = await runOne('Normalize · Wildberries Contract', demoCollection);
const ozon = await runOne('Normalize · Ozon Contract', demoCollection);
const yandex = await runOne('Normalize · Yandex Market Contract', demoCollection);
data = await runOne('Normalize · Build Canonical Product Contract', mergeJson(wb, ozon, yandex));
data = await runOne('Normalize · Clean Titles and Taxonomy', data);
data = await runOne('Quality · Validate Commercial Fields', data);
data = await runOne('Quality · Deduplicate Marketplace Offers', data);
data = await runOne('Feature · Attach Seven-Day Baseline', data);
data = await runOne('Feature · Engineer Comparable Signals', data);
const engineered = structuredClone(data);

const demand = await runOne('Score · Demand and Momentum', engineered);
const competition = await runOne('Score · Competitive Pressure', engineered);
const economics = await runOne('Score · Unit Economics', engineered);
const risk = await runOne('Score · Risk and Compliance', engineered);
data = await runOne('Score · Compose Explainable Opportunity Score', mergeJson(demand, competition, economics, risk));
const scored = structuredClone(data);

const ranking = await runOne('Insight · Rank Product Opportunities', scored);
const categories = await runOne('Insight · Build Category Opportunity Map', scored);
const priceGaps = await runOne('Insight · Find Cross-Marketplace Price Gaps', scored);
const selection = await runOne('Insight · Build Diversified Product Set', scored);
data = await runOne('Report · Build Executive Opportunity Radar', mergeJson(ranking, categories, priceGaps, selection));
const reportBundle = structuredClone(data);

const markdown = await runOne('Export · Render Markdown Digest', reportBundle);
const csv = await runOne('Export · Render CSV Opportunities', reportBundle);
const api = await runOne('Export · Build JSON API Envelope', reportBundle);
data = await runOne('State · Stage Latest Radar Snapshot', mergeJson(markdown, csv, api));
const stagedSnapshot = structuredClone(data);
const skippedDelivery = await runOne('Deliver · Record Delivery Skip', data);

assert.equal(reportBundle.report.product_count, 30);
assert.equal(reportBundle.report.data_quality.accepted, 30);
assert.equal(reportBundle.report.data_quality.rejected, 0);
assert.ok(reportBundle.report.kpis.high_risk_products >= 1, 'Demo must exercise the high-risk branch');
assert.equal(reportBundle.report.category_insights.length, 5);
assert.equal(reportBundle.report.cross_market_gaps.length, 5);
assert.ok(reportBundle.report.cross_market_gaps.every((gap) => 'price_gap_signal' in gap));
assert.ok(reportBundle.report.cross_market_gaps.every((gap) => !('arbitrage_signal' in gap)));
assert.equal(reportBundle.report.selected_products.length, 12);
assert.equal(stagedSnapshot.persistence.snapshot_staged, true);
assert.equal(stagedSnapshot.persistence.durable_persistence_expected, false);
assert.equal(skippedDelivery.delivery_status.reason, 'demo_mode');
assert.equal(csv.csv_export.split('\n').length, 16);

const scheduled = await runOne('Context · Scheduled Scan Request');
assert.equal(scheduled.demo_mode, false);
const apiRequest = await runOne('Context · API Scan Request', {
  body: { demo_mode: true, queries: ['органайзер для кабелей'], sources: ['ozon'] },
  headers: { 'x-request-id': 'demo-request-001', 'x-client-name': 'repository-test' },
});
assert.equal(apiRequest.request_meta.caller, 'repository-test');

const liveInput = structuredClone(validated);
liveInput.context.config.demo_mode = false;
const matrix = await runCode('Collect · Build Query–Marketplace Matrix', liveInput);
assert.equal(matrix.length, 15);
const stamped = await runCode('Collect · Add Request Context', matrix[0].json, matrix);
assert.equal(stamped.length, 15);
assert.ok(stamped.every((item) => item.json.request.request_id));

const liveFixtures = [
  {
    json: {
      ...stamped.find((item) => item.json.request.source === 'wildberries').json,
      statusCode: 200,
      body: JSON.stringify({ data: { products: [{ id: 11001, name: 'Demo vacuum', salePriceU: 249000, priceU: 319000, reviewRating: 4.8, feedbacks: 120, totalQuantity: 20 }] } }),
    },
  },
  {
    json: {
      ...stamped.find((item) => item.json.request.source === 'ozon').json,
      statusCode: 200,
      body: JSON.stringify({ products: [{ sku: 'OZ-22001', title: 'Demo organizer', price: 890, originalPrice: 1090, rating: 4.7, reviewsCount: 85, available: true }] }),
    },
  },
  {
    json: {
      ...stamped.find((item) => item.json.request.source === 'yandex_market').json,
      statusCode: 200,
      body: '<html><script type="application/ld+json">{"sku":"YM-33001","name":"Demo lamp","offers":{"price":"1490","priceCurrency":"RUB"},"aggregateRating":{"ratingValue":"4.6","reviewCount":"64"}}</script></html>',
    },
  },
];
const parsedLive = await runOne('Collect · Parse Live Marketplace Responses', liveFixtures[0].json, liveFixtures);
assert.equal(parsedLive.raw_products.length, 3);
assert.deepEqual([...new Set(parsedLive.raw_products.map((item) => item.marketplace))].sort(), ['ozon', 'wildberries', 'yandex_market']);

const deliveryResult = await runOne(
  'Deliver · Consolidate Delivery Status',
  { telegram_delivery: { statusCode: 200 } },
  [
    { json: { telegram_delivery: { statusCode: 200 } } },
    { json: { slack_delivery: { statusCode: 200 } } },
    { json: { warehouse_delivery: { statusCode: 202 } } },
  ],
  { 'State · Stage Latest Radar Snapshot': [{ json: stagedSnapshot }] },
);
assert.ok(deliveryResult.report, 'Delivery consolidation must retain the report payload');
assert.equal(deliveryResult.delivery_status.response_items, 3);

const latest = await runOne('State · Read Latest Radar Snapshot');
assert.equal(latest.success, true);
await runOne('Observe · Record Failure Event', {
  body: {
    workflow: { id: 'wf-demo', name: 'MarketPulse Demo' },
    execution: { id: 'exec-demo', url: 'https://internal.invalid/execution/exec-demo', lastNodeExecuted: 'Demo Node', error: { name: 'FixtureError', message: 'Synthetic test failure' } },
  },
});
const health = await runOne('Observe · Build Health Status');
assert.equal(health.latest_error.error_name, 'FixtureError');
assert.ok(!('execution_url' in health.latest_error));
assert.ok(!('execution_ref' in health.latest_error));

assertFiniteTree(reportBundle.report);
for (let index = 1; index < reportBundle.report.top_opportunities.length; index += 1) {
  assert.ok(
    reportBundle.report.top_opportunities[index - 1].opportunity_score >= reportBundle.report.top_opportunities[index].opportunity_score,
    'Opportunities must be sorted by descending score',
  );
}

const allCodeNames = [...codeByName.keys()].sort();
const missingExecutions = allCodeNames.filter((name) => !executedCodeNodes.has(name));
assert.deepEqual(missingExecutions, [], `Unexecuted Code nodes: ${missingExecutions.join(', ')}`);

if (process.argv.includes('--write-samples')) {
  const samplesPath = path.join(projectRoot, 'samples');
  fs.writeFileSync(path.join(samplesPath, 'demo-report.json'), `${JSON.stringify(reportBundle.report, null, 2)}\n`);
  fs.writeFileSync(path.join(samplesPath, 'demo-api-response.json'), `${JSON.stringify({ ...api.api_envelope, delivery: skippedDelivery.delivery_status, persistence: stagedSnapshot.persistence }, null, 2)}\n`);
  fs.writeFileSync(path.join(samplesPath, 'demo-opportunities.csv'), `${csv.csv_export}\n`);
  fs.writeFileSync(path.join(samplesPath, 'demo-digest.md'), `${markdown.markdown_digest}\n`);
  fs.writeFileSync(path.join(samplesPath, 'health-response.json'), `${JSON.stringify(health, null, 2)}\n`);
  fs.writeFileSync(path.join(samplesPath, 'live-parser-fixture-output.json'), `${JSON.stringify(parsedLive, null, 2)}\n`);
}

console.log(JSON.stringify({
  result: 'pass',
  code_nodes_executed: executedCodeNodes.size,
  demo_offers: demoCollection.raw_products.length,
  accepted_products: reportBundle.report.data_quality.accepted,
  high_risk_products: reportBundle.report.kpis.high_risk_products,
  breakout_products: reportBundle.report.kpis.breakout_products,
  rising_products: reportBundle.report.kpis.rising_products,
  average_score: reportBundle.report.kpis.average_score,
  median_score: reportBundle.report.kpis.median_score,
  selected_products: reportBundle.report.selected_products.length,
  live_parser_fixture_products: parsedLive.raw_products.length,
}, null, 2));
