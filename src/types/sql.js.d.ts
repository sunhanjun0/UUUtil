declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  interface Database {
    run(sql: string, params?: any[]): void;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
  }

  interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    get(): any[];
    getAsObject(): Record<string, any>;
    free(): void;
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export function Database(data?: ArrayLike<number> | Buffer | null): Database;
  export default function initSqlJs(config?: any): Promise<SqlJsStatic>;
}
