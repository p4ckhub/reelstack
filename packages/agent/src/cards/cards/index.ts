/**
 * Open-source HF card baseline. Only `text` ships here — every premium
 * animated card (shimmer / glitch / hormozi / …) lives in the private
 * modules overlay and registers itself via `registerHfCard()` during a
 * side-effect import (see `packages/modules/src/private/agent/hf-cards/`).
 *
 * Importing this file is enough to guarantee at least one builder exists
 * in the registry, so the dispatcher never returns `''` on a fresh boot
 * even if the overlay isn't synced yet.
 */
import './text';
