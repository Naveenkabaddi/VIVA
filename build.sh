#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "Building Frontend..."
npm install --prefix frontend
npm run build --prefix frontend

echo "Installing Backend dependencies..."
pip install --upgrade pip
pip install -r backend/requirements.txt

echo "Build completed successfully!"
