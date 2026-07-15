#!/usr/bin/env node
/**
 * uuutil CLI —— 面向本机外部工具的能力出口（薄转发器）。
 *
 * 用法：
 *   uuutil ping
 *   uuutil list
 *   uuutil help <plugin.action>
 *   uuutil call <plugin.action> --json '{"k":"v"}'
 *   echo '{"k":"v"}' | uuutil call <plugin.action>
 *
 * 输出：stdout 打印 JSON { ok, data?, error? }；exit code 0 成功、非 0 失败。
 * 通信：loopback HTTP，默认 127.0.0.1:17878（UUUTIL_CLI_PORT 覆盖）。
 */

import http from 'http';

interface CliResponse {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

const HOST = '127.0.0.1';

function resolvePort(): number {
  const raw = process.env.UUUTIL_CLI_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 17878;
}

function print(body: CliResponse): void {
  process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
}

function fail(code: string, message: string): never {
  print({ ok: false, error: { code, message } });
  process.exit(1);
}

/** 读取 --json 值；否则若 stdin 非 TTY 则读 stdin；都没有返回 undefined。 */
async function resolveArgsJson(flags: Map<string, string>): Promise<string | undefined> {
  const fromFlag = flags.get('json');
  if (fromFlag !== undefined) return fromFlag;
  if (process.stdin.isTTY) return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text.length > 0 ? text : undefined;
}

function parseFlags(argv: string[]): { positionals: string[]; flags: Map<string, string> } {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const eq = key.indexOf('=');
      if (eq >= 0) {
        flags.set(key.slice(0, eq), key.slice(eq + 1));
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags.set(key, next);
          i += 1;
        } else {
          flags.set(key, 'true');
        }
      }
    } else {
      positionals.push(token);
    }
  }
  return { positionals, flags };
}

function httpGet(path: string): Promise<CliResponse> {
  return request('GET', path);
}

function httpPost(path: string, body: unknown): Promise<CliResponse> {
  return request('POST', path, body);
}

function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<CliResponse> {
  const port = resolvePort();
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');

  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: HOST, port, path, method, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {} },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            resolve(JSON.parse(text) as CliResponse);
          } catch {
            reject(new Error(`响应不是合法 JSON：${text.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error(`连接不上 UUUtil（${HOST}:${port}），请先启动应用`));
      } else {
        reject(err);
      }
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { positionals, flags } = parseFlags(argv);
  const sub = positionals[0];

  if (!sub || sub === 'help' && positionals.length === 1 && flags.size === 0) {
    if (!sub) {
      fail('usage', '用法：uuutil <ping|list|help|call> ...');
    }
  }

  try {
    if (sub === 'ping') {
      const res = await httpGet('/ping');
      print(res);
      process.exit(res.ok ? 0 : 1);
    }

    if (sub === 'list') {
      const res = await httpGet('/list');
      print(res);
      process.exit(res.ok ? 0 : 1);
    }

    if (sub === 'help') {
      const command = positionals[1];
      if (!command) fail('usage', '用法：uuutil help <plugin.action>');
      const res = await httpGet(`/help?command=${encodeURIComponent(command)}`);
      print(res);
      process.exit(res.ok ? 0 : 1);
    }

    if (sub === 'call') {
      const command = positionals[1];
      if (!command) fail('usage', '用法：uuutil call <plugin.action> --json \'{...}\'');
      const argsJson = await resolveArgsJson(flags);
      let args: Record<string, unknown> = {};
      if (argsJson !== undefined) {
        try {
          const parsed = JSON.parse(argsJson);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            fail('bad_args', '--json / stdin 必须是一个 JSON 对象');
          }
          args = parsed as Record<string, unknown>;
        } catch (err) {
          fail('bad_args', `参数 JSON 解析失败：${err instanceof Error ? err.message : String(err)}`);
        }
      }
      const res = await httpPost('/cmd', { command, args });
      print(res);
      process.exit(res.ok ? 0 : 1);
    }

    fail('unknown_subcommand', `未知子命令：${sub}`);
  } catch (err) {
    fail('transport', err instanceof Error ? err.message : String(err));
  }
}

void main();
