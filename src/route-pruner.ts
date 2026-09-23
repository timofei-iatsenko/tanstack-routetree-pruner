import { parseSync } from "oxc-parser";
import path from "node:path";

interface RouteMapping {
  routeConstName: string;
  parent?: RouteMapping;
  import: ImportDefinition;
  routeOptionsCode: string;
}

interface ImportDefinition {
  importName: string;
  // The path used in the import statement, e.g., './routes/_app/route'
  relativePath: string;
  // Full code for the import statement
  importCode: string;
}
/**
 * Parses routeTree content to extract all route mappings (imports, constants, parents).
 */
function parseRouteTree(content: string, targetRelativePath: string) {
  const importsMap = new Map<string, ImportDefinition>();

  const result = parseSync("routeTree.gen.ts", content);
  const ast = result.program;

  // 1. Collect all Imports using ESM module info
  for (const imp of result.module.staticImports) {
    const entry = imp.entries[0];
    if (
      !entry ||
      entry.importName.kind !== "Name" ||
      entry.importName.name !== "Route"
    )
      continue;

    const importName = entry.localName.value;
    if (importName === "Route") {
      throw new Error("Import should be Aliased incorrect structure");
    }

    const relativePath = imp.moduleRequest.value;

    const newRelativePath = path.relative(
      path.resolve(targetRelativePath, "../"),
      relativePath,
    );

    const adjustedPath = !newRelativePath.startsWith(".")
      ? "./" + newRelativePath
      : newRelativePath;

    importsMap.set(importName, {
      importName: importName,
      relativePath: relativePath,
      importCode: `import { Route as ${importName} } from '${adjustedPath}'`,
    });
  }

  const mappings = new Map<string, RouteMapping>();

  // 2. Collect Route Constants and link with Imports
  interface RouteDeclaration {
    routeConstName: string;
    routeImportName: string;
    parentConstName: string | undefined;
    routeOptionsCode: string;
  }

  const routeDeclarations: RouteDeclaration[] = [];

  for (const node of ast.body) {
    if (node.type !== "VariableDeclaration") continue;

    for (const decl of node.declarations) {
      if (decl.id.type !== "Identifier") continue;

      const variableName = decl.id.name;
      if (!variableName.endsWith("Route")) continue;

      const init = decl.init;
      if (!init || init.type !== "CallExpression") continue;

      const callee = init.callee;
      if (callee.type !== "MemberExpression") continue;
      if (
        callee.property.type !== "Identifier" ||
        callee.property.name !== "update"
      )
        continue;

      const importName =
        callee.object.type === "Identifier" ? callee.object.name : "";

      // Unwrap TSAsExpression to get the ObjectExpression
      let arg = init.arguments[0];
      if (arg.type === "TSAsExpression") {
        arg = arg.expression;
      }
      if (arg.type !== "ObjectExpression") continue;

      // Find getParentRoute property
      let parentRouteName: string | undefined;
      for (const prop of arg.properties) {
        if (prop.type !== "Property") continue;
        if (
          prop.key.type !== "Identifier" ||
          prop.key.name !== "getParentRoute"
        )
          continue;

        if (
          prop.value.type === "ArrowFunctionExpression" &&
          prop.value.body.type === "Identifier"
        ) {
          parentRouteName = prop.value.body.name;
        }
        break;
      }

      routeDeclarations.push({
        routeConstName: variableName,
        routeImportName: importName,
        parentConstName: parentRouteName,
        routeOptionsCode: content.slice(arg.start, arg.end),
      });
    }
  }

  const rootImport = [...importsMap.values()].find((imp) => {
    return imp.relativePath.endsWith("__root");
  });

  if (rootImport) {
    mappings.set(rootImport.importName, {
      routeConstName: rootImport.importName,
      routeOptionsCode: "", // No .update() definition for root
      import: rootImport,
    });
  }

  // 2. Collect Route Constants and link with Imports
  for (const decl of routeDeclarations) {
    const {
      routeConstName,
      routeOptionsCode,
      routeImportName,
      parentConstName,
    } = decl;

    // Check if the route is defined using an imported variable
    const importData = importsMap.get(routeImportName);

    // This check is primarily for safety; all defined routes should have importData.
    if (importData) {
      mappings.set(routeConstName, {
        routeConstName,
        parent: parentConstName ? mappings.get(parentConstName) : undefined,
        routeOptionsCode,
        import: importData,
      });
    }
  }

  return mappings;
}

