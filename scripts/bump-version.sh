#!/bin/bash

# Bump the version number in package.json
# Usage: ./scripts/bump-version.sh [major|minor|patch]
# Default: patch

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PACKAGE_JSON="$PROJECT_ROOT/package.json"

BUMP_TYPE="${1:-patch}"

if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
  echo "Usage: $0 [major|minor|patch]"
  echo "  Default: patch"
  exit 1
fi

CURRENT=$(grep -o '"version": *"[^"]*"' "$PACKAGE_JSON" | head -1 | sed 's/"version": *"//;s/"//')

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP_TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

sed -i '' "s/\"version\": *\"$CURRENT\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"

echo "$CURRENT -> $NEW_VERSION"
