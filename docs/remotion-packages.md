# Remotion packages — use-what, when, why

Decision guide zanim zaczniesz pisać nowy komponent/pipeline. Sprawdź najpierw tę tabelę — jeśli Remotion ma oficjalną paczkę pokrywającą 80% potrzeby, **nie pisz od zera**.

Ostatni review: **2026-04-18**. Sprawdzaj przy każdym upgrade Remotion.

## Szybka ściąga

**Kiedy sprawdzić ten dokument:**

- Zaczynasz nową kartę / transition / effect i zastanawiasz się "napisać samemu czy szukać?"
- Planujesz integrację TTS / caption / transcoding
- Widzisz że piszesz dużo ręcznego SVG/path math — pewnie jest helper
- Upgrade Remotion do nowej major wersji — zawsze re-review

**Kiedy NIE sprawdzać:**

- Małe inline styling (nie warto dodawać deps dla 5 linijek CSS)
- Animacja która jest unikatowa dla naszego brandu (customowy creative work)

## Zainstalowane (stan na 2026-04-18)

| Paczka                     | Wersja  | Licencja | Gdzie używana u nas                                                                                                                |
| -------------------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `remotion`                 | 4.0.431 | RLA      | Wszędzie — core hooks, `AbsoluteFill`, `interpolate`, `spring`, `random`                                                           |
| `@remotion/bundler`        | 4.0.431 | RLA      | CLI only (`remotion bundle` przez worker)                                                                                          |
| `@remotion/cli`            | 4.0.431 | RLA      | CLI only (`remotion studio`, `remotion render`)                                                                                    |
| `@remotion/renderer`       | 4.0.431 | RLA      | Worker rendering + test types                                                                                                      |
| `@remotion/lambda`         | 4.0.431 | RLA      | Produkcyjny rendering na AWS Lambda                                                                                                |
| `@remotion/player`         | 4.0.431 | RLA      | Zainstalowana, nieużywana (zarezerwowana dla przyszłego preview UI)                                                                |
| `@remotion/google-fonts`   | 4.0.301 | RLA      | Font loading: Inter, JetBrainsMono, Outfit, Montserrat, Poppins, Roboto, Ubuntu                                                    |
| `@remotion/transitions`    | 4.0.431 | RLA      | `packages/remotion/src/transitions/` + 21 card/transition presetów w `reelstack-modules`                                           |
| `@remotion/motion-blur`    | 4.0.431 | **MIT**  | `Trail` w transitions `zoom-punch`/`warp-zoom`/`push-horizontal` + karcie `warp-speed`                                             |
| `@remotion/noise`          | 4.0.431 | **MIT**  | `noise2D` wobble w kartach `liquid`/`ink-splash` + VHS drift/jitter w `retro-vhs`                                                  |
| `@remotion/sfx`            | 4.0.431 | **MIT**  | Per-transition whoosh/impact URLs via `TRANSITION_SFX_MAP`. Wire'owane w transitions-demo. Pipeline-level wiring jeszcze odłożone. |
| `@remotion/layout-utils`   | 4.0.431 | **MIT**  | `fitText()` auto-size w kartach `stat-card`, `wave-text`, `quote-card`.                                                            |
| `@remotion/light-leaks`    | 4.0.431 | RLA      | Transition `organic-light-leak` (WebGL shape leak, alternatywa dla naszego `light-leak` sweep).                                    |
| `@remotion/lottie`         | 4.0.431 | RLA      | Karta `emoji-burst` renderuje Google Fonts Noto Emoji Lottie JSON z CDN.                                                           |
| `@remotion/animated-emoji` | 4.0.431 | RLA      | Emoji name/codepoint data dla `emoji-burst`. `<AnimatedEmoji>` sam nieużywany (brak assetów w public).                             |
| `@remotion/three`          | 4.0.431 | **MIT**  | Karta `3d-frame` — rotujący 3D slab z headline'em. Wymaga `three` + `@react-three/fiber`.                                          |
| `@remotion/media-utils`    | 4.0.431 | **MIT**  | `useAudioData` + `visualizeAudio` w karcie `beat-pulse` (audio-reactive).                                                          |
| `@remotion/paths`          | 4.0.431 | **MIT**  | Transitive (via transitions). Nie importujemy bezpośrednio jeszcze.                                                                |
| `@remotion/shapes`         | 4.0.431 | **MIT**  | Transitive (via transitions). Nie importujemy bezpośrednio jeszcze.                                                                |
| `@remotion/media-parser`   | 4.0.431 | RLA      | Transitive, nieużywana                                                                                                             |

