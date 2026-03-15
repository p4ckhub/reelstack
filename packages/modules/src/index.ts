/**
 * @reelstack/modules — ReelStack module implementations.
 *
 * Importing this module registers all available modules with the agent registry.
 * The slideshow module is always available (public, open-source).
 * Additional modules (n8n-explainer, ai-tips, presenter-explainer) are loaded
 * from src/private/ if available (private dev environment only).
 */

// Public modules
import './slideshow/module';
import './captions/module';

// Private modules (optional — only available in dev environments with access)
// Synchronous require — works in both bun runtime and Remotion webpack bundler
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  const pkgDir = path.dirname(require.resolve('@reelstack/modules/package.json'));
  const privateEntry = path.join(pkgDir, 'src', 'private', 'index.ts');
  if (fs.existsSync(privateEntry)) {
    require(privateEntry);
  }
} catch {
  // Private modules not available
}
