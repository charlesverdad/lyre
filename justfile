# Lyre — justfile
# Task runner for local development and CI. Install: https://just.systems
#
# `shell.nix` provides node/pnpm/just. Recipes are plain (no nix-shell
# wrapping) since they run fine in CI's plain-env setup too — enter
# `nix-shell` (or let direnv's `use nix` load it) before running `just`
# locally if a binary is missing.

# List available recipes.
default:
    @just --list

# Install dependencies.
install:
    pnpm install

# Start the dev server.
dev:
    pnpm run dev

# Build the static site.
build:
    pnpm run build

# Preview the production build.
preview:
    pnpm run preview

# Run unit tests once (CI mode).
test:
    pnpm run test

# Lint (eslint).
lint:
    pnpm exec eslint .

# Format the codebase.
fmt:
    pnpm exec prettier --write .

# Check formatting without writing.
fmt-check:
    pnpm exec prettier --check .

# Type-check (svelte-check).
typecheck:
    pnpm run check

# Regenerate PWA icon PNGs from static/icons/icon-source.svg.
icons:
    pnpm run icons

# Full verification gate: lint + format check + typecheck + unit tests.
# Must pass before any PR (see AGENTS.md).
verify: lint fmt-check typecheck test

# Run the Playwright e2e acceptance walkthrough (builds first; the config's
# webServer also builds, but doing it here gives a clean failure earlier).
e2e: build
    pnpm exec playwright test

# --- Android (task F1, docs/PLAN-v0.4.md) -----------------------------------
# `shell-android.nix` (not the default `shell.nix`) provides the JDK and
# Android SDK — enter `nix-shell shell-android.nix` first, or these recipes
# will fail with missing tools (`pnpm exec cap`, `java`, `./gradlew`, ...).
# Kept out of the default shell so plain web contributors don't pay for a
# multi-GB SDK+JDK closure just to run `just dev`.

# Build web assets for the native shell and sync them into android/. `BASE_PATH`
# is explicitly cleared (never inherited from the caller's env) — the GH Pages
# build's `/lyre` base breaks every asset URL once served from the webview's
# root, so this recipe is the only supported way to produce native-bound web
# assets, making it structurally hard to accidentally ship the `/lyre` base.
android-build:
    BASE_PATH= pnpm run build
    pnpm exec cap sync android

# Assemble the debug APK. Lands at
# android/app/build/outputs/apk/debug/app-debug.apk. Depends on `android-build`
# because `cap sync` is what produces everything Gradle's settings evaluation
# needs (capacitor-cordova-android-plugins/, capacitor.settings.gradle,
# app/src/main/assets/public, capacitor.config.json) — all gitignored, since
# they're generated and would otherwise go stale (see android/.gitignore's
# comment on capacitor.settings.gradle). A fresh clone running this recipe
# standalone would fail in Gradle settings evaluation with a confusing
# "cordova.variables.gradle not found"-style error.
android-assemble: android-build
    cd android && ./gradlew assembleDebug

# Convenience alias: same as `android-assemble` (which already builds first).
android-apk: android-assemble
