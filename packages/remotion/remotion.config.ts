import { Config } from '@remotion/cli/config';
import webpack from 'webpack';

Config.overrideWebpackConfig((config) => {
  // All Node.js built-in module names
  const nodeBuiltins: Record<string, boolean> = {
    assert: false, buffer: false, child_process: false, cluster: false,
    console: false, constants: false, crypto: false, dgram: false,
    dns: false, domain: false, events: false, fs: false,
    http: false, http2: false, https: false, module: false,
    net: false, os: false, path: false, perf_hooks: false,
    process: false, punycode: false, querystring: false, readline: false,
    repl: false, stream: false, string_decoder: false, sys: false,
    timers: false, tls: false, tty: false, url: false,
    util: false, v8: false, vm: false, worker_threads: false, zlib: false,
  };

  return {
    ...config,
    resolve: {
      ...config.resolve,
      fallback: {
        ...(config.resolve?.fallback as Record<string, unknown>),
        // Bun's .bun/ flat module layout confuses webpack's resolution of Node.js built-ins.
        ...nodeBuiltins,
      },
    },
    plugins: [
      ...(config.plugins ?? []),
      // Rewrite `node:xxx` imports to `xxx` (handled by fallback: false above)
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, '');
      }),
    ],
  };
});
