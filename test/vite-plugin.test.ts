import { build } from "vite";
import path from "path";
import { Route } from "@tanstack/react-router";
import { describe, expect, test } from "vitest";

describe("vite-plugin", () => {
  test("should prune the tree", async () => {
    const outDir = path.resolve(import.meta.dirname, "./fixtures/case1/dist/");

    await build({
      configFile: path.resolve(
        import.meta.dirname,
        "./fixtures/case1/_vite.config.ts",
      ),
      build: {
        outDir,
      },
    });

    const bundle = await import(path.resolve(outDir, "bundle.js"));
    const routeTree = bundle.routeTree as Route;

    expect(printRouteTree(routeTree)).toMatchInlineSnapshot(`
      "__root__
      --/level-1
      ----/level-1/level-2
      ------/level-1/level-2/level-3"
    `);
  });
});

function printRouteTree(
  route: Route,
  lines: string[] = [],
  level: number = 0,
): string {
  route.init({ originalIndex: 0 });

  lines.push(`${"--".repeat(level)}${route.id}`);

  if (route.children) {
    for (const child of route.children as Route[]) {
      printRouteTree(child, lines, level + 1);
    }
  }

  return lines.join("\n");
}
