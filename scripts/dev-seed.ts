/**
 * Dev seed: creates a test user + API key for local Bruno API testing.
 * Usage: bun scripts/dev-seed.ts
 */
import crypto from 'node:crypto';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/subtitle_burner';
const DEV_API_KEY = 'rs_test_devSeedKey00000000000000000001';
const KEY_PREFIX = DEV_API_KEY.slice(0, 18); // 'rs_test_devSeedKe'

function hashKey(key: string) {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

const { sql } = await import('bun');
const db = new sql(DATABASE_URL);

try {
  const [user] = await db`
    INSERT INTO "User" (id, email, name, tier, "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), 'dev@test.local', 'Dev Tester', 'PRO', NOW(), NOW())
    ON CONFLICT (email) DO UPDATE SET "updatedAt" = NOW()
    RETURNING id, email
  `;

  await db`DELETE FROM "ApiKey" WHERE "userId" = ${user.id} AND "keyPrefix" = ${KEY_PREFIX}`;

  const keyHash = hashKey(DEV_API_KEY);
  const [key] = await db`
    INSERT INTO "ApiKey" (id, "userId", "keyHash", "keyPrefix", name, scopes, "isActive", "createdAt")
    VALUES (gen_random_uuid(), ${user.id}, ${keyHash}, ${KEY_PREFIX}, 'Bruno dev key', '["*"]'::jsonb, true, NOW())
    RETURNING id
  `;

  console.log('✅ Seed complete');
  console.log(`   User:    ${user.email} (${user.id})`);
  console.log(`   API Key: ${DEV_API_KEY}`);
  console.log(`   Key ID:  ${key.id}`);
  console.log('');
  console.log('Zaktualizuj bruno/reelstack/environments/local.bru:');
  console.log(`   apiKey: ${DEV_API_KEY}`);
} finally {
  await db.end();
}
