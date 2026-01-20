# Docs App

This is the official documentation site for the project, built with Next.js and [Fumadocs](https://fumadocs.vercel.app/).

## Tech Stack

- **Framework**: Next.js 16
- **Documentation**: Fumadocs (Core, UI, MDX)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript

## Directory Structure

- **`content/`**: Contains the actual documentation content in `.mdx` files.
- **`src/app`**: Next.js App Router structure.
- **`src/lib/source.ts`**: Configuration for loading content.

## Useful Commands

- `bun dev`: Start the development server (runs on a different port if web is active, usually 3001).
- `bun build`: Build for production.
- `bun run types:check`: Run Fumadocs MDX checks and TypeScript validation.

## Content Management

- Documentation pages are located in `content/docs`.
- The file structure in `content/docs` maps directly to the URL structure.
- Use `meta.json` files to define navigation order and titles for folders.

## Integration Notes

- This app should eventually share UI components and configurations from the `packages/` workspace.
- **Internationalization**: If adding i18n, integrate with `@atmos/i18n` (see `packages/i18n/AGENTS.md`).
