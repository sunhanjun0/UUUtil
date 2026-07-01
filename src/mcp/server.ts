import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { initDatabase, closeDatabase, flushDatabase } from '../core/db';
import { initAi } from '../core/ai';
import { closeLogger, initLoggerAt, info as logInfo } from '../core/logger';
import { initializeDatabase as initializeFocusDatabase } from '../plugins/focus';
import { registerFocusTools } from './focus-tools';

const DEFAULT_HTTP_URL = 'http://127.0.0.1:17878/mcp';

function getArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function resolveDbPath(): string | undefined {
  const arg = getArgValue('db');
  if (arg) return path.resolve(arg);
  if (process.env.UUUTIL_DB_PATH) return path.resolve(process.env.UUUTIL_DB_PATH);
  return undefined;
}

function resolveLogDir(dbPath: string | undefined): string {
  if (process.env.UUUTIL_LOG_DIR) return path.resolve(process.env.UUUTIL_LOG_DIR);
  if (dbPath) return path.join(path.dirname(dbPath), 'logs');
  return path.join(process.cwd(), '.data', 'logs');
}

function resolveHttpUrl(): string {
  return getArgValue('url') || process.env.UUUTIL_MCP_URL || DEFAULT_HTTP_URL;
}

class StdioHttpProxy {
  private stdio = new StdioServerTransport();
  private http: StreamableHTTPClientTransport;
  private closing = false;

  constructor(url: string) {
    this.http = new StreamableHTTPClientTransport(new URL(url));
  }

  async start(): Promise<void> {
    this.stdio.onmessage = (message) => {
      this.http.send(message).catch((error) => {
        this.stdio.onerror?.(error instanceof Error ? error : new Error(String(error)));
      });
    };
    this.http.onmessage = (message) => {
      this.stdio.send(message).catch((error) => {
        this.http.onerror?.(error instanceof Error ? error : new Error(String(error)));
      });
    };
    this.stdio.onerror = (error) => this.http.onerror?.(error);
    this.http.onerror = (error) => {
      console.error('[uuutil-mcp-proxy]', error.message);
    };
    this.stdio.onclose = () => void this.close();
    this.http.onclose = () => void this.close();

    await this.http.start();
    await this.stdio.start();
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    await Promise.allSettled([this.stdio.close(), this.http.close()]);
  }
}

async function bootstrapProxy(): Promise<void> {
  console.log = (...args: unknown[]) => console.error(...args);
  const url = resolveHttpUrl();
  console.error(`[uuutil-mcp] proxying stdio to ${url}`);
  const proxy = new StdioHttpProxy(url);
  await proxy.start();

  const shutdown = () => {
    void proxy.close();
  };

  process.once('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });
}

async function bootstrapDirectDb(): Promise<void> {
  console.log = (...args: unknown[]) => console.error(...args);

  const dbPath = resolveDbPath();
  initLoggerAt(resolveLogDir(dbPath));
  logInfo('mcp', 'MCP 直连数据库服务启动', { dbPath: dbPath || 'default' });

  await initDatabase(dbPath);
  initAi();
  initializeFocusDatabase();

  const server = new McpServer({ name: 'uuutil-mcp-direct', version: '0.1.0' });
  registerFocusTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = () => {
    logInfo('mcp', 'MCP 直连数据库服务退出');
    flushDatabase();
    closeDatabase();
    closeLogger();
  };

  process.once('exit', shutdown);
  process.once('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });
}

const bootstrap = hasFlag('direct-db') ? bootstrapDirectDb : bootstrapProxy;

bootstrap().catch((error) => {
  console.error('[uuutil-mcp] failed to start:', error);
  closeDatabase();
  closeLogger();
  process.exit(1);
});
