import csv
import io
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = json.loads((ROOT / "workflows" / "marketpulse-marketplace-opportunity-radar.json").read_text(encoding="utf-8"))
MANIFEST = json.loads((ROOT / "workflow-manifest.json").read_text(encoding="utf-8"))


class RepositoryTests(unittest.TestCase):
    def test_manifest_matches_export(self):
        self.assertEqual(MANIFEST["workflow_name"], WORKFLOW["name"])
        self.assertEqual(MANIFEST["node_count"], len(WORKFLOW["nodes"]))
        self.assertEqual(
            MANIFEST["code_node_count"],
            sum(node["type"] == "n8n-nodes-base.code" for node in WORKFLOW["nodes"]),
        )

    def test_workflow_defaults_are_inactive(self):
        self.assertFalse(WORKFLOW["active"])
        self.assertEqual(WORKFLOW["pinData"], {})
        self.assertNotIn("meta", WORKFLOW)
        self.assertNotIn("id", WORKFLOW)
        for node in WORKFLOW["nodes"]:
            self.assertFalse(node.get("credentials"), node["name"])
            self.assertNotIn("webhookId", node, node["name"])

    def test_webhooks_require_header_auth(self):
        webhooks = [node for node in WORKFLOW["nodes"] if node["type"] == "n8n-nodes-base.webhook"]
        self.assertEqual(len(webhooks), 4)
        self.assertTrue(all(node["parameters"]["authentication"] == "headerAuth" for node in webhooks))

    def test_documentation_set_is_complete(self):
        required = [
            "README.md",
            "README_RU.md",
            "docs/ARCHITECTURE.md",
            "docs/DATA_CONTRACTS.md",
            "docs/SETUP.md",
        ]
        for relative in required:
            self.assertTrue((ROOT / relative).is_file(), relative)
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertNotIn("YOUR_GITHUB_USERNAME", readme)
        architecture = (ROOT / "docs" / "ARCHITECTURE.md").read_text(encoding="utf-8")
        self.assertIn("```mermaid", architecture)

    def test_samples_are_consistent(self):
        report = json.loads((ROOT / "samples" / "demo-report.json").read_text(encoding="utf-8"))
        api = json.loads((ROOT / "samples" / "demo-api-response.json").read_text(encoding="utf-8"))
        health = json.loads((ROOT / "samples" / "health-response.json").read_text(encoding="utf-8"))
        self.assertEqual(report["mode"], "demo")
        self.assertEqual(report["product_count"], 30)
        self.assertGreaterEqual(report["kpis"]["high_risk_products"], 1)
        self.assertEqual(api["report_id"], report["report_id"])
        self.assertNotIn("execution_url", json.dumps(health))
        rows = list(csv.reader(io.StringIO((ROOT / "samples" / "demo-opportunities.csv").read_text(encoding="utf-8"))))
        self.assertEqual(len(rows), 16)
        self.assertEqual(rows[0][0], "rank")


if __name__ == "__main__":
    unittest.main()
