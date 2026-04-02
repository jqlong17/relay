import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildFileTree } from "../../src/services/file-tree";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const current = tempDirs.pop();
    if (current) {
      fs.rmSync(current, { recursive: true, force: true });
    }
  }
});

describe("buildFileTree", () => {
  it("builds a folder tree for a directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "relay-tree-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "src", "index.ts"), "export {};\n", "utf8");
    fs.writeFileSync(path.join(root, "README.md"), "# Relay\n", "utf8");

    const tree = buildFileTree(root);

    expect(tree.kind).toBe("folder");
    expect(tree.children?.map((child) => child.name)).toEqual(["README.md", "src"]);
    expect(tree.children?.find((child) => child.name === "src")?.children?.[0]?.name).toBe(
      "index.ts",
    );
  });

  it("builds a file node for a file path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "relay-tree-file-"));
    tempDirs.push(root);
    const filePath = path.join(root, "single.ts");
    fs.writeFileSync(filePath, "export {};\n", "utf8");

    const tree = buildFileTree(filePath);

    expect(tree.kind).toBe("file");
    expect(tree.name).toBe("single.ts");
  });
});
