import type { Plugin } from "vite";
import * as path from "path";
import * as fs from "fs";
import { pruneRouteTree } from "./route-pruner"; // Import the new core logic

const SUFFIX = "?tree";
const ROUTE_TREE_FILE = "routeTree.gen.ts"; // Assumed to be in project root for simplicity

function getErrorModuleSource(errorMessage: string) {
  // Prefix the error message so the user knows where it came from
  return `export const routeTree = {}; throw new Error("RouteTreePruner: ${errorMessage}");`;
}

/**
 * Prunes the TanStack Router route tree defined in routeTree.gen.ts to only
 * include the requested route and its ancestors.
 * * @param rootDir The project root directory where routeTree.gen.ts is located.
 * @returns A Vite Plugin object.
 */
export default function TanstackRouteTreePrunerPlugin(rootDir: string): Plugin {
  const routeTreePath = path.resolve(rootDir, ROUTE_TREE_FILE);

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

      if (!fs.existsSync(routeTreePath)) {
        const msg = `${ROUTE_TREE_FILE} not found.`;
        this.warn(msg);
        return getErrorModuleSource(msg);
      }

      this.addWatchFile(routeTreePath);

      const routeTreeContent = fs.readFileSync(routeTreePath, "utf-8");

      try {
        // Delegate the heavy lifting to the core pruner logic
        const prunedContent = pruneRouteTree(
          routeTreeContent,
          relativeRoutePath,
        );
        return prunedContent;
      } catch (e) {
        const error = e as Error;
        this.warn(error.message);
        return getErrorModuleSource(error.message);
      }
    },
  };
}
