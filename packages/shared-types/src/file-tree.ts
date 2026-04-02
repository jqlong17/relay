type FileTreeKind = "file" | "folder";

type FileTreeNode = {
  id: string;
  name: string;
  kind: FileTreeKind;
  path: string;
  children?: FileTreeNode[];
};

export type { FileTreeKind, FileTreeNode };
