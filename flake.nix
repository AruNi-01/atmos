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

        # Single source of truth for bun: package.json "packageManager".
        # nixpkgs is still on 1.3.13 (upstream held 1.3.14 over sandbox
        # `bun build --compile` issues), so the shell fetches the official
        # Oven release that CI and host toolchains already pin.
        packageManager = (builtins.fromJSON (builtins.readFile ./package.json)).packageManager;
        bunVersion =
          let
            m = builtins.match "bun@([0-9]+\\.[0-9]+\\.[0-9]+)" packageManager;
          in
          if m == null then
            throw "package.json packageManager must look like bun@x.y.z, got: ${packageManager}"
          else
            builtins.head m;

        # When bumping packageManager, add hashes here (`nix hash file <zip>`
        # or `openssl dgst -sha256 -binary <zip> | base64`).
        bunOfficial =
          {
            "1.3.14" = {
              x86_64-linux = {
                url = "https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-x64.zip";
                hash = "sha256-lR7iruhV8IWVruxiJSJqKY0/6oOj3NZGXAnLzN9+hI8=";
                sourceRoot = "bun-linux-x64";
              };
              aarch64-linux = {
                url = "https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-aarch64.zip";
                hash = "sha256-on/7Y6gxA3WDbg1vZorhf6jY0YuIw3yCHGUzGXOhmjs=";
                sourceRoot = "bun-linux-aarch64";
              };
              aarch64-darwin = {
                url = "https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-darwin-aarch64.zip";
                hash = "sha256-2LliIYKK1vl6x6wKt+lYcjQa92MAHogD6CZ2UsJlJiA=";
                sourceRoot = "bun-darwin-aarch64";
              };
              x86_64-darwin = {
                url = "https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-darwin-x64-baseline.zip";
                hash = "sha256-PjWtb1OXGpg0v55nhuKt9ytfGSHMmpxf3gc9KXKUQHY=";
                sourceRoot = "bun-darwin-x64-baseline";
              };
            };
          }
          .${bunVersion} or (throw "flake.nix is missing official bun ${bunVersion} hashes; add them when bumping package.json packageManager");

        bunSrc =
          bunOfficial.${system} or (throw "No official bun ${bunVersion} build for ${system}");

        bunPinned = pkgs.bun.overrideAttrs {
          version = bunVersion;
          src = pkgs.fetchurl {
            inherit (bunSrc) url hash;
          };
          sourceRoot = bunSrc.sourceRoot;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            rustToolchain
            cargo-watch # `just dev-api-watch`

            bunPinned
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
