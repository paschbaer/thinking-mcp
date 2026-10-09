#!/usr/bin/env bash
# Run the insight (EMMS) test suite inside a Linux container on the
# deployment base image (node:22-slim) with platform-correct
# better-sqlite3 bindings — the deterministic alternative to flaky
# WSL/Node-24/drvfs runs (native worker-exit crashes).
#
# Usage:
#   bash scripts/test-in-container.sh            # build + 2 consecutive full runs
#   bash scripts/test-in-container.sh --run-once # build + a single full run
#   bash scripts/test-in-container.sh --no-build # reuse the existing image
#
# Embedding-model tests are disabled (EMMS_DISABLE_EMBEDDINGS=1) so the
# runs are deterministic and need no model download/egress.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="${TEST_CONTAINER_IMAGE:-insight-test:local}"

build() {
  # Context = repo root: the suite also reads repo siblings
  # (servers/shared-workflow, servers/server-guidance/scripts).
  docker build -f "$HERE/../Dockerfile.test" -t "$IMAGE" "$HERE/../../.."
}

run_suite() {
  docker run --rm -e EMMS_DISABLE_EMBEDDINGS=1 "$IMAGE"
}

case "${1:-}" in
  "" | --run-twice)
    build
    echo "[test-in-container] run 1/2"
    run_suite
    echo "[test-in-container] run 2/2"
    run_suite
    echo "[test-in-container] 2 consecutive green full runs — suite is deterministic in-container."
    ;;
  --run-once)
    [[ "${2:-}" == "--no-build" ]] || build
    run_suite
    ;;
  --no-build)
    run_suite
    ;;
  *)
    echo "usage: test-in-container.sh [--run-once [--no-build] | --no-build]" >&2
    exit 2
    ;;
esac
