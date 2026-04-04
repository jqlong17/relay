import fs from "node:fs";
import path from "node:path";

import type { FileTreeNode } from "@relay/shared-types";

function buildFileTree(rootPath: string, maxDepth = 2): FileTreeNode {
  const stat = fs.statSync(rootPath);
  const name = path.basename(rootPath);

  if (!stat.isDirectory()) {
    return {
      id: rootPath,
      name,
      kind: "file",
      path: rootPath,
    };
  }

  return {
    id: rootPath,
    name,
    kind: "folder",
    path: rootPath,
    hasChildren: directoryHasVisibleChildren(rootPath),
    children: readChildren(rootPath, 0, maxDepth),
  };
}

function readChildren(currentPath: string, depth: number, maxDepth: number): FileTreeNode[] {
  if (depth >= maxDepth) {
    return [];
  }

  return fs
    .readdirSync(currentPath, { withFileTypes: true })
    .filter((entry) => entry.name !== ".DS_Store")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const nextPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        const hasChildren = directoryHasVisibleChildren(nextPath);

        if (depth + 1 >= maxDepth) {
          return {
            id: nextPath,
            name: entry.name,
            kind: "folder" as const,
            path: nextPath,
            hasChildren,
          };
        }

        return {
          id: nextPath,
          name: entry.name,
          kind: "folder" as const,
          path: nextPath,
          hasChildren,
          children: readChildren(nextPath, depth + 1, maxDepth),
        };
      }

      return {
        id: nextPath,
        name: entry.name,
        kind: "file" as const,
        path: nextPath,
      };
    });
}

function directoryHasVisibleChildren(currentPath: string) {
  return fs
    .readdirSync(currentPath, { withFileTypes: true })
    .some((entry) => entry.name !== ".DS_Store");
}

export { buildFileTree };
