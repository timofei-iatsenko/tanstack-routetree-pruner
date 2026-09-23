import { createFileRoute } from "@tanstack/react-router";

declare module "@tanstack/router-core" {
  interface RouteExtensions<TId, TFullPath> {
    __bla: string;
  }
}

export const Route = createFileRoute("/level-1/level-2/level-3")({
  component: () => {},
});

Route.__bla;

// type t = typeof Route;
//
// type t2 = t['']
