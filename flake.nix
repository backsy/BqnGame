{
  description = "BqnGame — mobile-first BQN playground";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm_10
            git
          ];

          shellHook = ''
            echo "BqnGame dev shell"
            echo "  node  $(node --version)"
            echo "  pnpm  $(pnpm --version)"
          '';
        };
      });
}
