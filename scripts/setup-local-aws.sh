#!/bin/bash

# Setup script for local AWS development environment

echo "Setting up local AWS development environment..."

# Start LocalStack services
echo "Starting LocalStack services..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for LocalStack to be ready
echo "Waiting for LocalStack to be ready..."
sleep 10

# Configure AWS CLI for LocalStack
echo "Configuring AWS CLI for LocalStack..."
aws configure set aws_access_key_id test --profile localstack
aws configure set aws_secret_access_key test --profile localstack
aws configure set region us-east-1 --profile localstack

# Create S3 buckets for development
echo "Creating S3 buckets..."
aws --endpoint-url=http://localhost:4566 --profile localstack s3 mb s3://voislab-website-dev-local
aws --endpoint-url=http://localhost:4566 --profile localstack s3 mb s3://voislab-media-dev-local

# Enable S3 website hosting
echo "Configuring S3 website hosting..."
aws --endpoint-url=http://localhost:4566 --profile localstack s3 website s3://voislab-website-dev-local --index-document index.html --error-document error.html

echo "Local AWS environment setup complete!"
echo "LocalStack Dashboard: http://localhost:4566"
echo "DynamoDB Admin: http://localhost:8001"
echo ""
echo "To deploy infrastructure locally:"
echo "cd infrastructure && npm run cdk -- deploy --profile localstack --context environment=dev"