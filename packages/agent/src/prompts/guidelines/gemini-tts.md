Gemini 3.1 Flash TTS narration guidelines (use when writing scripts that will be voiced by Gemini TTS):

WRITE FOR THE EAR, NOT THE EYE

- One idea per sentence. Short clauses. Spoken cadence, not written prose.
- Contractions OK ("we'll", "it's"). They sound natural.
- Mark major beats with periods. Avoid semicolons — they don't shape rhythm in TTS.

POLISH SCRIPTS — ACRONYMS AND NUMBERS

- Write acronyms and numbers in their NATURAL form: "n8n", "API", "URL", "JSON",
  "327", "2026". Do NOT spell them phonetically in the script — the pipeline
  applies phonetic conversion (`makeTTSFriendly`) automatically before TTS,
  so "n8n" becomes "en-osiem-en" only in the audio. Captions must show the
  natural form — writing "En-osiem-en" in the script leaks phonetics into
  on-screen text.
- The same applies to numbers: write "327" or "2026" — the pipeline spells
  out large numbers / years for TTS but captions keep digits.
- English brand names (Remotion, Gemini, Claude): keep as-is — TTS pronounces
  them fine and captions render them correctly.

AUDIO TAGS — USE SPARINGLY (and only in narration fields, never in display fields)

- Tags are inline `[bracket]` modifiers that steer delivery.
- Maximum 1 tag per sentence. Stacking ([whispers] [excitedly]) breaks delivery.
- Tags MUST be in English even when the surrounding text is Polish.
- IMPORTANT: tags are stripped from captions before render. They steer the
  voice only. If a script structure exposes both a "display" field
  (slide.text, section.text shown on screen) and a "narration" field, put
  tags ONLY in the narration field. When the structure has just one field,
  use tags sparingly — captions will strip them but the bracket gap may
  briefly affect the visual rhythm.
- Useful tags by intent:
  • [curious] — rhetorical questions, set-up moments
  • [serious] — claims, warnings, payoff lines
  • [excitedly] — hooks, big reveals
  • [whispers] — intimate insight or secret reveal
  • [short pause] — ~250ms beat after a key term
  • [medium pause] — ~500ms beat between sections
- Don't sprinkle tags decoratively. One tag should change the listener's mental state.

PACING (Polish narration)

- Target ~140 words per minute (slower than English's ~165 wpm).
- Insert [short pause] after a node name, technical term, or proper noun.
- Insert [medium pause] between major sections in longer narrations.

LONG-FORM (>200 words / >90s)

- Re-anchor the speaker identity ~every 200 words: a single sentence reminding
  who's speaking and the tone ("Pawel here, picking up — same calm tone.")
  prevents the voice drifting to neutral.

SCRIPT IS THE ENTIRE OUTPUT

- Do NOT include direction prose like "Pawel says:" or "(in a calm voice)".
  Direction belongs in the voicePrompt, not the spoken script.
- Do NOT name the speaker in the script unless the speaker actually says it.

TONE FOR TSA / REELSTACK CONTENT

- Polish solo founder voice: confident, calm, slightly conspiratorial.
- "Coffee with a friend" register, not corporate.
- End on an actionable, declarative beat — not a question.
