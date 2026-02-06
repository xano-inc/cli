#!/bin/bash

# Initialize Claude Code plugins from .claude/settings.json
# Run this script once after cloning the repository

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SETTINGS_FILE="$PROJECT_ROOT/.claude/settings.json"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

if [ ! -f "$SETTINGS_FILE" ]; then
  echo -e "${RED}Error: settings.json not found at $SETTINGS_FILE${NC}"
  exit 1
fi

echo "Reading configuration from settings.json..."
echo ""

# Get current installed marketplaces as JSON
INSTALLED_MARKETPLACES=$(claude plugin marketplace list --json 2>/dev/null || echo "[]")

# Get current installed plugins as JSON
INSTALLED_PLUGINS=$(claude plugin list --json 2>/dev/null || echo "[]")

# Extract marketplace repos from extraKnownMarketplaces
MARKETPLACES=$(grep -o '"repo": *"[^"]*"' "$SETTINGS_FILE" | sed 's/"repo": *"//;s/"$//' || true)

if [ -n "$MARKETPLACES" ]; then
  echo "=== Marketplaces ==="
  echo ""

  echo "$MARKETPLACES" | while read -r repo; do
    if [ -n "$repo" ]; then
      # Check if marketplace is already installed by looking for the repo in the JSON
      if echo "$INSTALLED_MARKETPLACES" | grep -q "\"repo\": \"$repo\""; then
        echo -e "  ${GREEN}✓${NC} $repo ${GREEN}(installed)${NC}"
      else
        echo -e "  ${YELLOW}○${NC} $repo ${YELLOW}(not installed)${NC}"
      fi
    fi
  done
  echo ""

  # Add each marketplace (redirect stdin to prevent interactive mode)
  echo "$MARKETPLACES" | while read -r repo; do
    if [ -n "$repo" ]; then
      # Check again if already installed
      if echo "$INSTALLED_MARKETPLACES" | grep -q "\"repo\": \"$repo\""; then
        echo "Skipping $repo (already installed)"
      else
        echo "Adding marketplace $repo..."
        claude plugin marketplace add "$repo" < /dev/null 2>&1 || echo -e "  ${RED}Warning: Failed to add $repo${NC}"
      fi
    fi
  done
  echo ""
fi

# Extract plugin entries from enabledPlugins where value is true
PLUGINS=$(grep -E '"[^"]+@[^"]+":\s*true' "$SETTINGS_FILE" | sed 's/.*"\([^"]*@[^"]*\)".*/\1/')

if [ -z "$PLUGINS" ]; then
  echo "No enabled plugins found in settings.json"
  exit 0
fi

echo "=== Plugins ==="
echo ""

# Show status for each plugin
echo "$PLUGINS" | while read -r plugin; do
  if [ -n "$plugin" ]; then
    # Check if plugin is installed (user scope or any scope)
    if echo "$INSTALLED_PLUGINS" | grep -q "\"id\": \"$plugin\""; then
      # Check if enabled
      if echo "$INSTALLED_PLUGINS" | grep -A5 "\"id\": \"$plugin\"" | grep -q '"enabled": true'; then
        echo -e "  ${GREEN}✓${NC} $plugin ${GREEN}(installed & enabled)${NC}"
      else
        echo -e "  ${YELLOW}○${NC} $plugin ${YELLOW}(installed but disabled)${NC}"
      fi
    else
      echo -e "  ${RED}✗${NC} $plugin ${RED}(not installed)${NC}"
    fi
  fi
done
echo ""

# Install each plugin (redirect stdin to prevent interactive mode)
echo "$PLUGINS" | while read -r plugin; do
  if [ -n "$plugin" ]; then
    # Check if already installed
    if echo "$INSTALLED_PLUGINS" | grep -q "\"id\": \"$plugin\""; then
      echo "Skipping $plugin (already installed)"
    else
      echo "Installing $plugin..."
      claude plugin install "$plugin" < /dev/null 2>&1 || echo -e "  ${RED}Warning: Failed to install $plugin${NC}"
    fi
  fi
done

echo ""
echo "Done! All marketplaces and plugins have been processed."
echo ""
echo "Run 'claude plugin list' to see all installed plugins."
