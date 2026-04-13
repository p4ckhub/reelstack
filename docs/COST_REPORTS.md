# Cost Reports (SQL)

All queries run on `ReelJob.productionMeta` JSON field. No extra tables needed.

## Per Reel

```sql
-- Cost breakdown per reel
SELECT
  id,
  "createdAt",
  (productionMeta->'costs'->>'totalUSD')::numeric as total_usd,
  productionMeta->'costs'->'byType' as by_type,
  productionMeta->'costs'->'byProvider' as by_provider
FROM "ReelJob"
WHERE productionMeta->'costs' IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 50;
```

## Per Type (video / image / llm / tts / transcription)

```sql
-- Total cost by type across all reels
SELECT
  entry->>'type' as type,
  COUNT(*) as calls,
  ROUND(SUM((entry->>'costUSD')::numeric), 4) as total_usd,
  ROUND(AVG((entry->>'costUSD')::numeric), 5) as avg_per_call
FROM "ReelJob",
  jsonb_array_elements(productionMeta->'costs'->'entries') as entry
GROUP BY type
ORDER BY total_usd DESC;
```

## Per Provider (anthropic / vertex-ai / fal / pexels / edge-tts ...)

```sql
-- Total cost by provider
SELECT
  entry->>'provider' as provider,
  entry->>'type' as type,
  COUNT(*) as calls,
  ROUND(SUM((entry->>'costUSD')::numeric), 4) as total_usd
FROM "ReelJob",
  jsonb_array_elements(productionMeta->'costs'->'entries') as entry
GROUP BY provider, type
ORDER BY total_usd DESC;
```

## Per Model (claude-opus-4-6 / claude-sonnet-4-6 / veo-3.1 ...)

```sql
-- LLM cost by model
SELECT
  entry->>'model' as model,
  COUNT(*) as calls,
  ROUND(SUM((entry->>'costUSD')::numeric), 4) as total_usd,
  SUM((entry->>'inputUnits')::int) as total_input_tokens,
  SUM((entry->>'outputUnits')::int) as total_output_tokens
FROM "ReelJob",
  jsonb_array_elements(productionMeta->'costs'->'entries') as entry
WHERE entry->>'type' = 'llm'
GROUP BY model
ORDER BY total_usd DESC;
```

## Monthly Spend

```sql
-- Monthly cost by type
SELECT
  date_trunc('month', "createdAt") as month,
  entry->>'type' as type,
  COUNT(DISTINCT "ReelJob".id) as reels,
  ROUND(SUM((entry->>'costUSD')::numeric), 2) as total_usd
FROM "ReelJob",
  jsonb_array_elements(productionMeta->'costs'->'entries') as entry
GROUP BY month, type
ORDER BY month DESC, total_usd DESC;
```

## Monthly Spend by Provider

```sql
-- Monthly cost by provider
SELECT
  date_trunc('month', "createdAt") as month,
  entry->>'provider' as provider,
  ROUND(SUM((entry->>'costUSD')::numeric), 2) as total_usd
FROM "ReelJob",
  jsonb_array_elements(productionMeta->'costs'->'entries') as entry
GROUP BY month, provider
ORDER BY month DESC, total_usd DESC;
```

## Per User

```sql
-- Cost per user (top spenders)
SELECT
  "userId",
  COUNT(*) as reels,
  ROUND(SUM((productionMeta->'costs'->>'totalUSD')::numeric), 2) as total_usd,
  ROUND(AVG((productionMeta->'costs'->>'totalUSD')::numeric), 3) as avg_per_reel
FROM "ReelJob"
WHERE productionMeta->'costs' IS NOT NULL
GROUP BY "userId"
ORDER BY total_usd DESC;
```

## Average Cost Per Reel

```sql
-- Average reel cost by month
SELECT
  date_trunc('month', "createdAt") as month,
  COUNT(*) as reels,
  ROUND(AVG((productionMeta->'costs'->>'totalUSD')::numeric), 3) as avg_cost,
  ROUND(MAX((productionMeta->'costs'->>'totalUSD')::numeric), 3) as max_cost,
  ROUND(SUM((productionMeta->'costs'->>'totalUSD')::numeric), 2) as total_cost
FROM "ReelJob"
WHERE productionMeta->'costs' IS NOT NULL
GROUP BY month
ORDER BY month DESC;
```

## Most Expensive Reels

```sql
-- Top 10 most expensive reels
SELECT
  id,
  "createdAt",
  (productionMeta->'costs'->>'totalUSD')::numeric as total_usd,
  jsonb_array_length(productionMeta->'costs'->'entries') as api_calls,
  productionMeta->'costs'->'byType' as breakdown
FROM "ReelJob"
WHERE productionMeta->'costs' IS NOT NULL
ORDER BY (productionMeta->'costs'->>'totalUSD')::numeric DESC
LIMIT 10;
```

## Video Generation Costs (detailed)

```sql
-- Video generation: cost per tool per duration
SELECT
  entry->>'provider' as provider,
  entry->>'model' as model,
  COUNT(*) as generations,
  ROUND(SUM((entry->>'costUSD')::numeric), 3) as total_usd,
  ROUND(AVG((entry->>'costUSD')::numeric), 4) as avg_cost,
  SUM((entry->>'inputUnits')::int) as total_requests
FROM "ReelJob",
  jsonb_array_elements(productionMeta->'costs'->'entries') as entry
WHERE entry->>'type' = 'video'
GROUP BY provider, model
ORDER BY total_usd DESC;
```

## Image Generation Costs

```sql
-- Image generation by provider
SELECT
  entry->>'provider' as provider,
  COUNT(*) as images,
  ROUND(SUM((entry->>'costUSD')::numeric), 4) as total_usd
FROM "ReelJob",
  jsonb_array_elements(productionMeta->'costs'->'entries') as entry
WHERE entry->>'type' = 'image'
GROUP BY provider
ORDER BY total_usd DESC;
```

## Cost Over Time (daily)

```sql
-- Daily cost trend
SELECT
  date_trunc('day', "createdAt") as day,
  COUNT(*) as reels,
  ROUND(SUM((productionMeta->'costs'->>'totalUSD')::numeric), 2) as total_usd
FROM "ReelJob"
WHERE productionMeta->'costs' IS NOT NULL
  AND "createdAt" > now() - interval '30 days'
GROUP BY day
ORDER BY day;
```
