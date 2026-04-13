#!/usr/bin/env npx tsx
/**
 * Deploy Remotion Lambda infrastructure to AWS.
 *
 * Steps:
 * 1. Deploy Lambda function (if not exists)
 * 2. Deploy Remotion site to S3
 * 3. Print env vars to add to .env
 *
 * Prerequisites:
 *   - AWS credentials configured (env vars or ~/.aws/credentials)
 *   - AWS_REGION set
 *
 * Usage: npx tsx scripts/deploy-lambda.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const REMOTION_PKG_DIR = path.resolve(__dirname, '..');

// Node.js built-in list — all need to be stubbed for browser/Lambda bundle
const NODE_BUILTINS = [
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
];

// Intercepts node: scheme modules and redirects them to the stub.
// Uses both beforeResolve (strips prefix) AND afterResolve (overrides
// createData.resource) because webpack's Node target handler can re-add
// the node: prefix during resolution, causing UnhandledSchemeError at read time.
class RewriteNodePrefixPlugin {
  private stubPath: string;
  constructor(stubPath: string) {
    this.stubPath = stubPath;
  }
  apply(compiler: any) {
    compiler.hooks.normalModuleFactory.tap('RewriteNodePrefixPlugin', (nmf: any) => {
      nmf.hooks.beforeResolve.tap('RewriteNodePrefixPlugin', (data: any) => {
        if (data?.request?.startsWith('node:')) {
          data.request = data.request.slice(5);
        }
      });
      nmf.hooks.afterResolve.tap('RewriteNodePrefixPlugin', (data: any) => {
        if (!data?.createData) return;
        const resource: string = data.createData.resource ?? '';
        if (resource.startsWith('node:') || resource.startsWith('\0node:')) {
          data.createData.resource = this.stubPath;
          data.createData.resourceResolveData = undefined;
        }
      });
    });
  }
}

// Mirrors remotion.config.ts + handles Bun flat layout + node: scheme
const webpackOverride = (config: any): any => {
  const stubPath = path.resolve(REMOTION_PKG_DIR, 'src/__stubs__/empty.js');

  // Build alias map for bare module names (node: prefix handled by plugin above)
  const aliasMap: Record<string, string> = {};
  for (const mod of NODE_BUILTINS) {
    aliasMap[mod] = stubPath;
  }
  aliasMap['cross-spawn'] = stubPath;

  // Resolve monorepo packages (webpack can't follow bun workspace links)
  const packagesDir = path.resolve(REMOTION_PKG_DIR, '..');
  const nodeFs = require('fs');
  const pkgNames = nodeFs
    .readdirSync(packagesDir)
    .filter(
      (d: string) =>
        d !== 'modules' &&
        nodeFs.statSync(path.join(packagesDir, d)).isDirectory() &&
        nodeFs.existsSync(path.join(packagesDir, d, 'src', 'index.ts'))
    );
  for (const pkg of pkgNames) {
    aliasMap[`@reelstack/${pkg}`] = path.join(packagesDir, pkg, 'src', 'index.ts');
  }
  // Sub-path exports (e.g. @reelstack/remotion/components/highlight-modes)
  aliasMap['@reelstack/remotion'] = path.join(packagesDir, 'remotion', 'src');

  // Resolve private modules (external repo, NOT packages/modules)
  const extModulesPath = path.resolve(
    REMOTION_PKG_DIR,
    '..',
    '..',
    '..',
    'reelstack-modules',
    'src'
  );
  aliasMap['@reelstack/modules$'] = path.join(extModulesPath, 'index.ts');
  aliasMap['@reelstack/modules'] = extModulesPath;

  // Add monorepo root node_modules so webpack can resolve deps from external modules
  const monorepoRoot = path.resolve(REMOTION_PKG_DIR, '..', '..');
  const existingModules = config.resolve?.modules ?? ['node_modules'];

  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias ?? {}),
        ...aliasMap,
      },
      modules: [
        ...existingModules,
        path.join(monorepoRoot, 'node_modules'),
        path.join(REMOTION_PKG_DIR, 'node_modules'),
      ],
    },
    plugins: [...(config.plugins ?? []), new RewriteNodePrefixPlugin(stubPath)],
  };
};

async function main() {
  const region = process.env.AWS_REGION;
  if (!region) {
    console.error('Set AWS_REGION env var first (e.g. eu-central-1)');
    process.exit(1);
  }

  console.log('ReelStack — Lambda Deployment');
  console.log('═'.repeat(50));
  console.log(`Region: ${region}`);
  console.log('');

  // Dynamic imports to avoid bundling heavy AWS SDK
  const { deployFunction, deploySite, getFunctions, getOrCreateBucket } =
    await import('@remotion/lambda');

  // Step 1: Check for existing function or deploy new
  console.log('Step 1: Checking Lambda functions...');
  const existingFunctions = await getFunctions({
    region: region as any,
    compatibleOnly: true,
  });

  let functionName: string;

  if (existingFunctions.length > 0) {
    functionName = existingFunctions[0].functionName;
    console.log(`  Found existing function: ${functionName}`);
  } else {
    console.log('  Deploying new Lambda function...');
    const { functionName: newName } = await deployFunction({
      region: region as any,
      timeoutInSeconds: 240,
      memorySizeInMb: 2048,
      diskSizeInMb: 2048,
    });
    functionName = newName;
    console.log(`  Deployed: ${functionName}`);
  }

  // Step 2: Ensure S3 bucket exists
  console.log('');
  console.log('Step 2: Ensuring S3 bucket...');
  const { bucketName } = await getOrCreateBucket({
    region: region as any,
  });
  console.log(`  Bucket: ${bucketName}`);

  // Step 3: Deploy site (Remotion bundle) to S3
  console.log('');
  console.log('Step 3: Deploying Remotion site to S3...');

  // Use apps/web entry point to include private modules (highlight modes, scroll-stoppers)
  const entryPoint = path.resolve(REMOTION_PKG_DIR, '..', '..', 'apps', 'web', 'remotion-entry.ts');
  const { serveUrl, siteName } = await deploySite({
    region: region as any,
    entryPoint,
    siteName: 'reelstack',
    bucketName,
    options: {
      webpackOverride,
    },
  });

  console.log(`  Site: ${siteName}`);
  console.log(`  URL: ${serveUrl}`);

  // Step 4: Print env vars
  console.log('');
  console.log('═'.repeat(50));
  console.log('Add to your .env:');
  console.log('');
  console.log(`REMOTION_RENDERER=lambda`);
  console.log(`AWS_REGION=${region}`);
  console.log(`REMOTION_LAMBDA_FUNCTION_NAME=${functionName}`);
  console.log(`REMOTION_LAMBDA_SERVE_URL=${serveUrl}`);
  console.log('');
  console.log('═'.repeat(50));

  // Step 5: Test render (optional)
  if (process.argv.includes('--test')) {
    console.log('');
    console.log('Running test render...');
    const { renderMediaOnLambda } = await import('@remotion/lambda/client');
    const { getRenderProgress } = await import('@remotion/lambda/client');

    const { renderId, bucketName } = await renderMediaOnLambda({
      region: region as any,
      functionName,
      serveUrl,
      composition: 'Reel',
      codec: 'h264',
      inputProps: {
        layout: 'fullscreen',
        cues: [
          {
            id: '1',
            text: 'Lambda test render',
            startTime: 0,
            endTime: 2,
            animationStyle: 'karaoke',
            words: [
              { text: 'Lambda', startTime: 0, endTime: 0.7 },
              { text: 'test', startTime: 0.7, endTime: 1.3 },
              { text: 'render', startTime: 1.3, endTime: 2 },
            ],
          },
        ],
        captionStyle: {
          fontFamily: 'Outfit, sans-serif',
          fontSize: 48,
          fontColor: '#F5F5F0',
          fontWeight: 'bold',
          fontStyle: 'normal',
          backgroundColor: '#0E0E12',
          backgroundOpacity: 0.85,
          outlineColor: '#0E0E12',
          outlineWidth: 3,
          shadowColor: '#000000',
          shadowBlur: 12,
          position: 80,
          alignment: 'center',
          lineHeight: 1.3,
          padding: 14,
          highlightColor: '#F59E0B',
          upcomingColor: '#8888A0',
        },
        musicVolume: 0,
        showProgressBar: true,
        backgroundColor: '#0E0E12',
      },
    });

    console.log(`  Render ID: ${renderId}`);
    console.log(`  Bucket: ${bucketName}`);

    // Poll
    let done = false;
    while (!done) {
      const progress = await getRenderProgress({
        renderId,
        bucketName,
        functionName,
        region: region as any,
      });

      const pct = Math.round(progress.overallProgress * 100);
      process.stdout.write(`\r  Progress: ${pct}%`);

      if (progress.fatalErrorEncountered) {
        console.error('\n  FAILED:', progress.errors);
        process.exit(1);
      }

      if (progress.done) {
        done = true;
        console.log(`\n  Output: ${progress.outputFile}`);
      } else {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
}

main().catch((err) => {
  console.error('Deploy failed:', err.message ?? err);
  process.exit(1);
});
