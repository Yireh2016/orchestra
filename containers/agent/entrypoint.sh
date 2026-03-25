#!/usr/bin/env bash
set -euo pipefail

# ─── Logging helpers ──────────────────────────────────────────────────────────
log()  { echo "[agent $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die()  { log "FATAL: $*"; report_result "error" "$*"; exit 1; }

# ─── Required environment variables ──────────────────────────────────────────
: "${REPO_URL:?REPO_URL is required}"
: "${BRANCH:?BRANCH is required}"
: "${TASK_DEFINITION:?TASK_DEFINITION is required (JSON)}"
: "${CALLBACK_URL:?CALLBACK_URL is required}"
AGENT_TYPE="${AGENT_TYPE:-claude-code}"
API_KEY="${API_KEY:-}"
BASE_BRANCH="${BASE_BRANCH:-main}"
MAX_RETRIES="${MAX_RETRIES:-3}"

WORK_DIR="/workspace/repo"
RESULT_FILE="/tmp/agent-result.json"

# ─── Cleanup on exit ────────────────────────────────────────────────────────
cleanup() {
  local exit_code=$?
  log "Cleaning up (exit code: ${exit_code})..."
  rm -rf "${WORK_DIR}" "${RESULT_FILE}" 2>/dev/null || true
}
trap cleanup EXIT

# ─── Report result back to callback URL ──────────────────────────────────────
report_result() {
  local status="$1"
  local message="${2:-}"
  local output_file="${3:-}"
  local output=""

  if [[ -n "${output_file}" && -f "${output_file}" ]]; then
    output=$(cat "${output_file}" | head -c 65536)
  fi

  local payload
  payload=$(node -e "
    const payload = {
      status: process.argv[1],
      message: process.argv[2],
      output: process.argv[3],
      branch: process.argv[4],
      agentType: process.argv[5],
      timestamp: new Date().toISOString()
    };
    process.stdout.write(JSON.stringify(payload));
  " "${status}" "${message}" "${output}" "${BRANCH}" "${AGENT_TYPE}")

  log "Reporting result (status=${status}) to ${CALLBACK_URL}"
  curl -sS -X POST "${CALLBACK_URL}" \
    -H "Content-Type: application/json" \
    -d "${payload}" \
    --max-time 30 \
    --retry 3 \
    --retry-delay 5 || log "WARNING: Failed to report result to callback URL"
}

# ─── Clone repository ────────────────────────────────────────────────────────
clone_repo() {
  log "Cloning ${REPO_URL} into ${WORK_DIR}..."
  rm -rf "${WORK_DIR}"

  local clone_args=("--depth" "50" "--single-branch")

  if git ls-remote --heads "${REPO_URL}" "${BRANCH}" 2>/dev/null | grep -q "${BRANCH}"; then
    log "Branch '${BRANCH}' exists on remote, cloning it directly."
    git clone "${clone_args[@]}" --branch "${BRANCH}" "${REPO_URL}" "${WORK_DIR}"
  else
    log "Branch '${BRANCH}' does not exist. Cloning '${BASE_BRANCH}' and creating new branch."
    git clone "${clone_args[@]}" --branch "${BASE_BRANCH}" "${REPO_URL}" "${WORK_DIR}"
    cd "${WORK_DIR}"
    git checkout -b "${BRANCH}"
  fi

  cd "${WORK_DIR}"
  git config user.email "orchestra-agent@orchestra.dev"
  git config user.name "Orchestra Agent"
  log "Repository ready at ${WORK_DIR} on branch $(git rev-parse --abbrev-ref HEAD)"
}

# ─── Push branch ─────────────────────────────────────────────────────────────
push_branch() {
  cd "${WORK_DIR}"

  if git diff --quiet HEAD && git diff --cached --quiet; then
    log "No changes to push."
    return 0
  fi

  log "Committing any remaining changes..."
  git add -A
  git diff --cached --quiet || git commit -m "chore(agent): apply automated changes from ${AGENT_TYPE}"

  log "Pushing branch '${BRANCH}' to origin..."
  git push origin "${BRANCH}" --force-with-lease 2>&1 || {
    log "WARNING: force-with-lease failed, retrying with --force..."
    git push origin "${BRANCH}" --force 2>&1
  }
  log "Branch pushed successfully."
}

# ─── Run the task via Node.js task-runner ─────────────────────────────────────
run_task() {
  local attempt="$1"
  log "Running task (attempt ${attempt}/${MAX_RETRIES}) with agent type '${AGENT_TYPE}'..."

  cd "${WORK_DIR}"

  REPO_DIR="${WORK_DIR}" \
  ATTEMPT="${attempt}" \
  TASK_DEFINITION="${TASK_DEFINITION}" \
  AGENT_TYPE="${AGENT_TYPE}" \
  API_KEY="${API_KEY}" \
    node /agent/src/task-runner.js 2>&1 | tee "/tmp/agent-output-${attempt}.log"

  return "${PIPESTATUS[0]}"
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
  log "Orchestra Agent starting..."
  log "Agent type: ${AGENT_TYPE}"
  log "Branch: ${BRANCH}"
  log "Max retries: ${MAX_RETRIES}"

  # Clone the repository
  clone_repo || die "Failed to clone repository"

  # Self-healing retry loop
  local attempt=1
  local last_error=""

  while [[ ${attempt} -le ${MAX_RETRIES} ]]; do
    log "━━━ Attempt ${attempt} of ${MAX_RETRIES} ━━━"

    if run_task "${attempt}"; then
      log "Task completed successfully on attempt ${attempt}."
      push_branch || die "Failed to push branch after successful task"
      report_result "success" "Task completed on attempt ${attempt}" "/tmp/agent-output-${attempt}.log"
      log "Agent finished successfully."
      exit 0
    fi

    last_error="Task failed on attempt ${attempt}. See logs for details."
    log "WARNING: ${last_error}"

    if [[ ${attempt} -lt ${MAX_RETRIES} ]]; then
      log "Resetting working tree for retry..."
      cd "${WORK_DIR}"
      git checkout -- . 2>/dev/null || true
      git clean -fd 2>/dev/null || true
      log "Waiting 5 seconds before retry..."
      sleep 5
    fi

    attempt=$((attempt + 1))
  done

  die "All ${MAX_RETRIES} attempts failed. Last error: ${last_error}"
}

main "$@"
