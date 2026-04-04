type FileTreeKind = "file" | "folder";

type FileTreeNode = {
  id: string;
  name: string;
  kind: FileTreeKind;
  path: string;
  hasChildren?: boolean;
  children?: FileTreeNode[];
};

export type { FileTreeKind, FileTreeNode };
