#!/usr/bin/env bun
/**
 * Cleanup old rendered files from storage.
 * Usage: bun run scripts/cleanup-storage.ts [--days 30] [--dry-run]
 */
import { prisma } from '@reelstack/database';
import { Client } from 'minio';

// --- Parse args ---
const args = process.argv.slice(2);

function getArgValue(flag: string, defaultVal: string): string {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return defaultVal;
  return args[idx + 1];
}

const daysThreshold = parseInt(getArgValue('--days', '30'), 10);
const dryRun = args.includes('--dry-run');

if (isNaN(daysThreshold) || daysThreshold < 1) {
  console.error('Error: --days must be a positive integer');
  process.exit(1);
}

// --- MinIO client ---
const endpoint = process.env.MINIO_ENDPOINT;
if (!endpoint) {
  console.error('Error: MINIO_ENDPOINT is not set. Cannot connect to storage.');
  process.exit(1);
}

const minio = new Client({
  endPoint: endpoint,
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});

const bucket = process.env.MINIO_BUCKET || 'subtitle-burner';

// --- Query old jobs ---
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

console.log(`Looking for jobs completed/failed before ${cutoffDate.toISOString()} (${daysThreshold} days ago)`);
if (dryRun) {
  console.log('[DRY RUN] No files will be deleted.\n');
}

const jobs = await prisma.reelJob.findMany({
  where: {
    status: { in: ['COMPLETED', 'FAILED'] },
    completedAt: { lt: cutoffDate },
  },
  select: {
    id: true,
    status: true,
    completedAt: true,
  },
});

console.log(`Found ${jobs.length} jobs older than ${daysThreshold} days.\n`);

let deletedCount = 0;
let freedBytes = 0;
let errorCount = 0;

for (const job of jobs) {
  const objectPath = `reels/${job.id}/output.mp4`;

  try {
    // Try to get object stats (size) before deleting
    const stat = await minio.statObject(bucket, objectPath);
    const sizeBytes = stat.size;

    if (dryRun) {
      console.log(`[DRY RUN] Would delete: ${objectPath} (${formatBytes(sizeBytes)}) - ${job.status} at ${job.completedAt?.toISOString()}`);
    } else {
      await minio.removeObject(bucket, objectPath);
      console.log(`Deleted: ${objectPath} (${formatBytes(sizeBytes)})`);
    }

    deletedCount++;
    freedBytes += sizeBytes;
  } catch (err: unknown) {
    // Object might not exist (e.g., failed jobs with no output)
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'NotFound') {
      // Silently skip - no file to delete
      continue;
    }
    errorCount++;
    console.error(`Error processing ${objectPath}: ${err instanceof Error ? err.message : err}`);
  }
}

// --- Summary ---
console.log('\n--- Summary ---');
console.log(`Jobs processed:  ${jobs.length}`);
console.log(`Files ${dryRun ? 'to delete' : 'deleted'}:   ${deletedCount}`);
console.log(`Space ${dryRun ? 'to free' : 'freed'}:     ${formatBytes(freedBytes)}`);
if (errorCount > 0) {
  console.log(`Errors:          ${errorCount}`);
}

await prisma.$disconnect();

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
