/**
 * Remotion module registration barrel.
 *
 * Imports trigger self-registration of module compositions.
 * When modules are extracted to closed repos, remove these imports.
 * The consuming app will import from external packages instead:
 *
 *   import '@reelstack-modules/n8n-explainer/remotion';
 *   import '@reelstack-modules/ai-tips/remotion';
 */

// Public compositions
import '../compositions/VideoClipRegistration';

// Private module compositions are registered by the consuming app (apps/web).
// See apps/web/remotion-entry.ts — it imports @reelstack/modules/remotion
// which triggers self-registration before the bundle renders.
