import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(projectRoot, 'workflows', 'marketpulse-marketplace-opportunity-radar.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const failures = [];
const codeNodes = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code');
for (const node of codeNodes) {
  const code = node.parameters?.jsCode;
  if (typeof code !== 'string' || !code.trim()) {
    failures.push(`${node.name}: missing jsCode`);
    continue;
  }
  try {
    new AsyncFunction('$json', '$input', '$getWorkflowStaticData', '$', '$vars', '$env', code);
  } catch (error) {
    failures.push(`${node.name}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Compiled ${codeNodes.length} Code nodes successfully.`);
