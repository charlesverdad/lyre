{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  name = "lyre-dev";

  buildInputs = with pkgs; [
    # Node.js runtime (current LTS)
    nodejs_24

    # Package manager
    nodePackages.pnpm

    # Task runner (justfile)
    just
  ];

  shellHook = ''
    echo ""
    echo "  Lyre dev environment"
    echo ""
    echo "  node : $(node --version)"
    echo "  pnpm : $(pnpm --version)"
    echo "  just : $(just --version)"
    echo ""
    echo "  Quick start: just dev"
    echo ""
  '';
}
