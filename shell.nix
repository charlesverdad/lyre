{ pkgs ? import <nixpkgs> { } }:

let
  # Android SDK, provided entirely by Nix (project convention: no binaries
  # installed outside nix). android-nixpkgs (task F1, docs/PLAN-v0.4.md) is
  # not on a nix-channel here, so pull it ad-hoc via fetchGit — same approach
  # the project's own upstream README documents for non-flake, non-channel
  # use. Pinned to a specific commit so the SDK package set (and therefore
  # `buildToolsVersion`/`compileSdk` below) doesn't drift under us.
  android-nixpkgs = pkgs.callPackage
    (import (builtins.fetchGit {
      url = "https://github.com/tadfisher/android-nixpkgs.git";
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
    ]);
in
pkgs.mkShell {
  name = "lyre-dev";

  buildInputs = with pkgs; [
    # Node.js runtime (current LTS)
    nodejs_24

    # Package manager
    nodePackages.pnpm

    # Task runner (justfile)
    just

    # Android toolchain (task F1): JDK 21 (Capacitor/AGP 8.13 want 17-21,
    # 21 recommended) plus the pinned SDK above.
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
    echo "  Lyre dev environment"
    echo ""
    echo "  node : $(node --version)"
    echo "  pnpm : $(pnpm --version)"
    echo "  just : $(just --version)"
    echo "  java : $(java --version 2>&1 | head -n1)"
    echo "  android sdk : $ANDROID_SDK_ROOT"
    echo ""
    echo "  Quick start: just dev"
    echo "  Android debug APK: just android-build && just android-assemble"
    echo ""
  '';
}
