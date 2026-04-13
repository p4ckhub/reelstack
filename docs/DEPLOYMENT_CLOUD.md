# Cloud Deployment (Vercel + Supabase Storage)

## Prerequisites

- [Vercel](https://vercel.com) account
- [Supabase](https://supabase.com) account (for storage only)
- [Inngest](https://inngest.com) account (for server-side rendering)
- PostgreSQL database (Supabase, Neon, or any provider)

## Steps

### 1. Create PostgreSQL database

Use any PostgreSQL provider. If using Supabase:

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Note the **Connection string** from Settings > Database.

### 2. Run Migrations

```bash
DATABASE_URL="your-connection-string" ./node_modules/.bin/prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

### 3. Create Storage Bucket (Supabase)

In Supabase Dashboard > Storage, create a bucket named `reelstack`.
Note the **Project URL** and **Service Role Key** from Settings > API.

### 4. Deploy to Vercel

```bash
vercel deploy --prod
```

Or connect the GitHub repo to Vercel for automatic deployments.

### 5. Set Environment Variables

In Vercel Dashboard > Settings > Environment Variables:

```
AUTH_SECRET=<generate with: openssl rand -base64 32>
DATABASE_URL=postgresql://...

# Supabase (storage only — NOT used for auth)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=reelstack

# Inngest (for server-side rendering)
INNGEST_EVENT_KEY=your-event-key
INNGEST_SIGNING_KEY=your-signing-key

# Optional: magic link emails
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_xxxxx
EMAIL_FROM=noreply@yourdomain.com
```

### 6. Set Up Inngest (Optional — for server rendering)

1. Sign up at [inngest.com](https://inngest.com).
2. Add your Vercel deployment URL to Inngest.
3. The `/api/inngest` endpoint will automatically register the render function.

## Verify

```bash
curl https://your-app.vercel.app/api/health
```

Expected response:

```json
{ "status": "ok", "mode": "cloud", "db": true, "timestamp": "..." }
```
