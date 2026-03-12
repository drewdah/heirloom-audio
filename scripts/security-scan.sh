#!/usr/bin/env bash
#
# Run security scans locally — same checks that run in CI.
#
# Usage:
#   ./scripts/security-scan.sh          # Run all scans
#   ./scripts/security-scan.sh audit    # npm audit only
#   ./scripts/security-scan.sh trivy    # Trivy scan only
#
# Prerequisites:
#   - Node.js + npm (you already have this)
#   - Trivy (optional — install with: sudo apt-get install -y trivy)
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

SCAN_TYPE="${1:-all}"

# Directories to skip — build artifacts, dependencies, git history
TRIVY_SKIP_DIRS=".next,node_modules,.git,data"

# ── npm audit ───────────────────────────────────────────
run_npm_audit() {
  echo ""
  echo -e "${CYAN}━━━ npm audit ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "Checking package-lock.json for known vulnerabilities..."
  echo ""

  if npm audit --audit-level=high 2>/dev/null; then
    echo -e "${GREEN}✓ No high/critical vulnerabilities found${NC}"
  else
    echo ""
    echo -e "${YELLOW}⚠ Vulnerabilities found — review the output above${NC}"
    echo -e "  Run 'npm audit fix' to auto-fix where possible"
  fi
}

# ── Trivy ───────────────────────────────────────────────
run_trivy() {
  echo ""
  echo -e "${CYAN}━━━ Trivy security scan ━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  if ! command -v trivy &> /dev/null; then
    echo -e "${YELLOW}⚠ Trivy is not installed — skipping Trivy scan${NC}"
    echo ""
    echo "  Install Trivy to enable full scanning:"
    echo ""
    echo "    Ubuntu/WSL:  curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sudo sh -s -- -b /usr/local/bin"
    echo "    macOS:       brew install trivy"
    echo ""
    echo "  Then re-run: npm run security"
    return 0
  fi

  echo -e "Scanning for vulnerabilities, secrets, and misconfigurations..."
  echo -e "Skipping: ${TRIVY_SKIP_DIRS}"
  echo ""

  trivy fs . \
    --scanners vuln,secret,misconfig \
    --severity CRITICAL,HIGH \
    --ignore-unfixed \
    --skip-dirs "$TRIVY_SKIP_DIRS" \
    --pkg-types os,library \
    --exit-code 0

  echo ""
  echo -e "${GREEN}✓ Trivy scan complete — review any findings above${NC}"
}

# ── Run scans ───────────────────────────────────────────
echo -e "${CYAN}🔒 HeirloomAudio Security Scan${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

case "$SCAN_TYPE" in
  audit)
    run_npm_audit
    ;;
  trivy)
    run_trivy
    ;;
  all)
    run_npm_audit
    run_trivy
    ;;
  *)
    echo "Usage: $0 [all|audit|trivy]"
    exit 1
    ;;
esac

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Done.${NC} Results above show CRITICAL and HIGH severity only."
echo -e "For full details: npm audit / trivy fs . --severity LOW,MEDIUM,HIGH,CRITICAL"
