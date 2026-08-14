{
  description = "Atmos development environment (Rust + bun monorepo)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs { inherit system overlays; };

        # Single source of truth for the Rust toolchain: rust-toolchain.toml.
        rustToolchain = pkgs.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            rustToolchain
            cargo-watch # `just dev-api-watch`

            bun # JS/TS package manager (see package.json "packageManager")
            nodejs_22 # node scripts under scripts/*

            just # task runner (justfile)
            zsh # justfile sets `set shell := ["zsh", ...]`
            tmux # terminal service (PTY sessions)
            git
            gh # GitHub CLI used by agent hooks / review flows

            # Native build deps for the Rust workspace (crypto/TLS crates, *-sys).
            pkg-config
            openssl
            perl
            cmake
          ];

          # Keep OpenSSL discoverable for crates that link it via pkg-config.
          env.PKG_CONFIG_PATH = "${pkgs.openssl.dev}/lib/pkgconfig";

          shellHook = ''
            echo "Atmos dev shell → $(rustc --version), bun $(bun --version), just $(just --version)"
          '';
        };

        formatter = pkgs.nixfmt-rfc-style;
      }
    );
}
