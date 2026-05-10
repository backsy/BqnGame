{
  description = "BqnGame — mobile-first BQN playground";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    backlog-md = {
      url = "github:MrLesk/Backlog.md";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, backlog-md }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            pnpm_10
            git
            backlog-md.packages.${system}.default
          ];

          shellHook = ''
            echo "BqnGame dev shell"
            echo "  node  $(node --version)"
            echo "  pnpm  $(pnpm --version)"
          '';
        };
      });
}
