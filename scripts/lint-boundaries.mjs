import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const layers = [
  { name: "core", directory: "packages/core/src", allowedWorkspaceImports: [] },
  { name: "contracts", directory: "packages/contracts/src", allowedWorkspaceImports: ["core"] },
  { name: "content", directory: "packages/content/src", allowedWorkspaceImports: ["core", "contracts"] },
];
const forbiddenRuntimePatterns = [
  [/(?:from|import\()\s*["']react(?:-dom)?(?:\/[^"']*)?["']/, "React import"],
  [/\b(?:window|document|localStorage|sessionStorage|indexedDB)\b/, "browser API"],
  [/\bDate\.now\s*\(/, "wall-clock API"],
  [/\bMath\.random\s*\(/, "unseeded randomness"],
];

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(path)) ? [path] : [];
  });
}

const violations = [];
for (const layer of layers) {
  const directory = join(root, layer.directory);
  for (const file of sourceFiles(directory)) {
    const source = readFileSync(file, "utf8");
    for (const [pattern, label] of forbiddenRuntimePatterns) {
      if (pattern.test(source)) violations.push(`${relative(root, file)}: ${label} is not allowed in domain packages`);
    }
    for (const match of source.matchAll(/@banker-simulation\/([a-z-]+)/g)) {
      const dependency = match[1];
      if (dependency && !layer.allowedWorkspaceImports.includes(dependency)) {
        violations.push(`${relative(root, file)}: ${layer.name} may not import ${dependency}`);
      }
    }
  }
}

if (violations.length > 0) {
  for (const violation of violations) console.error(violation);
  process.exitCode = 1;
} else {
  console.log("Package boundaries are clean.");
}
