import { defineConfig } from "vite";
import path from "path";
import TanStackRouteTreePrunerPlugin from "../../../src/index.js";
import TanStackRouterVite from "@tanstack/router-plugin/vite";

export default defineConfig({
  build: {
    minify: false,
    lib: {
      entry: path.resolve(import.meta.dirname, "./src/index.ts"),
      fileName: "bundle",
      formats: ["es"],
    },
    rolldownOptions: {
      external: ["@tanstack/react-router"],
    },
  },
  plugins: [
    TanStackRouterVite({
      generatedRouteTree: import.meta.dirname + "/src/routeTree.gen.ts",
      routesDirectory: import.meta.dirname + "/src/routes",
      target: "react",
      routeFileIgnorePattern: ".((stories|test).tsx)",
    }),
    TanStackRouteTreePrunerPlugin(import.meta.dirname + "/src"),
  ],
});
