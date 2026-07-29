/**
 * CLI loopback HTTP server —— UUUtil 面向本机外部工具的能力出口。
 *
 * 只绑 127.0.0.1，不做鉴权（本机自用）。将外部命令转发给命令注册表执行，
 * 回传结构化 JSON。内部代码一律直接用 bus / api，不经过本服务。
 *
 * 路由：
 *   GET  /ping             探活
 *   GET  /list             列出所有已注册命令
 *   GET  /help?command=x   查看某命令的参数 schema 与示例
 *   POST /cmd              执行命令 { command, args }
 */

import http from 'http';
import { info as logInfo, warn as logWarn, error as logError } from '../core';
import { invokeCommand, listCommands, describeCommand } from '../core';

export interface CliServerHandle {
  close: () => Promise<void>;
  port: number;
}

const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 256 * 1024;

function resolvePort(): number {
  const raw = process.env.UUUTIL_CLI_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 17878;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
  });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  const method = req.method ?? 'GET';

  if (method === 'GET' && url.pathname === '/ping') {
    sendJson(res, 200, { ok: true, data: { service: 'uuutil-cli', pong: true } });
    return;
  }

  if (method === 'GET' && url.pathname === '/list') {
    sendJson(res, 200, { ok: true, data: listCommands() });
    return;
  }

  if (method === 'GET' && url.pathname === '/help') {
    const command = url.searchParams.get('command') ?? '';
    const desc = describeCommand(command);
    if (!desc) {
      sendJson(res, 404, { ok: false, error: { code: 'not_found', message: `未知命令：${command}` } });
      return;
    }
    sendJson(res, 200, { ok: true, data: desc });
    return;
  }

  if (method === 'POST' && url.pathname === '/cmd') {
    let parsed: { command?: unknown; args?: unknown };
    try {
      const raw = await readBody(req);
      parsed = raw ? JSON.parse(raw) : {};
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { ok: false, error: { code: 'bad_request', message } });
      return;
    }

    const command = typeof parsed.command === 'string' ? parsed.command : '';
    if (!command) {
      sendJson(res, 400, { ok: false, error: { code: 'bad_request', message: '缺少 command 字段' } });
      return;
    }
    const args =
      parsed.args && typeof parsed.args === 'object' && !Array.isArray(parsed.args)
        ? (parsed.args as Record<string, unknown>)
        : {};

    const result = await invokeCommand(command, args);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  sendJson(res, 404, { ok: false, error: { code: 'not_found', message: '未知路由' } });
}

/** 启动 CLI HTTP server；端口占用等错误只告警，不阻断应用启动。 */
export function startCliServer(retryCount: number = 1): Promise<CliServerHandle | null> {
  const port = resolvePort();

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        logError('cli:http', 'request_failed', { error: message });
        if (!res.headersSent) {
          sendJson(res, 500, { ok: false, error: { code: 'internal', message } });
        }
      });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && retryCount > 0) {
        // 如果是端口占用，等待 200ms 后重试（TIME_WAIT 端口可能刚释放）
        logWarn('cli:http', 'address_inuse_retry', { port, retryLeft: retryCount });
        setTimeout(() => {
          server.close();
          startCliServer(retryCount - 1).then(resolve);
        }, 200);
        return;
      }
      logWarn('cli:http', 'server_error', { code: err.code, error: err.message });
      resolve(null);
    });

    server.listen(port, HOST, () => {
      logInfo('cli:http', 'server_started', { host: HOST, port });
      resolve({
        port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
