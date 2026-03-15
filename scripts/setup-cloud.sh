#!/bin/bash
set -e

echo "=== Subtitle Burner Cloud Setup ==="

# Check CLI tools
for cmd in vercel supabase; do
  if ! command -v "$cmd" &> /dev/null; then
    echo "Error: $cmd CLI not found. Install it first."
    exit 1
  fi
done

echo "1. Setting up Supabase..."
echo "   - Create a new project at https://supabase.com/dashboard"
echo "   - Copy the project URL and anon key"
echo ""

echo "2. Deploy to Vercel..."
echo "   Running: vercel deploy --prod"
echo ""

read -p "Have you set up Supabase and have the URL + anon key? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Please set up Supabase first, then re-run."
  exit 1
fi

# Deploy
vercel deploy --prod

echo ""
echo "3. Set environment variables in Vercel dashboard:"
echo "   - NEXT_PUBLIC_SUPABASE_URL"
echo "   - NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "   - DATABASE_URL (Supabase connection string)"
echo ""
echo "4. Run migrations:"
echo "   bunx prisma migrate deploy --schema=packages/database/prisma/schema.prisma"
echo ""
echo "=== Cloud setup guide complete ==="
