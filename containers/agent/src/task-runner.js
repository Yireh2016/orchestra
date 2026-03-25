/**
 * Orchestra Agent Task Runner
 *
 * Parses TASK_DEFINITION, runs the coding agent, executes gate commands,
 * implements retry logic with diagnostics, and posts results to CALLBACK_URL.
 */

'use strict';

const { spawn } = require('node:child_process');
const { writeFileSync, readFileSync, existsSync } = require('node:fs');
const path = require('node:path');

// ─── Configuration ───────────────────────────────────────────────────────────

const REPO_DIR = process.env.REPO_DIR || '/workspace/repo';
const ATTEMPT = parseInt(process.env.ATTEMPT || '1', 10);
const AGENT_TYPE = process.env.AGENT_TYPE || 'claude-code';
const API_KEY = process.env.API_KEY || '';

let taskDefinition;
try {
  taskDefinition = JSON.parse(process.env.TASK_DEFINITION);
} catch (err) {
  console.error(`[task-runner] Failed to parse TASK_DEFINITION: ${err.message}`);
  process.exit(1);
}

const {
  prompt,
  gate_commands: gateCommands = [],
  timeout_seconds: timeoutSeconds = 600,
  context = {},
} = taskDefinition;

if (!prompt) {
  console.error('[task-runner] TASK_DEFINITION must include a "prompt" field.');
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[task-runner ${ts}] ${msg}`);
}

/**
 * Spawns a child process and returns a promise that resolves with
 * { code, stdout, stderr }.
 */
function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd || REPO_DIR,
      env: { ...process.env, ...options.env },
      shell: options.shell || false,
      timeout: (options.timeoutMs || timeoutSeconds * 1000),
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    proc.on('error', (err) => reject(err));

    proc.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

// ─── Agent runners ───────────────────────────────────────────────────────────

/**
 * Run Claude Code CLI with the given prompt.
 */
async function runClaudeCode() {
  log(`Running Claude Code agent (attempt ${ATTEMPT})...`);

  const fullPrompt = buildPrompt();
  const args = ['--print', fullPrompt];

  const env = {};
  if (API_KEY) {
    env.ANTHROPIC_API_KEY = API_KEY;
  }

  const result = await runCommand('claude', args, {
    cwd: REPO_DIR,
    env,
    timeoutMs: timeoutSeconds * 1000,
  });

  if (result.code !== 0) {
    throw new Error(`Claude Code exited with code ${result.code}:\n${result.stderr}`);
  }

  return result;
}

/**
 * Build the full prompt including context and retry diagnostics.
 */
function buildPrompt() {
  let fullPrompt = prompt;

  // Add file context if provided
  if (context.files && Array.isArray(context.files)) {
    fullPrompt += '\n\nRelevant files:\n' + context.files.join('\n');
  }

  // Add retry diagnostics for subsequent attempts
  if (ATTEMPT > 1) {
    const prevLog = `/tmp/agent-output-${ATTEMPT - 1}.log`;
    if (existsSync(prevLog)) {
      const prevOutput = readFileSync(prevLog, 'utf-8').slice(-4096);
      fullPrompt += `\n\n--- PREVIOUS ATTEMPT (${ATTEMPT - 1}) FAILED ---\n`;
      fullPrompt += `The previous attempt failed. Here is the tail of its output:\n${prevOutput}\n`;
      fullPrompt += `Please analyze what went wrong and fix the issues.\n`;
      fullPrompt += `--- END PREVIOUS ATTEMPT OUTPUT ---`;
    }
  }

  return fullPrompt;
}

// ─── Gate commands ───────────────────────────────────────────────────────────

/**
 * Run gate commands sequentially. Each must exit 0 to pass.
 */
async function runGateCommands() {
  if (!gateCommands.length) {
    log('No gate commands to run.');
    return { passed: true, results: [] };
  }

  log(`Running ${gateCommands.length} gate command(s)...`);
  const results = [];

  for (let i = 0; i < gateCommands.length; i++) {
    const gate = gateCommands[i];
    const name = gate.name || `gate-${i + 1}`;
    const cmd = gate.command;

    if (!cmd) {
      log(`WARNING: Gate '${name}' has no command, skipping.`);
      continue;
    }

    log(`Running gate '${name}': ${cmd}`);

    try {
      const result = await runCommand('/bin/bash', ['-c', cmd], {
        cwd: REPO_DIR,
        timeoutMs: (gate.timeout_seconds || 120) * 1000,
        shell: false,
      });

      const passed = result.code === 0;
      results.push({ name, command: cmd, passed, code: result.code, output: result.stdout + result.stderr });

      if (!passed) {
        log(`Gate '${name}' FAILED (exit code ${result.code}).`);
        return { passed: false, results, failedGate: name };
      }

      log(`Gate '${name}' passed.`);
    } catch (err) {
      log(`Gate '${name}' ERROR: ${err.message}`);
      results.push({ name, command: cmd, passed: false, code: -1, output: err.message });
      return { passed: false, results, failedGate: name };
    }
  }

  log('All gate commands passed.');
  return { passed: true, results };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log('Task runner starting...');
  log(`Agent type: ${AGENT_TYPE}`);
  log(`Attempt: ${ATTEMPT}`);
  log(`Timeout: ${timeoutSeconds}s`);
  log(`Gate commands: ${gateCommands.length}`);

  // Step 1: Run the coding agent
  let agentResult;
  try {
    switch (AGENT_TYPE) {
      case 'claude-code':
        agentResult = await runClaudeCode();
        break;
      default:
        throw new Error(`Unsupported agent type: ${AGENT_TYPE}`);
    }
  } catch (err) {
    log(`Agent execution failed: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Run gate commands
  const gateResult = await runGateCommands();

  if (!gateResult.passed) {
    log(`Gate validation failed at '${gateResult.failedGate}'.`);

    // Write diagnostics for next retry attempt
    const diagnostics = {
      attempt: ATTEMPT,
      agentOutput: agentResult.stdout.slice(-4096),
      gateResults: gateResult.results,
    };
    writeFileSync('/tmp/gate-diagnostics.json', JSON.stringify(diagnostics, null, 2));

    process.exit(1);
  }

  // Step 3: Write final result summary
  const summary = {
    status: 'success',
    attempt: ATTEMPT,
    agentType: AGENT_TYPE,
    gateResults: gateResult.results.map((r) => ({ name: r.name, passed: r.passed })),
    timestamp: new Date().toISOString(),
  };

  writeFileSync('/tmp/agent-result.json', JSON.stringify(summary, null, 2));
  log('Task runner completed successfully.');
}

main().catch((err) => {
  console.error(`[task-runner] Unhandled error: ${err.message}`);
  process.exit(1);
});
