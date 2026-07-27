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

# Full verification gate: lint + format check + typecheck + unit tests.
# Must pass before any PR (see AGENTS.md).
verify: lint fmt-check typecheck test