## Masz custom, istnieje oficjalne — kiedy zastępować

| Nasz kod                                                                     | Oficjalna paczka             | Co robi oficjalna                                                                                                          | Werdykt                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/remotion/src/components/CaptionOverlay.tsx` + `highlight-modes.ts` | `@remotion/captions`         | Tylko **data layer**: `createTikTokStyleCaptions()` do paginowania, `parseSrt`, `parseVtt`, `serializeSrt`. NIE renderuje. | **Mieć obie.** Zainstaluj dla parsera SRT/VTT gdy user wrzuci napisy z zewnątrz. Zostaw nasz CaptionOverlay jako renderer (8 highlight modes, single-word mode, custom outline). |
| Whisper pipeline w `apps/web/worker/`                                        | `@remotion/openai-whisper`   | Wrapper nad OpenAI API                                                                                                     | **Zostaw nasz.** Nasz ma whisper.cpp lokalnie (bez $) + OpenAI fallback, więcej kontroli.                                                                                        |
| ElevenLabs w `packages/agent/`                                               | `@remotion/elevenlabs`       | Wrapper z `delayRender()`                                                                                                  | **Review przed decyzją.** Może dać lepszą integrację z Remotion render lifecycle. Low priority.                                                                                  |
| Ad-hoc easing / stagger w kartach                                            | `@remotion/animation-utils`  | Stagger, bounce, delay helpers                                                                                             | **Rozważ jeśli piszemy staggered list animations.** Obecnie nie. Core `interpolate` + `spring` wystarczają.                                                                      |
| Hardcoded fontSize w kartach                                                 | `@remotion/layout-utils`     | `fitText()` auto-size dla boksa                                                                                            | **Warto dodać.** Kilka minut roboty, znika problem za-długich headline-ów.                                                                                                       |
| `retro-vhs` grain + `shimmer` ring                                           | `@remotion/rounded-text-box` | Preset "text w rounded pill"                                                                                               | **Nie zastępuje.** Pokrywa tylko 20% naszego use-case. Zostaw custom.                                                                                                            |

## Candidates — warto dodać, dają prawdziwy unlock

Posortowane od **high impact / low effort**:

### Must-have — dodaj gdy dojdzie naturalny moment

| Paczka                     | Licencja | Unlock                                                                               | Status                                                                                                                                               |
| -------------------------- | -------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@remotion/motion-blur`    | MIT      | `Trail` (lightweight DOM-duplikat) + `CameraMotionBlur` (drogi)                      | **DONE 2026-04-18** — `Trail` w `zoom-punch`, `warp-zoom`, `push-horizontal`, `warp-speed`. `CameraMotionBlur` świadomie NIE używamy (koszt Lambda). |
| `@remotion/noise`          | MIT      | `noise2D(seed, x, y)` — simplex noise (-1..1)                                        | **DONE 2026-04-18** — zastąpił `Math.sin` wobble w `liquid`, `ink-splash`. Tracking drift + head-jitter w `retro-vhs`.                               |
| `@remotion/sfx`            | MIT      | 7 normalized SFX (whip/whoosh/pageTurn/uiSwitch/mouseClick/shutterModern/shutterOld) | **DONE 2026-04-18** — `TRANSITION_SFX_MAP` + wire w `TransitionsDemoComposition`. Full pipeline wiring (composition-assembler) — odłożone.           |
| `@remotion/lottie`         | RLA      | Renderowanie Lottie files                                                            | **DONE 2026-04-18** — karta `emoji-burst` renderuje Google Fonts Noto Emoji.                                                                         |
| `@remotion/light-leaks`    | RLA      | WebGL shape light leak                                                               | **DONE 2026-04-18** — transition `organic-light-leak` (alternatywa dla naszego liniowego `light-leak`).                                              |
| `@remotion/animated-emoji` | RLA      | Google Fonts animated emoji                                                          | **DONE 2026-04-18** — używamy danych (name→codepoint). Komponent nieaktywny (brak webm/mp4 assets w public).                                         |
| `@remotion/three`          | MIT      | React Three Fiber integration                                                        | **DONE 2026-04-18** — karta `3d-frame` (rotujący 3D slab).                                                                                           |
| `@remotion/media-utils`    | MIT      | `useAudioData` + `visualizeAudio`                                                    | **DONE 2026-04-18** — karta `beat-pulse` (audio-reactive waveform ring + pulse na peaks).                                                            |
| `@remotion/layout-utils`   | MIT      | `fitText()`                                                                          | **DONE 2026-04-18** — wire'owane w `stat-card`, `wave-text`, `quote-card`.                                                                           |
| `@remotion/captions`       | RLA      | `parseSrt` / `parseVtt` / `createTikTokStyleCaptions`                                | Gdy user wrzuca zewnętrzne napisy. Nie potrzeba pisać parsera.                                                                                       |

