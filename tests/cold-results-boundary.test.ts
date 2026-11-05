import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Children, Suspense, isValidElement, type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { build } from "esbuild";

function localResultsBoundary(source: ts.SourceFile) {
  let results: ts.JsxSelfClosingElement | undefined;
  function findResults(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "Results") results = node;
    ts.forEachChild(node, findResults);
  }
  findResults(source);
  assert.ok(results, "Inspect the actual Results render site");
  let parent: ts.Node | undefined = results.parent;
  while (parent && !(ts.isJsxElement(parent) && parent.openingElement.tagName.getText(source) === "Suspense")) parent = parent.parent;
  assert.ok(parent && ts.isJsxElement(parent), "The lazy Results render site needs a local Suspense boundary so it cannot disconnect DateAtlas’s layout effects");
  return { results, boundary: parent };
}

test("a cold Results chunk stays inside its local Suspense boundary with the selected loading theme", async () => {
  const path = join(process.cwd(), "components/date-atlas/date-atlas.tsx");
  const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements.flatMap((statement) => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
    .find(({ name }) => ts.isIdentifier(name) && name.text === "Results");
  assert.ok(declaration?.initializer && ts.isCallExpression(declaration.initializer), "Results must keep its actual dynamic component declaration");
  const { results, boundary } = localResultsBoundary(source);
  const removedBoundary = source.text.slice(0, boundary.getStart(source)) + results.getText(source) + source.text.slice(boundary.getEnd());
  const unboundedSource = ts.createSourceFile(path, removedBoundary, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.throws(() => localResultsBoundary(unboundedSource), /needs a local Suspense boundary/, "Removing only the actual wrapper must reproduce this regression");

  const transformed = ts.transform<ts.Node>(boundary, [(context) => (node) => {
    const visitor: ts.Visitor = (child) => child === results
      ? ts.factory.createJsxSelfClosingElement(results.tagName, undefined, ts.factory.createJsxAttributes([]))
      : ts.visitEachChild(child, visitor, context);
    return ts.visitNode(node, visitor) ?? node;
  }]);
  const renderSite = ts.createPrinter().printNode(ts.EmitHint.Expression, transformed.transformed[0], source);
  transformed.dispose();

  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "cold-results-boundary-test-"));
  try {
    const output = join(directory, "results.mjs");
    await build({
      stdin: {
        contents: `import { Suspense } from "react"; import dynamic from "next/dist/shared/lib/app-dynamic.js"; function GeneratingScreen() { return null; } const Results = ${declaration.initializer.getText(source)}; function renderResultsBoundary(plannerAppearance) { return ${renderSite}; } export { Results, GeneratingScreen, renderResultsBoundary };`,
        resolveDir: join(process.cwd(), "components/date-atlas"),
        loader: "tsx",
      },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic", logLevel: "silent",
      plugins: [{ name: "isolate-cold-results-module", setup(plugin) {
        plugin.onResolve({ filter: /^\.\/results$/ }, () => ({ path: "results-fixture", namespace: "cold-results" }));
        plugin.onLoad({ filter: /.*/, namespace: "cold-results" }, () => ({ contents: 'export function Results() { throw new Error("The cold Results module must not render during boundary inspection"); }', loader: "js" }));
      } }],
    });
    type Theme = "white" | "red" | "dark";
    type FallbackProps = { theme: Theme; stage: string };
    const fixture: {
      Results: (props: Record<string, never>) => ReactElement;
      GeneratingScreen: () => null;
      renderResultsBoundary: (theme: Theme) => ReactElement<{ fallback: ReactElement<FallbackProps>; children: ReactNode }>;
    } = await import(pathToFileURL(output).href);
    for (const theme of ["white", "red", "dark"] as const) {
      const boundary = fixture.renderResultsBoundary(theme);
      assert.equal(boundary.type, Suspense, "Contain the cold App Router Results chunk below DateAtlas");
      const children = Children.toArray(boundary.props.children);
      assert.equal(children.length, 1);
      assert.ok(isValidElement(children[0]));
      assert.equal(children[0].type, fixture.Results, "The boundary must contain the actual App Router dynamic Results component");
      assert.ok(isValidElement(boundary.props.fallback), "The result chunk must show its loading fallback while it is cold");
      assert.equal(boundary.props.fallback.type, fixture.GeneratingScreen, "The cold chunk must retain the generating overlay's focus, inertness and body-scroll lifecycle");
      assert.equal(boundary.props.fallback.props.theme, theme);
      assert.equal(boundary.props.fallback.props.stage, "Getting your date ready to reveal…");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
