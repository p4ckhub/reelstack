/**
 * Remotion bundle entry point for apps/web.
 *
 * This is the entry used by the local renderer and Remotion Studio.
 * It registers both core compositions (from @reelstack/remotion)
 * and private module compositions (from @reelstack/modules).
 *
 * Replaces packages/remotion/src/index.ts as the bundle entry
 * so that private modules can be included without circular deps.
 */
import { registerRoot } from 'remotion';
import { RemotionRoot } from '@reelstack/remotion/compositions/Root';

// Register private module compositions (n8n-explainer, ai-tips, presenter-explainer)
import '@reelstack/modules/remotion';

registerRoot(RemotionRoot);
