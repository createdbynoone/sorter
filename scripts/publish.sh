#!/bin/bash
# Build locally, upload with gh — electron-builder's GitHub publisher races
# against itself (duplicate publisher tasks re-upload the same assets and
# overwrite each other), leaving release assets inconsistent with
# latest-mac.yml. Building with --publish never and uploading the finished
# artifacts in one gh call is deterministic: one build state, one upload.
# (Same pattern as BMP's scripts/publish.sh — the old --publish-always-per-arch
# version of this script left the v1.3.0 arm64 DMG missing from the release
# despite reporting success; see feedback_electron_publish_deterministic.)
#
# Note: package.json declares arch:["arm64","x64"] in its targets, so a single
# electron-builder run builds both arches — never run it once per arch.
set -e

REPO="createdbynoone/sorter"
VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"

echo "→ Building renderer / main / preload..."
npx electron-vite build

echo "→ Building arm64 & x64 artifacts (no publish)..."
npx electron-builder --mac --publish never

echo "→ Verifying latest-mac.yml against local artifacts..."
# x64 artifacts have no arch suffix: Sorter-1.4.1-mac.zip / Sorter-1.4.1.dmg
for zip in "release/Sorter-$VERSION-mac.zip" "release/Sorter-$VERSION-arm64-mac.zip"; do
  local_sha=$(openssl dgst -sha512 -binary "$zip" | base64)
  grep -qF "$local_sha" release/latest-mac.yml || { echo "✗ sha512 mismatch for $zip"; exit 1; }
done
echo "  sha512 OK"

echo "→ Uploading to GitHub release $TAG..."
gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1 || gh release create "$TAG" --repo "$REPO" --title "$VERSION" --notes "Sorter $VERSION"
gh release upload "$TAG" \
  "release/Sorter-$VERSION.dmg" \
  "release/Sorter-$VERSION.dmg.blockmap" \
  "release/Sorter-$VERSION-mac.zip" \
  "release/Sorter-$VERSION-mac.zip.blockmap" \
  "release/Sorter-$VERSION-arm64.dmg" \
  "release/Sorter-$VERSION-arm64.dmg.blockmap" \
  "release/Sorter-$VERSION-arm64-mac.zip" \
  "release/Sorter-$VERSION-arm64-mac.zip.blockmap" \
  release/latest-mac.yml \
  --repo "$REPO" --clobber

echo "✓ Release complete"
