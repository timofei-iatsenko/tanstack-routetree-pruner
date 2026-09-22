import { Project, SyntaxKind } from "ts-morph";
import path from "node:path";

interface RouteMapping {
  routeConstName: string;
  definitionCode: string; // Full code for the const declaration
  parent?: RouteMapping;
  import: ImportDefinition;
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

  const project = new Project();
  const sourceFile = project.createSourceFile("routeTree.gen.ts", content);

  // 1. Collect all Imports
  sourceFile.getImportDeclarations().forEach((declaration) => {
    if (declaration.getNamedImports()[0].getName() !== "Route") {
      return;
    }

    const importName = declaration
      .getNamedImports()[0]
      .getAliasNode()
      ?.getText();

    if (!importName) {
      throw new Error("Import should be Aliased incorrect structure");
    }

    const relativePath = declaration.getModuleSpecifierValue();

    const newRelativePath = path.relative(
      path.resolve(targetRelativePath, "../"),
      declaration.getModuleSpecifierValue(),
    );

    declaration.setModuleSpecifier(
      !newRelativePath.startsWith(".")
        ? "./" + newRelativePath
        : newRelativePath,
    );

    importsMap.set(importName, {
      importName: importName,
      relativePath: relativePath,
      importCode: declaration.getText(),
    });

    return {};
  });

  const mappings = new Map<string, RouteMapping>();

  const routeDeclarations = sourceFile
    .getVariableDeclarations()
    .filter((variableDeclaration) => {
      return variableDeclaration.getName().endsWith("Route");
    })
    .map((variableDeclaration) => {
      const variableName = variableDeclaration.getName();

      // The initializer is PostalRequestCodeImport.update({...}) as any
      const callExpression = variableDeclaration.getInitializerIfKindOrThrow(
        SyntaxKind.CallExpression,
      );

      // 3. The function being called is a PropertyAccessExpression (e.g., Import.update)
      const propertyAccess = callExpression.getExpressionIfKindOrThrow(
        SyntaxKind.PropertyAccessExpression,
      );

      // Extract the Import Name from the expression before '.update'
      const importName = propertyAccess.getExpression().getText();

      // 4. Get the first argument of the call (the route object literal: {...})
      const objectLiteral = callExpression
        .getArguments()[0]
        .getFirstChildByKindOrThrow(SyntaxKind.ObjectLiteralExpression);

      // 5. Find the 'getParentRoute' property assignment
      const parentRouteName = objectLiteral
        .getProperty("getParentRoute")
        ?.asKindOrThrow(SyntaxKind.PropertyAssignment)
        ?.getInitializer()
        ?.getFirstChildByKindOrThrow(SyntaxKind.Identifier)
        .getText();

      // remove `as any`
      variableDeclaration
        .getParent()
        .getDescendantsOfKind(SyntaxKind.AsExpression)
        .forEach((asExpr) => {
          asExpr.replaceWithText(asExpr.getExpression().getText());
        });

      return {
        routeConstName: variableName,
        routeImportName: importName,
        parentConstName: parentRouteName,
        definitionCode: variableDeclaration.getParent().getText(),
      };
    });

  const rootImport = [...importsMap.values()].find((imp) => {
    return imp.relativePath.endsWith("__root");
  });

  if (rootImport) {
    mappings.set(rootImport.importName, {
      routeConstName: rootImport.importName,
      definitionCode: "", // No .update() definition for root
      import: rootImport,
    });
  }

  // 2. Collect Route Constants and link with Imports
  for (const decl of routeDeclarations) {
    const { definitionCode, routeConstName, routeImportName, parentConstName } =
      decl;

    // Check if the route is defined using an imported variable
    const importData = importsMap.get(routeImportName);

    // This check is primarily for safety; all defined routes should have importData.
    if (importData) {
      mappings.set(routeConstName, {
        routeConstName,
        parent: parentConstName ? mappings.get(parentConstName) : undefined,
        definitionCode,
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

  if (current.definitionCode) {
    let clonedDef = current.definitionCode.replace(
      `${current.import.importName}.update({`,
      `createRoute({}).update({...${current.import.importName}.options,`,
    );
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
  const exportName = targetRouteMap.definitionCode
    ? targetRouteMap.routeConstName
    : `${targetRouteMap.routeConstName}Clone`;
  return result + `export { ${exportName} as Route }\n`;
}
