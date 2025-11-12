import { Plugin } from "vite";
import * as path from "path";
import * as fs from "fs";
import { pruneRouteTree } from "./route-pruner"; // Import the new core logic

// --- Constants ---
const SUFFIX = "?tree";
const ROUTE_TREE_FILE = "routeTree.gen.ts"; // Assumed to be in project root for simplicity

function getErrorModuleSource(errorMessage: string) {
  return `export const routeTree = {}; throw new Error("RouteTreePruner: ${errorMessage}");`;
}

/**
 * Prunes the TanStack Router route tree defined in routeTree.gen.ts to only
 * include the requested route and its ancestors.
 * * @param rootDir The project root directory where routeTree.gen.ts is located.
 * @returns A Vite Plugin object.
 */
export function tanstackRouteTreePrunerPlugin(rootDir: string): Plugin {
  const routeTreePath = path.resolve(rootDir, ROUTE_TREE_FILE);

  if (!fs.existsSync(routeTreePath)) {
    console.warn(
      `[tanstack-route-tree-pruner] ${ROUTE_TREE_FILE} not found at ${routeTreePath}. Plugin will be inactive.`,
    );
  }

  return {
    name: "tanstack-route-tree-pruner",
    enforce: "pre",

    // 2. Load the virtual module content
    load(id) {
      if (!id.endsWith(SUFFIX)) {
        return null;
      }

      const relativeRoutePath =
        "./" +
        path
          .relative(rootDir, id.slice(0, -SUFFIX.length))
          .replace(/\.tsx?$/, "");
      console.log("line2");

      if (!fs.existsSync(routeTreePath)) {
        return getErrorModuleSource(`${ROUTE_TREE_FILE} not found.`);
      }

      this.addWatchFile(routeTreePath);

      const targetRelativePath = relativeRoutePath;
      const routeTreeContent = fs.readFileSync(routeTreePath, "utf-8");

      try {
        // Delegate the heavy lifting to the core pruner logic
        const prunedContent = pruneRouteTree(
          routeTreeContent,
          targetRelativePath,
        );
        return prunedContent;
      } catch (e) {
        const error = e as Error;
        // Prefix the error message so the user knows where it came from
        return getErrorModuleSource(error.message);
      }
    },
  };
}

export default tanstackRouteTreePrunerPlugin;
