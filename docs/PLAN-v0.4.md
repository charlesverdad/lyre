# PLAN v0.4.0 — Capacitor Android wrap: share-to-app, native fetch

Owner request: *"keep the copy-paste behaviour for the PWA but aim to build
capacitor so that we can 'Share' to the app and the app can handle the
parsing."*

## Why native at all

A browser page cannot read another site's HTML. `Access-Control-Allow-Origin`
is set by the site being *requested* (pnwchords.com sends none), so the
browser blocks the read — verified live: plain `fetch` throws `TypeError`,
`mode: 'no-cors'` returns an opaque response whose body reads 0 characters,
and `XMLHttpRequest` fires a detail-free `onerror`. No client-side trick gets
around this; the only escapes are a server doing the fetch, or not being a
browser. Capacitor is the second.

**The PWA keeps its current behaviour unchanged** — paste a chart, or paste a
bare URL and get the guided-paste fallback when the fetch is blocked. Nothing
in this release may regress that path.

## Scope

**Android only.** iOS needs the $99/yr Apple Developer Program for anything
beyond 7-day provisioning, and its share sheet is a separate extension target
— a later, separate decision (mvp-spec.md F2's note stands).

## Verified constraints (researched 2026-08-01 — re-verify before relying)

- **Capacitor 8.5.0** (`@capacitor/core`, `/cli`, `/android`), `@capacitor/app`
  8.1.1. Capacitor 9 is alpha — do not target. Requires Node 22+, JDK 17–21
  (21 recommended), AGP 8.13.0, Gradle 8.14.3, `minSdk` 24, `compileSdk`/
  `targetSdk` 36.
- **`appUrlOpen` does NOT fire for `ACTION_SEND`.** The official `@capacitor/app`
  plugin covers custom schemes and App Links (`ACTION_VIEW`) only. Receiving a
  share needs either the maintained community `send-intent` plugin or a custom
  `MainActivity`/plugin reading `getIntent()` + `onNewIntent`. This is the
  crux of the release — prototype it first, not last.
- **CapacitorHttp** is built into core but **disabled by default**; enable via
  `plugins: { CapacitorHttp: { enabled: true } }`. It patches `fetch`/`XHR` to
  go native, which is what bypasses CORS. Known open bugs: gzip response
  mangling, header-case normalization, broken percent-encoding of GET query
  params. Charset/streaming/`Response.text()` semantics are undocumented.
  `fetch(new Request(url))` is **not** patched — that's the de facto
  per-request opt-out.
- **Storage does not carry over.** `capacitor://localhost` is a distinct origin
  from `charlesverdad.github.io`, so the native app's `localStorage` starts
  empty and shares nothing with the PWA. WebView storage is stable across APK
  updates (same package + signing key), cleared only by uninstall or "Clear
  storage". The v0.3.0 export/import zip is the migration path.
- **`paths.base`** must be `''` for the native build (the GH Pages build uses
  `/lyre`); a non-empty base breaks asset URLs inside the webview.
- **Service worker**: skip registration under `Capacitor.isNativePlatform()` —
  no value in the shell, and it risks stale-cache bugs against bundled assets.
- Android sideloading is mechanically fine for a personal debug APK; Google's
  2026 developer-verification rollout is in flux, but `adb install` over USB is
  consistently described as remaining available.

## Tasks

Sub-PRs target the `v0.4.0` version branch, branch `v0.4.0-task-<ID>`, title
`<ID>: <summary>` (AGENTS.md Workflow).

| ID | Scope | Depends on |
|---|---|---|
| F1 | Android toolchain in `shell.nix` + Capacitor scaffold; a debug APK actually builds | — |
| F2 | Share-to-app: `ACTION_SEND` intent → existing grab/paste pipeline | F1 |
| F3 | Native HTTP: enable CapacitorHttp, validate against a real chord page, fallback if it mangles | F1 |
| F4 | PWA → app library transfer, platform-aware copy, docs | F2, F3 |

### F1 — Toolchain and scaffold

Definition of done is **`./gradlew assembleDebug` produces an installable
APK**, not "the config looks right".

- Extend `shell.nix` with the Android SDK via
  [`android-nixpkgs`](https://github.com/tadfisher/android-nixpkgs) (project
  convention: all binaries come from nix). Needs `cmdline-tools`,
  `platform-tools`, `platforms;android-36`, matching `build-tools`, a JDK, and
  accepted licenses. Expect friction pinning `buildToolsVersion` to exactly
  what the nix derivation provides. **If nix proves a rabbit hole, stop and
  report** — document the Android Studio path instead rather than burning the
  task on it.
- Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` at the
  versions above; `capacitor.config.ts` with `webDir: 'build'`.
- A `just` recipe pair: build the web assets with `BASE_PATH=''` then
  `cap sync`, and one to assemble the debug APK. The native build must never
  inherit the GH Pages base path.
- `android/` committed to the repo (standard Capacitor practice) with an
  appropriate `.gitignore` for build outputs.
- The PWA build, `just verify`, and `just e2e` must be untouched and green.

### F2 — Share to app

The feature the release exists for: Chrome → Share → Lyre → parsed chart.

- Register the `ACTION_SEND` + `text/plain` intent-filter. Evaluate
  `send-intent` vs. a small custom handler; prefer the maintained plugin if it
  genuinely supports Capacitor 8, else hand-roll `onNewIntent`. Justify the
  choice in the PR.
- Handle **both** launch paths: app cold-started by the share, and app already
  running (`onNewIntent`).
- Shared text may be a bare URL, a URL with surrounding text, or a chunk of
  chart text. Route it through the **existing** `GrabController` / bare-URL /
  noisy-paste logic (`src/lib/grab/`, `src/lib/chart/extractRegion.ts`) —
  reuse, do not fork, the pipeline the PWA uses.
- Also register the `ACTION_VIEW` https App Link filter so a chord-site link
  can open in Lyre. Chooser-target (no `assetlinks.json`) is acceptable;
  document that silent verification would need the file hosted.

### F3 — Native fetch

- Enable CapacitorHttp and confirm a real chord-site page fetches and parses
  end to end on-device or on-emulator. **Verify the response body is byte-
  faithful** — check for the known gzip/charset/percent-encoding issues rather
  than trusting that a 200 means correct HTML.
- If the patched fetch mangles content, fall back to `fetch(new Request(...))`
  or the `CapacitorHttp` plugin API directly, and record what broke.
- `GrabFailureReason` copy is written for a CORS-blocked browser; make the
  failure messaging platform-aware so the native app never tells the user to
  go paste the page manually when the real problem is a 404.

### F4 — Library transfer, copy, docs

- The app starts with an empty library. Make the PWA→app path explicit:
  surface export/import prominently on first run in the native shell rather
  than leaving the user to find it.
- Audit user-facing copy for browser-only assumptions (the guided-paste sheet,
  the "install Lyre" tip, share-target hints).
- Docs: `mvp-spec.md` F2's CORS note (resolved for native, still open for
  web), `roadmap.md`, `README.md` build/install instructions for the APK, and
  a `docs/native.md` covering toolchain setup, building, sideloading, and the
  storage-isolation caveat.

## Definition of done

`just verify` + `just e2e` green (PWA unregressed); a debug APK builds from a
clean checkout inside `nix-shell`; sharing a pnwchords page from Chrome opens
Lyre with a parsed, saveable chart; final PR from `v0.4.0` to `main` listing
the merged sub-PRs.

## Explicitly out of scope

iOS, Play Store distribution, app signing for release, auto-update, native
wake-lock (roadmap), and any change to the PWA's paste-based grab behaviour.
