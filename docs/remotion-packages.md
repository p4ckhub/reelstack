# Remotion packages — use-what, when, why

Decision guide zanim zaczniesz pisać nowy komponent/pipeline. Sprawdź najpierw tę tabelę — jeśli Remotion ma oficjalną paczkę pokrywającą 80% potrzeby, **nie pisz od zera**.

Ostatni review: **2026-04-17**. Sprawdzaj przy każdym upgrade Remotion.

## Szybka ściąga

**Kiedy sprawdzić ten dokument:**

- Zaczynasz nową kartę / transition / effect i zastanawiasz się "napisać samemu czy szukać?"
- Planujesz integrację TTS / caption / transcoding
- Widzisz że piszesz dużo ręcznego SVG/path math — pewnie jest helper
- Upgrade Remotion do nowej major wersji — zawsze re-review

**Kiedy NIE sprawdzać:**

- Małe inline styling (nie warto dodawać deps dla 5 linijek CSS)
- Animacja która jest unikatowa dla naszego brandu (customowy creative work)

## Zainstalowane (stan na 2026-04-17)

| Paczka                   | Wersja  | Licencja | Gdzie używana u nas                                                                      |
| ------------------------ | ------- | -------- | ---------------------------------------------------------------------------------------- |
| `remotion`               | 4.0.431 | RLA      | Wszędzie — core hooks, `AbsoluteFill`, `interpolate`, `spring`, `random`                 |
| `@remotion/bundler`      | 4.0.431 | RLA      | CLI only (`remotion bundle` przez worker)                                                |
| `@remotion/cli`          | 4.0.431 | RLA      | CLI only (`remotion studio`, `remotion render`)                                          |
| `@remotion/renderer`     | 4.0.431 | RLA      | Worker rendering + test types                                                            |
| `@remotion/lambda`       | 4.0.431 | RLA      | Produkcyjny rendering na AWS Lambda                                                      |
| `@remotion/player`       | 4.0.431 | RLA      | Zainstalowana, nieużywana (zarezerwowana dla przyszłego preview UI)                      |
| `@remotion/google-fonts` | 4.0.301 | RLA      | Font loading: Inter, JetBrainsMono, Outfit, Montserrat, Poppins, Roboto, Ubuntu          |
| `@remotion/transitions`  | 4.0.431 | RLA      | `packages/remotion/src/transitions/` + 21 card/transition presetów w `reelstack-modules` |
| `@remotion/paths`        | 4.0.431 | **MIT**  | Transitive (via transitions). Nie importujemy bezpośrednio jeszcze.                      |
| `@remotion/shapes`       | 4.0.431 | **MIT**  | Transitive (via transitions). Nie importujemy bezpośrednio jeszcze.                      |
| `@remotion/media-parser` | 4.0.431 | RLA      | Transitive, nieużywana                                                                   |
| `@remotion/media-utils`  | 4.0.431 | **MIT**  | Transitive, nieużywana                                                                   |

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

| Paczka                   | Licencja | Unlock                                                | Kiedy dodać                                                                                                                |
| ------------------------ | -------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@remotion/motion-blur`  | RLA      | True motion blur                                      | Przed kolejną iteracją `zoom-punch`, `warp-speed`, `push-horizontal`. 3 linijki w każdej karcie, cinematic upgrade.        |
| `@remotion/noise`        | RLA      | Perlin/simplex noise (continuous)                     | Przed kolejną iteracją `liquid`, `ink-splash`, `retro-vhs`. Zamiast ręcznego `Math.sin()` wobble dostajesz organic wobble. |
| `@remotion/lottie`       | RLA      | Renderowanie Lottie files                             | Jak tylko zechcesz dodać ikony/animacje z AE / LottieFiles. Katapulta dla szybkiego rich contentu bez rysowania od zera.   |
| `@remotion/captions`     | RLA      | `parseSrt` / `parseVtt` / `createTikTokStyleCaptions` | Gdy user wrzuca zewnętrzne napisy. Nie potrzeba pisać parsera.                                                             |
| `@remotion/layout-utils` | RLA      | `fitText()`                                           | Gdy headline w karcie przerośnie boks. Zamienia "hardcoded fontSize" na auto.                                              |

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

| Data       | Zmiana                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-17 | Initial write-up po audycie pakietów. 7 oficjalnych zainstalowanych + 5 transitive. Custom implementacje: CaptionOverlay, Whisper pipeline, ElevenLabs integration. |

## Powiązane dokumenty

- `vault/brands/_shared/reference/remotion-license-strategy.md` — licensing boundaries
- `packages/remotion/COMPOSITION.md` — layer stack dla compositions
- `docs/ARCHITECTURE.md` — overall ReelStack architecture
