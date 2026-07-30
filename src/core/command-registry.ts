/**
 * 命令注册表 —— CLI 面向外部工具的能力出口的内核底座。
 *
 * 插件在 activate 时通过 registerCommand() 声明式注册命令，CLI / HTTP server
 * 只负责转发，不持有任何插件业务知识；list / help 从本表实时生成。
 *
 * 命令 id 用 `plugin.action` 点号命名，与 bus 的 `plugin-id:action` 冒号命名区分。
 * handler 为 async，天然承载「一问一答」的请求/响应，调度层按超时兜底。
 */

import { info as logInfo, warn as logWarn, error as logError } from './logger';

/** 单个参数的结构描述，用于 App 侧校验与 help 输出。 */
export interface CommandParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'object';
  required: boolean;
  description?: string;
}

/** 一条命令的声明式定义。 */
export interface CommandDefinition {
  /** 命令 id，形如 plugin.action */
  command: string;
  /** 一句话描述，供 list / help */
  description: string;
  /** 参数结构，供 help 输出与轻量校验 */
  params?: CommandParam[];
  /** 命令示例参数（对象），供 help 展示 */
  example?: Record<string, unknown>;
  /** 实际执行体，返回值即命令结果 data。ctx 携带调用方生命周期信号（如 HTTP 连接断开）。 */
  handler: (args: Record<string, unknown>, ctx?: CommandContext) => Promise<unknown> | unknown;
  /** 可选：覆盖默认超时（ms）。阻塞式命令（如 reminder.ask）应放大。 */
  timeoutMs?: number;
}

/** 命令执行上下文：把调用方的生命周期信号传给 handler。 */
export interface CommandContext {
  /** 调用方提前断开（如 CLI HTTP 连接关闭）时 abort；长阻塞命令应监听它以及时收尾。 */
  signal?: AbortSignal;
}

/** 命令执行结果，序列化后即 CLI 拿到的 JSON。 */
export type CommandResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

const DEFAULT_TIMEOUT = 15000;
const COMMAND_ID_PATTERN = /^[a-z0-9-]+\.[a-z0-9-]+$/;

const commands = new Map<string, CommandDefinition>();

/** 声明式注册一条命令。重复 id 覆盖并告警。 */
export function registerCommand(def: CommandDefinition): void {
  if (!COMMAND_ID_PATTERN.test(def.command)) {
    logError('command', 'invalid_command_id', { command: def.command });
    throw new Error(`非法命令 id：${def.command}（应为 plugin.action）`);
  }
  if (commands.has(def.command)) {
    logWarn('command', 'command_overwritten', { command: def.command });
  }
  commands.set(def.command, def);
  logInfo('command', 'command_registered', { command: def.command });
}

/** 列出所有命令（id + 描述），供 list 元命令。 */
export function listCommands(): Array<{ command: string; description: string }> {
  return Array.from(commands.values())
    .map((c) => ({ command: c.command, description: c.description }))
    .sort((a, b) => a.command.localeCompare(b.command));
}

/** 反注册某个 scope（插件 id）下所有命令，形如 `scope.action`。返回被移除的命令数。 */
export function unregisterByScope(scope: string): number {
  const prefix = `${scope}.`;
  let removed = 0;
  for (const command of Array.from(commands.keys())) {
    if (command.startsWith(prefix)) {
      commands.delete(command);
      removed++;
    }
  }
  if (removed > 0) {
    logInfo('command', 'commands_unregistered_by_scope', { scope, removed });
  }
  return removed;
}

/** 取单条命令定义（去掉 handler），供 help 元命令。 */
export function describeCommand(command: string):
  | { command: string; description: string; params: CommandParam[]; example?: Record<string, unknown> }
  | null {
  const def = commands.get(command);
  if (!def) return null;
  return {
    command: def.command,
    description: def.description,
    params: def.params ?? [],
    example: def.example,
  };
}

/** 轻量参数校验：只检查必填项是否存在。深度校验交给插件自身。 */
function validateArgs(def: CommandDefinition, args: Record<string, unknown>): string | null {
  for (const p of def.params ?? []) {
    if (p.required && (args[p.name] === undefined || args[p.name] === null)) {
      return `缺少必填参数：${p.name}`;
    }
  }
  return null;
}

/** 调用一条命令，async + 超时兜底，永不抛出（统一转 CommandResult）。 */
export async function invokeCommand(
  command: string,
  args: Record<string, unknown> = {},
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<CommandResult> {
  const def = commands.get(command);
  if (!def) {
    logWarn('command', 'command_not_found', { command });
    return { ok: false, error: { code: 'not_found', message: `未知命令：${command}` } };
  }

  const invalid = validateArgs(def, args);
  if (invalid) {
    logWarn('command', 'command_invalid_args', { command, error: invalid });
    return { ok: false, error: { code: 'invalid_args', message: invalid } };
  }

  const effectiveTimeout = timeoutMs ?? def.timeoutMs ?? DEFAULT_TIMEOUT;
  const startedAt = Date.now();
  try {
    const data = await Promise.race([
      Promise.resolve(def.handler(args, { signal })),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('命令执行超时')), effectiveTimeout),
      ),
    ]);
    logInfo('command', 'command_completed', { command, durationMs: Date.now() - startedAt });
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = message === '命令执行超时';
    logError('command', 'command_failed', { command, durationMs: Date.now() - startedAt, timedOut, error: message });
    return { ok: false, error: { code: timedOut ? 'timeout' : 'handler_error', message } };
  }
}
