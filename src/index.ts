import type { Plugin } from "vite";
import * as path from "path";
import * as fs from "fs";
import MagicString from "magic-string";
import { pruneRouteTree } from "./route-pruner.js";

const SUFFIX = "?tree";
const ROUTE_TREE_FILE = "routeTree.gen.ts";

const IMPORT_ATTR_RE =
  /(from\s+)(["'])(.*?)\2\s+with\s*\{\s*ancestors\s*:\s*["']full["']\s*\}/g;

function getErrorModuleSource(errorMessage: string) {
  return `export const routeTree = {}; export const Route = {}; throw new Error("RouteTreePruner: ${errorMessage}");`;
}

export default function TanstackRouteTreePrunerPlugin(rootDir: string): Plugin {
  const routeTreePath = path.resolve(rootDir, ROUTE_TREE_FILE);

  return {
    name: "tanstack-route-tree-pruner",
    enforce: "pre",

    transform: {
      filter: {
        code: /\bwith\s*\{\s*ancestors\s*:/,
      },
      handler(code) {
        const s = new MagicString(code);
        s.replace(IMPORT_ATTR_RE, "$1$2$3?tree$2");

        if (s.hasChanged()) {
          return { code: s.toString(), map: s.generateMap({ hires: true }) };
        }
      },
    },

    load: {
      filter: {
        id: /\?tree$/,
      },
      handler(id) {
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
    },
  };
}
