#!/usr/bin/env python3
import json
import re
import sys
import uuid
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / "workflows" / "marketpulse-marketplace-opportunity-radar.json"


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


workflow = json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))
nodes = workflow.get("nodes", [])
names = [node.get("name") for node in nodes]
name_set = set(names)

if workflow.get("active") is not False:
    fail("workflow must be inactive")
if workflow.get("pinData") != {}:
    fail("pinData must be empty")
if "meta" in workflow or "id" in workflow:
    fail("instance metadata or workflow ID remains")
if len(nodes) != 77:
    fail(f"expected 77 nodes, found {len(nodes)}")
if len(name_set) != len(names):
    fail("node names are not unique")
if any(" · " not in name for name in names):
    fail("every node name must use the phase-based naming convention")

node_ids = []
for node in nodes:
    if node.get("credentials"):
        fail(f"credential reference remains on {node['name']}")
    if "webhookId" in node:
        fail(f"webhookId remains on {node['name']}")
    try:
        parsed = uuid.UUID(node["id"])
    except Exception as exc:  # noqa: BLE001
        fail(f"invalid node UUID on {node.get('name')}: {exc}")
    if parsed.version != 5:
        fail(f"node UUID is not a generated v5 identifier: {node['name']}")
    node_ids.append(node["id"])
if len(set(node_ids)) != len(node_ids):
    fail("node IDs are not unique")

for source_name, connection_types in workflow.get("connections", {}).items():
    if source_name not in name_set:
        fail(f"unknown connection source: {source_name}")
    for outputs in connection_types.values():
        for edges in outputs:
            for edge in edges:
                if edge.get("node") not in name_set:
                    fail(f"unknown connection target: {edge.get('node')}")

webhooks = [node for node in nodes if node.get("type") == "n8n-nodes-base.webhook"]
paths = []
for node in webhooks:
    if node.get("parameters", {}).get("authentication") != "headerAuth":
        fail(f"webhook is not fail-closed with Header Auth: {node['name']}")
    paths.append(node.get("parameters", {}).get("path"))
if len(paths) != 4 or len(set(paths)) != 4:
    fail("expected four unique webhook paths")

http_nodes = [node for node in nodes if node.get("type") == "n8n-nodes-base.httpRequest"]
for node in http_nodes:
    options = node.get("parameters", {}).get("options", {})
    if "timeout" not in options:
        fail(f"HTTP timeout missing: {node['name']}")
    if node.get("onError") != "continueRegularOutput":
        fail(f"HTTP failure continuation missing: {node['name']}")

serialized = json.dumps(workflow, ensure_ascii=False)
secret_patterns = {
    "private key": r"BEGIN (?:RSA|OPENSSH|EC|PGP) PRIVATE KEY",
    "GitHub token": r"gh[pousr]_[A-Za-z0-9_]{20,}",
    "OpenAI-style key": r"sk-[A-Za-z0-9_-]{20,}",
    "Slack token": r"xox[baprs]-[A-Za-z0-9-]{10,}",
    "AWS access key": r"AKIA[0-9A-Z]{16}",
    "database URI": r"(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis)://[^\s\"']+",
}
for label, pattern in secret_patterns.items():
    if re.search(pattern, serialized, flags=re.IGNORECASE):
        fail(f"possible {label} found")

for forbidden in ["YOUR_GITHUB_USERNAME", "70000000-", "contact@example.com", "arbitrage_signal"]:
    if forbidden in serialized:
        fail(f"unexpected configured value found: {forbidden}")

required_fragments = [
    "kdromanovich/marketpulse-n8n-marketplace-trend-radar",
    "MARKETPULSE_ENABLE_DELIVERY",
    "price_gap_signal",
    "durable_persistence_expected",
    "Collect · Join Request Context + HTTP Response",
]
for fragment in required_fragments:
    if fragment not in serialized:
        fail(f"required workflow feature missing: {fragment}")

node_types = Counter(node.get("type") for node in nodes)
print(json.dumps({
    "result": "pass",
    "workflow": workflow.get("name"),
    "nodes": len(nodes),
    "code_nodes": node_types["n8n-nodes-base.code"],
    "merge_nodes": node_types["n8n-nodes-base.merge"],
    "http_nodes": len(http_nodes),
    "webhooks": len(webhooks),
    "credential_references": 0,
}, ensure_ascii=False, indent=2))
