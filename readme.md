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

## Usage

Now you will be able to import a specific route **with all ancestors** to your test or story file and test it in isolation using [ES import attributes](https://github.com/tc39/proposal-import-attributes).

Say you have `/home` route (`./src/routes/home.tsx`) which you want to write a Storybook Story for

```tsx
// `./src/routes/home.stories.tsx`
import {
  createMemoryHistory,
  createRouter,
  RegisteredRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { Route } from "./home" with { ancestors: "full" };

const router = createRouter({
  routeTree: Route.__root, // pruned routeTree would be stored in this property
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

The `with { ancestors: "full" }` import attribute tells the plugin to attach a pruned route tree containing only the target route and its ancestors.

The pruned tree is assigned to `Route.__root`, so you can pass it directly to `createRouter`.

### TypeScript support

To access `Route.__root` without a type error, add the following type augmentation to your project (e.g. in `vite-env.d.ts` or a dedicated `.d.ts` file):

```ts
import { AnyRootRoute } from "@tanstack/react-router";

declare module "@tanstack/router-core" {
  interface RouteExtensions<TId, TFullPath> {
    __root: AnyRootRoute;
  }
}
```

## License

This package is licensed under [MIT][license].

[license]: https://github.com/timofei-iatsenko/tanstack-routetree-pruner/blob/main/LICENSE
[package]: https://www.npmjs.com/package/tanstack-routetree-pruner
[badge-downloads]: https://img.shields.io/npm/dw/tanstack-routetree-pruner.svg
[badge-version]: https://img.shields.io/npm/v/tanstack-routetree-pruner.svg
[badge-license]: https://img.shields.io/npm/l/tanstack-routetree-pruner.svg