### Nice-to-have — specyficzne use cases

| Paczka                     | Licencja | Unlock                      | Kiedy dodać                                                                                    |
| -------------------------- | -------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| `@remotion/light-leaks`    | RLA      | Vintage light leak overlay  | Pack "Super8" / rozszerzenie `retro-vhs`.                                                      |
| `@remotion/sfx`            | RLA      | Sound effects library       | Dźwięki do transitions (portal whoosh, zoom-punch click, shatter crash). Ogromny boost feel-u. |
| `@remotion/animated-emoji` | RLA      | Apple-style animowane emoji | `burst`, `subscribe-bell`, `countdown-punch` — latające emoji. Viral feature.                  |
| `@remotion/gif`            | RLA      | Render do GIF               | Social thumbnails, OG embeds.                                                                  |
| `@remotion/tailwind-v4`    | RLA      | Tailwind CSS w Remotion     | Tylko jeśli zechcesz migrować style-writing workflow. Nasze karty są inline-style.             |

### Skip na teraz — overkill albo niepotrzebne

| Paczka                  | Dlaczego skip                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@remotion/skia`        | GPU 2D, heavyweight. Nasze 80 particle (`burst`) działa spoko w DOM. Przydatne gdy zaczniesz tysięce cząstek. |
| `@remotion/three`       | Three.js / R3F. Overkill dla reelsów.                                                                         |
| `@remotion/rive`        | Rive animations. Nie wiemy czy user ma Rive content.                                                          |
| `@remotion/convert`     | Konwersja formatów. Niepotrzebne dla naszego pipeline.                                                        |
| `@remotion/enable-scss` | SCSS support. Inline style jest OK.                                                                           |
| `@remotion/cloudrun`    | Alternative Lambda (GCP). Lambda działa.                                                                      |

## Paczki-które-my-już-mamy-ale-świadomie-nie-używamy

- **`@remotion/paths`** — transitive via `@remotion/transitions`. Daje `evolvePath()`, `getLength()`, `getPointAtLength()`. Mógłby zastąpić nasz ręczny Bezier w `neon-circuit` (elektryczny pulse wzdłuż path) i `ink-splash` (wobble blob). **Warto świadomie używać gdy będziemy polerować SVG animacje.**
- **`@remotion/shapes`** — transitive. Pre-built `<Triangle>`, `<Star>`, `<Heart>`, `<Pie>`, `<Polygon>`. Dla przyszłych kart: `award-reveal` (star), `heart-burst`, `pie-reveal`.
- **`@remotion/media-utils`** — transitive. `visualizeAudio()` (waveform), `getAudioData()`, `getVideoMetadata()`. **Warto użyć** gdy dodamy waveform visualization do presenter cards.
- **`@remotion/media-parser`** — transitive. Auto-detect długości voiceover / fps uploadów. Mały win gdy orchestrator przyjmuje user-uploaded media.

## Zasady decyzyjne

Przed napisaniem custom komponentu, odpowiedz sobie:

1. **Czy oficjalna paczka pokrywa ≥80% use case?**
   - TAK → użyj oficjalnej + własny thin wrapper dla specyfiki
   - NIE → sprawdź pyt. 2

2. **Czy to creative differentiator naszego brandu?**
   - TAK → pisz custom (różnorodność marki)
   - NIE → sprawdź pyt. 3

3. **Czy piszemy dużo ręcznej matematyki (path, noise, stagger)?**
   - TAK → jest na to helper (paths, noise, animation-utils)
   - NIE → custom OK, nie ma co dodawać deps

4. **Czy wymaga fixu licznika (licenseKey)?**
   - TAK → sprawdź `remotion-license-strategy.md` w vault

## Historia zmian

| Data       | Zmiana                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-18 | **Wow-factor sweep Tier 1+2** — +sfx, +lottie, +light-leaks, +animated-emoji, +three + @react-three/fiber + three, +media-utils, +layout-utils. Nowe karty: `emoji-burst`, `3d-frame`, `beat-pulse`. Nowa transition: `organic-light-leak`. `fitText()` w 3 kartach tekstowych. SFX wire w transitions-demo. |
| 2026-04-18 | Dodane `@remotion/motion-blur` + `@remotion/noise` (oba MIT). `Trail` w 3 transitions + 1 karcie. `noise2D` zastąpił `Math.sin` wobble w 3 kartach. Lottie odłożone.                                                                                                                                         |
| 2026-04-17 | Initial write-up po audycie pakietów. 7 oficjalnych zainstalowanych + 5 transitive. Custom implementacje: CaptionOverlay, Whisper pipeline, ElevenLabs integration.                                                                                                                                          |

## Wow-factor research (2026-04-18)

Wyniki audytu Remotion's own use-cases, templates, i paczek pod kątem features które dają prawdziwy "wow" dla reel-contentu.

### Ranked wow-factor candidates

**Tier 1 — high impact, low effort (days of work):**

| Paczka                     | Wow co robi                                                                                         | Jak użyć u nas                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@remotion/light-leaks`    | WebGL-based organic light leak z `seed` + `hueShift` prop. Prawdziwy filmowy efekt, nie ręczny SVG. | Dodać jako drugi wariant transition `organic-light-leak` (wersja WebGL). Porównać z naszą ręczną.                                                    |
| `@remotion/animated-emoji` | Google Fonts animated emoji (CC BY 4.0). 🎉⭐💥❤️ jako gotowe animacje.                             | Nowa karta `emoji-burst` (confetti animowanych emoji), plus per-shot overlay `emoji-react` (float-up emoji jak Twitch). Bardzo viral w short-formie. |
| `@remotion/layout-utils`   | `fitText()` auto-scale'uje fontSize do boksa, bez hardcoded wartości.                               | Wire w karty text-heavy (`wave-text`, `quote-card`, `stat-card`). Koniec z overflow przy długich polskich headline'ach.                              |
| `@remotion/sfx`            | Normalized sound effects library (-3dB peak). Whoosh/impact/zip/notification/keystroke.             | Dodać SFX do transitions (whip-pan → whoosh, zoom-punch → impact, pixel-dissolve → glitch-noise). +feel, +polish, darmowe licencyjnie.               |

