/**
 * Remotion composition registration barrel.
 *
 * Registers the public slideshow composition, plus any private
 * compositions if available.
 */

// Public compositions
import '../slideshow/remotion/index';

// Private compositions (optional)
// Synchronous check + require — works in both bun runtime and Remotion webpack bundler
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  const pkgDir = path.dirname(require.resolve('@reelstack/modules/package.json'));
  const privateEntry = path.join(pkgDir, 'src', 'private', 'remotion', 'index.ts');
  if (fs.existsSync(privateEntry)) {
    require(privateEntry);
  }
} catch {
  // Private compositions not available
}
