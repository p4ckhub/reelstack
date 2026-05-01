/**
 * Open-source baseline preset. Premium presets register themselves
 * from the private modules overlay (see `packages/modules/src/private/
 * agent/hf-captions/`). Importing this barrel guarantees at least
 * `text` exists in the registry on a fresh boot.
 */
import './text';
