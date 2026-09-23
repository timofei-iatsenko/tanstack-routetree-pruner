# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A Vite plugin that prunes TanStack Router's auto-generated `routeTree.gen.ts` to include only a target route and its ancestors. Used to isolate routes for Storybook stories and Vitest tests.

## Commands

- `pnpm test` — run all tests (vitest)
- `pnpm vitest --run src/route-pruner.test.ts` — run a single test file
- `pnpm vitest --run -t "test name"` — run a single test by name
- `pnpm build` — build with unbuild, outputs `dist/index.mjs`
- `pnpm format:check` / `pnpm format:fix` — prettier

## Architecture

### Plugin entry (`src/index.ts`)

Vite plugin with two hooks:

1. **`transform`** — Rewrites ES import attributes (`with { ancestors: "full" }`) into internal `?tree` query params using MagicString. Uses Vite's object-form hook with `filter.code` regex so it only runs on modules containing the pattern.

2. **`load`** — Intercepts module IDs ending with `?tree`. Reads `routeTree.gen.ts` from disk, computes the target route's relative path, and delegates to `pruneRouteTree()` to generate a virtual module.

### Route pruner (`src/route-pruner.ts`)

Core logic that takes the full `routeTree.gen.ts` content and a target route path, then:

1. **`parseRouteTree()`** — Uses `oxc-parser` to parse imports, route `.update()` calls, and parent relationships into a `Map<string, RouteMapping>`. Extracts text from the source via `content.slice(start, end)` using AST node positions.
2. **`traceAncestry()`** — Walks from the target route up to the root, collecting imports and generating cloned route definitions (`createRoute(idOrPath({...OriginalImport.options, ...routeOptions}))`).
3. **`pruneRouteTree()`** — Orchestrates parsing and ancestry tracing, produces the final virtual module that exports `routeTree`, a cloned `Route` (with `__root` set to the tree), and re-exports everything else from the original route file via `export *`.

### Test structure

- `src/route-pruner.test.ts` — Unit tests for the pruner with inline snapshots of generated output
- `test/vite-plugin.test.ts` — Integration test that runs a real Vite build against `test/fixtures/case1/`, imports the bundle, and verifies the route tree structure
- Fixture at `test/fixtures/case1/` has a multi-level route hierarchy with `.stories.tsx` files that use import attributes to trigger the plugin

### Key design decisions

- Import attributes (`with { ancestors: "full" }`) are the user-facing API; `?tree` query params are an internal mechanism (Vite/Rolldown doesn't support import attributes in plugin hooks)
- Routes are cloned (via `createRoute()` / `createRootRoute()`) to avoid mutating the original route objects
- The cloned target `Route` gets `__root` assigned to the pruned `routeTree`, so users access the tree via `Route.__root`
