/**
 * Presenter persona registry — extensible catalog of avatar personas.
 *
 * Public API: registerPersona(), getPersona(), listPersonas().
 * Private modules register their personas on import.
 */

// ── Persona interface ────────────────────────────────────────

export interface PresenterPersona {
  id: string;
  name: string;
  /** Reference image prompt for AI avatar generation */
  avatarPrompt: string;
  /** Default scenery/background for the avatar */
  scenery: string;
  /** Narration style guidance for LLM script generation */
  narrationStyle: string;
  /** Anchor tag / branding (e.g. @AnimatedDev) */
  anchorTag: string;
  /** Default TTS voice ID */
  defaultVoice?: string;
  /** Default layout for this persona */
  defaultLayout?: 'fullscreen' | 'hybrid-anchor' | 'anchor-bottom' | 'split-screen';
  /** How the avatar is framed in the video */
  avatarFraming?: 'bottom-aligned' | 'centered' | 'top-aligned';
}

// ── Registry ─────────────────────────────────────────────────

const registry = new Map<string, PresenterPersona>();

/** Register a persona. Can be called by external modules. */
export function registerPersona(persona: PresenterPersona): void {
  registry.set(persona.id, persona);
}

/** Get a persona by ID. Returns undefined if not found. */
export function getPersona(id: string): PresenterPersona | undefined {
  return registry.get(id);
}

/** List all registered personas. */
export function listPersonas(): readonly PresenterPersona[] {
  return [...registry.values()];
}