/**
 * Recursively finds all required ancestor routes.
 */
function traceAncestry(
  current: RouteMapping,
  rootConstName: string,
  requiredImports: string[] = [],
  requiredDefs: string[] = [],
  children: string[] = [],
  level = 0,
) {
  const parent = current.parent;

  const currName = current.routeConstName + (level > 0 ? "WithChildren" : "");

  // Add current route's import and definition
  requiredImports.push(current.import.importCode);

  if (current.routeOptionsCode) {
    let clonedDef = `const ${current.routeConstName} = createRoute(idOrPath({\n...${current.import.importName}.options,\n...${current.routeOptionsCode}\n}))`;
    if (current.parent?.routeConstName === rootConstName) {
      clonedDef = clonedDef.replace(
        `() => ${rootConstName}`,
        `() => ${rootConstName}Clone`,
      );
    }
    requiredDefs.push(clonedDef);
  }

  if (!parent) {
    // If parent is not found, we assume it's the ultimate root and stop tracing.

    const imports = requiredImports.join("\n");
    const routeDefinitions = requiredDefs.join("\n\n");
    const childrenCode = children.join("\n\n");

    const rootCloneName = `${current.routeConstName}Clone`;
    const rootCloneDef = `const ${rootCloneName} = createRootRoute({...${current.routeConstName}.options})`;
    const exportName =
      level > 0 ? `${rootCloneName}WithChildren` : rootCloneName;

    return `
import { createRoute, createRootRoute } from '@tanstack/react-router'
${imports}

function idOrPath(input) {
  const { id, path, ...rest } = input

  if (path) {
    return { path, ...rest }
  }

  return { id, ...rest }
}

${routeDefinitions}
${rootCloneDef}
${childrenCode}

export const routeTree = ${exportName}\n\n`;
  }

  const parentName =
    parent.routeConstName === rootConstName
      ? `${rootConstName}Clone`
      : parent.routeConstName;

  // Define the parent with children
  children.push(`const ${parentName}WithChildren = ${parentName}._addFileChildren({
  ${currName},
})`);

  // Recurse up the tree
  return traceAncestry(
    parent,
    rootConstName,
    requiredImports,
    requiredDefs,
    children,
    level + 1,
  );
}

/**
 * Core logic function to prune the TanStack Router route tree.
 * @param routeTreeContent The full content of routeTree.gen.ts.
 * @param targetRelativePath The relative path of the route to keep (e.g., './routes/_app/redemption-history/route').
 * @returns The pruned TypeScript content as a string, ready for the virtual module.
 */
export function pruneRouteTree(
  routeTreeContent: string,
  targetRelativePath: string,
): string {
  const routeMappings = parseRouteTree(routeTreeContent, targetRelativePath);
  const targetRouteMap = [...routeMappings.values()].find(
    (m) => m.import.relativePath === targetRelativePath,
  );

  if (!targetRouteMap) {
    throw new Error(
      `Could not find route definition for path: ${targetRelativePath}`,
    );
  }

  const rootMapping = [...routeMappings.values()].find((m) =>
    m.import.relativePath.endsWith("__root"),
  );
  const rootConstName = rootMapping?.routeConstName ?? "";

  const result = traceAncestry(targetRouteMap, rootConstName);
  const selfRelativePath = "./" + path.basename(targetRelativePath);
  const exportName = targetRouteMap.routeOptionsCode
    ? targetRouteMap.routeConstName
    : `${targetRouteMap.routeConstName}Clone`;
  return (
    result +
    `${exportName}.__root = routeTree\nexport { ${exportName} as Route }\nexport * from '${selfRelativePath}'\n`
  );
}
