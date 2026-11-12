#!/usr/bin/env node
// Checks that the `playwright-test` MCP server starts and serves the tools the given
// agents need. Used by test-orchestrator when a Playwright sub-agent reports it has no
// playwright-test tools, to tell "server is broken" apart from "harness didn't expose it".
//
// Usage: node scripts/check-playwright-mcp.cjs [agent-name ...]
//   e.g. node scripts/check-playwright-mcp.cjs playwright-test-planner
// With no agent names, checks all three Playwright agents.
// Exit 0 = server healthy and serves every required tool; 1 = not.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const agents = process.argv.slice(2);
const agentNames = agents.length
  ? agents
  : ['playwright-test-planner', 'playwright-test-generator', 'playwright-test-healer'];

// Required tools come from each agent's frontmatter `tools:` line (mcp__playwright-test__<tool>).
const required = new Set();
for (const name of agentNames) {
  const file = path.join(repoRoot, '.claude', 'agents', `${name}.md`);
  if (!fs.existsSync(file)) {
    console.error(`Unknown agent: ${name} (no ${path.relative(repoRoot, file)})`);
    process.exit(1);
  }
  const toolsLine = fs.readFileSync(file, 'utf8').match(/^tools:(.*)$/m);
  for (const m of (toolsLine ? toolsLine[1] : '').matchAll(/mcp__playwright-test__(\w+)/g)) {
    required.add(m[1]);
  }
}

const TIMEOUT_MS = 60000;
const server = spawn('npx', ['playwright', 'run-test-mcp-server'], {
  cwd: repoRoot,
  shell: process.platform === 'win32',
  env: { ...process.env, PLAYWRIGHT_SLOWMO: '0' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
let done = false;

function finish(ok, message, extra = {}) {
  if (done) return;
  done = true;
  console.log(JSON.stringify({ ok, message, agents: agentNames, ...extra }, null, 2));
  try { server.kill(); } catch { /* already gone */ }
  process.exit(ok ? 0 : 1);
}

const timer = setTimeout(
  () => finish(false, `Server did not answer tools/list within ${TIMEOUT_MS / 1000}s`, { stderr: stderr.slice(-2000) }),
  TIMEOUT_MS,
);

server.on('error', (err) => finish(false, `Failed to launch server: ${err.message}`));
server.on('exit', (code) =>
  finish(false, `Server exited early with code ${code}`, { stderr: stderr.slice(-2000) }),
);
server.stderr.on('data', (d) => { stderr += d; });
server.stdout.on('data', (d) => {
  stdout += d;
  let nl;
  while ((nl = stdout.indexOf('\n')) >= 0) {
    const line = stdout.slice(0, nl).trim();
    stdout = stdout.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === 1) {
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    } else if (msg.id === 2) {
      clearTimeout(timer);
      const served = new Set((msg.result?.tools || []).map((t) => t.name));
      const missing = [...required].filter((t) => !served.has(t));
      if (missing.length) {
        finish(false, 'Server started but is missing tools the agents need (Playwright version mismatch?)', { missing });
      } else {
        finish(true, `Server healthy: serves all ${required.size} required tools`);
      }
    }
  }
});

function send(obj) {
  server.stdin.write(JSON.stringify(obj) + '\n');
}

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'check-playwright-mcp', version: '1.0.0' },
  },
});
