#!/bin/bash

# Verification script for project setup

echo "🔍 Verifying VoisLab Website project setup..."
echo ""

# Check Node.js version
echo "📦 Node.js version:"
node --version
echo ""

# Check if all dependencies are installed
echo "📋 Checking frontend dependencies..."
if [ -f "package-lock.json" ]; then
    echo "✅ Frontend dependencies installed"
else
    echo "❌ Frontend dependencies not installed"
    exit 1
fi

echo ""
echo "📋 Checking infrastructure dependencies..."
if [ -f "infrastructure/package-lock.json" ]; then
    echo "✅ Infrastructure dependencies installed"
else
    echo "❌ Infrastructure dependencies not installed"
    exit 1
fi

echo ""
echo "🔧 Running frontend checks..."

# Type checking
echo "  - TypeScript type checking..."
npm run type-check
if [ $? -eq 0 ]; then
    echo "  ✅ TypeScript types are valid"
else
    echo "  ❌ TypeScript type errors found"
    exit 1
fi

# Linting
echo "  - ESLint checking..."
npm run lint
if [ $? -eq 0 ]; then
    echo "  ✅ ESLint passed"
else
    echo "  ❌ ESLint errors found"
    exit 1
fi

# Build test
echo "  - Build test..."
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "  ✅ Frontend builds successfully"
else
    echo "  ❌ Frontend build failed"
    exit 1
fi

echo ""
echo "🏗️  Running infrastructure checks..."

# Infrastructure tests
echo "  - CDK unit tests..."
cd infrastructure
npm test > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "  ✅ Infrastructure tests passed"
else
    echo "  ❌ Infrastructure tests failed"
    exit 1
fi

# CDK synthesis
echo "  - CDK synthesis..."
npm run synth > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "  ✅ CDK synthesis successful"
else
    echo "  ❌ CDK synthesis failed"
    exit 1
fi

cd ..

echo ""
echo "🎉 All checks passed! Project setup is complete."
echo ""
echo "Next steps:"
echo "1. Start development: npm run dev"
echo "2. Setup local AWS: ./scripts/setup-local-aws.sh"
echo "3. Deploy infrastructure: cd infrastructure && npm run deploy:dev"