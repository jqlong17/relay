declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    prepare(sql: string): {
      run(params?: unknown): unknown;
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    };
    close(): void;
  }
}
