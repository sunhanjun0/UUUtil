import http, { IncomingMessage, Server, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { info as logInfo, warn as logWarn, error as logError } from '../core/logger';
import { registerFocusTools } from './focus-tools';

export interface McpHttpServiceOptions {
  host?: string;
  port?: number;
  path?: string;
}

export interface McpHttpServiceHandle {
  host: string;
  port: number;
  path: string;
  url: string;
  close: () => Promise<void>;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 17878;
const DEFAULT_PATH = '/mcp';

function createServer(): McpServer {
  const server = new McpServer({ name: 'uuutil-mcp', version: '0.1.0' });
  registerFocusTools(server);
  return server;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve(undefined);
      try { resolve(JSON.parse(raw)); }
      catch (error) { reject(error); }
    });
  });
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export async function startMcpHttpService(options: McpHttpServiceOptions = {}): Promise<McpHttpServiceHandle> {
  const host = options.host || process.env.UUUTIL_MCP_HOST || DEFAULT_HOST;
  const port = Number(options.port || process.env.UUUTIL_MCP_PORT || DEFAULT_PORT);
  const servicePath = options.path || process.env.UUUTIL_MCP_PATH || DEFAULT_PATH;
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const servers = new Map<string, McpServer>();

  const httpServer: Server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);

      if (requestUrl.pathname === '/health') {
        writeJson(res, 200, { ok: true, service: 'uuutil-mcp-http' });
        return;
      }

      if (requestUrl.pathname !== servicePath) {
        writeJson(res, 404, { error: 'not_found' });
        return;
      }

      if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') {
        writeJson(res, 405, { error: 'method_not_allowed' });
        return;
      }

      const headerSessionId = String(req.headers['mcp-session-id'] || '');
      let transport = headerSessionId ? transports.get(headerSessionId) : undefined;
      let mcpServer = headerSessionId ? servers.get(headerSessionId) : undefined;

      if (!transport || !mcpServer) {
        mcpServer = createServer();
        transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });
        await mcpServer.connect(transport);
        transport.onclose = () => {
          const closedSessionId = transport?.sessionId;
          if (closedSessionId) {
            transports.delete(closedSessionId);
            servers.delete(closedSessionId);
          }
        };
      }

      const body = req.method === 'POST' ? await readBody(req) : undefined;
      await transport.handleRequest(req, res, body);

      const activeSessionId = transport.sessionId;
      if (activeSessionId) {
        transports.set(activeSessionId, transport);
        servers.set(activeSessionId, mcpServer);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('mcp:http', 'request_failed', { error: message });
      if (!res.headersSent) {
        writeJson(res, 500, {
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      } else {
        res.end();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  const url = `http://${host}:${port}${servicePath}`;
  logInfo('mcp:http', 'service_started', { url });

  return {
    host,
    port,
    path: servicePath,
    url,
    close: async () => {
      logInfo('mcp:http', 'service_stopping', { url });
      for (const transport of transports.values()) {
        try { await transport.close(); }
        catch (error) { logWarn('mcp:http', 'transport_close_failed', { error: error instanceof Error ? error.message : String(error) }); }
      }
      transports.clear();
      for (const server of servers.values()) {
        try { await server.close(); }
        catch (error) { logWarn('mcp:http', 'server_close_failed', { error: error instanceof Error ? error.message : String(error) }); }
      }
      servers.clear();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => error ? reject(error) : resolve());
      });
      logInfo('mcp:http', 'service_stopped', { url });
    },
  };
}
