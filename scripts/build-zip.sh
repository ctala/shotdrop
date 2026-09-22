#!/bin/sh
# Packs extension/ into dist/shotdrop-<version>.zip, the file uploaded to the Chrome Web Store.
set -eu
cd "$(dirname "$0")/.."
V=$(node -p "require('./extension/manifest.json').version")
mkdir -p dist
rm -f "dist/shotdrop-$V.zip"
(cd extension && zip -qr -X "../dist/shotdrop-$V.zip" . -x '.*' -x '*/.*')
echo "dist/shotdrop-$V.zip"
