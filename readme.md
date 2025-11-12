[![License][badge-license]][license] [![Version][badge-version]][package] [![Downloads][badge-downloads]][package]

# tanstack-routetree-pruner

> Vite Plugin for easing testing in Storybook or Vitest by pruning a TanStack Router Route Tree to only specific page and it's ancestors

## Description

TBA

## Installation

```bash
npm install tanstack-routetree-pruner
```

Then add a plugin to `vite.config.ts`

```ts
import TanStackRouteTreePrunerPlugin from "tanstack-routetree-pruner";

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    TanStackRouteTreePrunerPlugin(import.meta.dirname + "/src"),
  ],
});
```

Add types to `vite-env.d.ts`:

```ts
declare module "*?tree" {
  import { Route } from "@tanstack/react-router";
  export const routeTree: Route;
}
```

## Usage

Now you will be able to import a specific route **with all ancestors** and to your test or story file and test it in isolation.

Say you have `/home` route (`./src/routes/home.tsx`) which you want to write a Storybook Story for

```tsx
// `./src/routes/home.stories.tsx`
import {
  createMemoryHistory,
  createRouter,
  RegisteredRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { Route } from "./home";
import { routeTree } from "./home?tree"; // <- add ?tree suffix to the route file to get a full routeTree

const router = createRouter({
  routeTree: routeTree,
  history: createMemoryHistory({
    initialEntries: ["/"],
  }),
}) as RegisteredRouter;

const meta: Meta = {
  title: "Pages/Home",
  beforeEach: () => {
    router.navigate({ to: Route.fullPath });
  },
  decorators: [
    () => {
      return <RouterProvider router={router} />;
    },
  ],
};
```

## License

This package is licensed under [MIT][license].

[license]: https://github.com/timofei-iatsenko/tanstack-routetree-pruner/blob/main/LICENSE
[package]: https://www.npmjs.com/package/tanstack-routetree-pruner
[badge-downloads]: https://img.shields.io/npm/dw/tanstack-routetree-pruner.svg
[badge-version]: https://img.shields.io/npm/v/tanstack-routetree-pruner.svg
[badge-license]: https://img.shields.io/npm/l/tanstack-routetree-pruner.svg
