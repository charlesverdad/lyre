{ pkgs ? import <nixpkgs> { } }:

# Android toolchain shell (task F1, docs/PLAN-v0.4.md), split out from the
# default `shell.nix` so ordinary web contributors don't pay for a multi-GB
# SDK+JDK closure (and a `builtins.fetchGit` network round-trip at
# evaluation time) just to run `just dev`. Enter with:
#
#   nix-shell shell-android.nix
#
# `just`'s `android-*` recipes assume this shell is active — they don't
# re-enter it themselves, since `justfile`'s convention (see its header
# comment) is that recipes stay plain and the caller enters the right shell.
let
  # android-nixpkgs is not on a nix-channel here, so pull it ad-hoc via
  # fetchGit — same approach the project's own upstream README documents for
  # non-flake, non-channel use. `ref` is required alongside `rev`: a bare
  # `rev` resolves against the repo's current default-branch HEAD at
  # evaluation time, which breaks if upstream ever force-pushes main (the
  # commit would no longer be reachable from the ref fetchGit actually
  # fetches). Pinned to a specific commit so the SDK package set (and
  # therefore `buildToolsVersion`/`compileSdk` in android/build.gradle)
  # doesn't drift under us.
  android-nixpkgs = pkgs.callPackage
    (import (builtins.fetchGit {
      url = "https://github.com/tadfisher/android-nixpkgs.git";
      ref = "main";
      rev = "1c3c35c4d0cb4677ce781b9d389f88d40a67073a"; # 2026-07-31
    }))
    { channel = "stable"; };

  # Keep in sync with android/app/build.gradle (compileSdk/targetSdk 36,
  # buildToolsVersion "36.1.0") and docs/PLAN-v0.4.md's verified constraints.
  # `sdk.nix` builds a read-only, immutable SDK tree from these exact
  # packages — there is no `sdkmanager --licenses` step because the
  # derivation already stamps every license hash the selected packages need.
  android-sdk = android-nixpkgs.sdk (sdkPkgs:
    with sdkPkgs; [
      cmdline-tools-latest
      platform-tools
      platforms-android-36
      build-tools-36-1-0

      # Emulator, for manual/agent verification only — not needed for
      # `just android-apk`. arm64-v8a system image because Apple Silicon is
      # the primary dev machine here; an x86_64 image would run under slow,
      # unreliable binary translation instead of KVM/HVF acceleration.
      emulator
      system-images-android-36-google-apis-arm64-v8a
    ]);
in
pkgs.mkShell {
  name = "lyre-android";

  buildInputs = with pkgs; [
    # Same web toolchain as shell.nix — `just android-build` still needs to
    # run the ordinary web build before `cap sync`.
    nodejs_24
    nodePackages.pnpm
    just

    # Android toolchain: JDK 21 (Capacitor/AGP 8.13 want 17-21, 21
    # recommended) plus the pinned SDK above.
    jdk21
    android-sdk
  ];

  # android-sdk's own setup-hook already exports ANDROID_SDK_ROOT/ANDROID_HOME
  # (see the fetched derivation's sdk.nix); restate them here too so the
  # variables are visible even if that hook's ordering ever changes.
  ANDROID_SDK_ROOT = "${android-sdk}/share/android-sdk";
  ANDROID_HOME = "${android-sdk}/share/android-sdk";

  shellHook = ''
    echo ""
    echo "  Lyre Android dev environment"
    echo ""
    echo "  node : $(node --version)"
    echo "  pnpm : $(pnpm --version)"
    echo "  just : $(just --version)"
    echo "  java : $(java --version 2>&1 | head -n1)"
    echo "  android sdk : $ANDROID_SDK_ROOT"
    echo ""
    echo "  Build a debug APK : just android-apk"
    echo "  Boot the emulator : emulator -avd lyre-api36 -no-snapshot -no-audio -no-boot-anim -gpu swiftshader_indirect"
    echo ""
    echo "  NOTE: the nix SDK's store path changes whenever this file changes"
    echo "  (it's a content-addressed derivation) — if a Gradle build fails"
    echo "  with 'package android.* does not exist' right after editing this"
    echo "  file, run 'cd android && ./gradlew --stop' to kill the stale"
    echo "  daemon holding the old path, then rebuild."
    echo ""
  '';
}