**Tier 2 — high impact, medium effort (week):**

| Paczka / Pattern        | Wow co robi                                                                                                          | Jak użyć u nas                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@remotion/three` + R3F | Real 3D w Remotion. Template "3D phone z video inside" = ogromny wow. `useVideoTexture()` maps reel jako 3D surface. | Karta `3d-frame`: reel renderuje się w środku rotującego telefonu / laptopa / floating screen. TSA audience (solopreneurs) to kocha — "ten tool na 3D device" = premium feel. |
| Audio-reactive cards    | `useAudioData()` + `visualizeAudio()` z `@remotion/media-utils`. Karta reaguje na voiceover amplitude.               | Karta `waveform-card`: waveform rośnie z głośnością mowy. Karta `beat-pulse`: scale pulse na każdy peak. Nowy wymiar personalizacji.                                          |
| Banger.show patterns    | Music visualization na sterydach — 3D bars, shaders, color-reactive. Ich templates to gold.                          | Studiować ich approach przy budowie premium music-visualization pack (przyszłościowo, komercyjne).                                                                            |

**Tier 3 — niche / high effort / wait for real use case:**

| Paczka / Pattern      | Co daje                                                    | Dlaczego nie teraz                                                                           |
| --------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `@remotion/skia`      | GPU 2D shaders (displacement, custom glsl, advanced blur). | Overkill dla obecnych kart. Dodać gdy pójdziemy w motion-graphics-pro pack.                  |
| `@remotion/rive`      | Rive animations (.riv files).                              | Wait for first .riv asset z user workflow.                                                   |
| Code Hike             | Piękne code animations z syntax highlighting.              | Idealny dla TechSkills tech tutorials, ale to osobny tool use-case, nie core ReelStack card. |
| Watercolor Map (paid) | 2D animated map dla travel-contentu.                       | Niche — dodać jeśli user zechce robić travel / location-reveal reele.                        |
| Remotion Recorder     | In-browser video production tool.                          | Inne narzędzie, nie karta. Rozważyć gdy dojdziemy do in-browser editor UI.                   |

### Remotion templates warte podejrzenia pod inspirację

- **Prompt to Video** (free) — najbliższy naszemu use case (ContentPackage → reel). Warto zrobić code-dive porównawczy.
- **TikTok template** (free) — word-by-word captions, 9:16. Porównać z naszym `CaptionOverlay` highlight-modes.
- **Music Visualization / Audiogram** (free) — szablon dla podcast-clip export (jeśli kiedyś dodamy).
- **3D Starter Template** — 3D phone z video inside. Gotowy starting point dla `3d-frame` karty.
- **Editor Starter** (paid, ~$99) — boilerplate pod video editor UI. Rozważyć gdy ReelStack dostanie pełny in-browser editor.

### Proponowana kolejność wdrożenia (jak user powie "go")

1. **@remotion/sfx + @remotion/animated-emoji** jednocześnie (1 dzień) — highest viral-ROI, lowest effort.
2. **@remotion/layout-utils fitText** wire w 3 karty tekstowe (2h) — quality-of-life, kończy problem overflow.
3. **@remotion/light-leaks** jako wariant transition (2h) — porównać z naszym, wybrać jeden albo zostawić oba.
4. **@remotion/three 3d-frame card** (1-2 dni) — premium pack, wysoka wartość dla demo / marketingu.
5. **Audio-reactive karta** (1-2 dni) — nowy wymiar personalizacji reeli.

## Powiązane dokumenty

- `vault/brands/_shared/reference/remotion-license-strategy.md` — licensing boundaries
- `packages/remotion/COMPOSITION.md` — layer stack dla compositions
- `docs/ARCHITECTURE.md` — overall ReelStack architecture
