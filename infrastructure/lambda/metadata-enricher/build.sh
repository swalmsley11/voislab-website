#!/bin/bash

###############################################################################
# Build script for metadata-enricher Lambda function
# Packages Python dependencies with the Lambda code
###############################################################################

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Building metadata-enricher Lambda package..."
echo "Working directory: $(pwd)"

# Clean up previous builds
rm -rf package
rm -f metadata-enricher.zip

# Create package directory
mkdir -p package

# Install dependencies to package directory
echo "Installing Python dependencies..."
pip3 install -r requirements.txt \
  --target package \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.11 \
  --only-binary=:all: \
  --upgrade

# Copy Lambda function code
echo "Copying Lambda code..."
cp index.py package/

# Create deployment package
echo "Creating deployment package..."
cd package
zip -r ../metadata-enricher.zip . -q
cd ..

# Clean up
echo "Cleaning up..."
rm -rf package

echo "✓ Build complete: metadata-enricher.zip"
echo ""
echo "To deploy:"
echo "  cd ../../"
echo "  npm run deploy:dev"
