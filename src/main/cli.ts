/**
 * CLI 命令执行 —— 沙箱限制在用户主目录内，拦截高风险命令，带超时与输出截断。
 */

import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { debug as logDebug, info as logInfo, warn as logWarn, error as logError } from '../core';
import type { CliCommandRequest, CliCommandResult } from '../shared/types';

const CLI_DEFAULT_TIMEOUT = 30000;
const CLI_MAX_TIMEOUT = 120000;
const CLI_MAX_OUTPUT_LENGTH = 12000;
const CLI_LOG_PREVIEW_LENGTH = 2000;

const BLOCKED_CLI_PATTERNS = [
  /(^|\s)rm\s+(-[^\s]*[rf][^\s]*|-r|-f)\b/,
  /(^|\s)sudo\b/,
  /(^|\s)su\b/,
  /(^|\s)chmod\s+-R\b/,
  /(^|\s)chown\s+-R\b/,
  /(^|\s)dd\b/,
  /(^|\s)mkfs\b/,
  /(^|\s)diskutil\s+(erase|partition|unmountDisk)\b/,
  /(^|\s)shutdown\b/,
  /(^|\s)reboot\b/,
  /(^|\s)killall\b/,
  /(^|\s)pkill\b/,
  /(^|\s)curl\b[\s\S]*\|\s*(sh|bash|zsh)\b/,
];

function appendLimited(current: string, chunk: Buffer | string): string {
  const next = current + chunk.toString();
  if (next.length <= CLI_MAX_OUTPUT_LENGTH) return next;
  return `${next.slice(0, CLI_MAX_OUTPUT_LENGTH)}\n...[输出已截断]`;
}

/** 截取输出预览，用于日志记录（避免单行日志过长） */
function previewOutput(text: string, maxLength = CLI_LOG_PREVIEW_LENGTH): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...[共 ${text.length} 字符]`;
}

function validateCliCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) throw new Error('命令不能为空');
  if (trimmed.length > 1000) throw new Error('命令过长');
  if (BLOCKED_CLI_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    throw new Error('该命令包含高风险操作，已被阻止');
  }
  return trimmed;
}

function resolveCliCwd(cwd?: string): string {
  const homeDir = os.homedir();
  const expanded = cwd
    ? (cwd === '~' || cwd.startsWith('~/') ? path.join(homeDir, cwd.slice(1)) : cwd)
    : homeDir;
  const resolved = path.resolve(homeDir, expanded);
  const relative = path.relative(homeDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('CLI 工作目录必须位于用户主目录内');
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error('CLI 工作目录不存在');
  }
  return resolved;
}

export function executeCliCommand(input: CliCommandRequest): Promise<CliCommandResult> {
  const command = validateCliCommand(input.command);
  const cwd = resolveCliCwd(input.cwd);
  const timeoutMs = Math.min(Math.max(input.timeoutMs || CLI_DEFAULT_TIMEOUT, 1000), CLI_MAX_TIMEOUT);
  const shell = process.env.SHELL || '/bin/zsh';
  const startedAt = Date.now();

  logInfo('cli', 'command_started', { command, cwd, timeoutMs, shell });

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const child = spawn(command, [], {
      cwd,
      shell,
      env: process.env,
    });

    logDebug('cli', 'command_spawned', { command, pid: child.pid, cwd });

    const finish = (result: Omit<CliCommandResult, 'command' | 'cwd' | 'stdout' | 'stderr' | 'durationMs'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      const response: CliCommandResult = {
        command,
        cwd,
        stdout,
        stderr,
        durationMs,
        ...result,
      };
      const meta = {
        command,
        cwd,
        pid: child.pid,
        exitCode: response.exitCode,
        durationMs,
        timedOut: response.timedOut,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
        error: response.error,
      };
      if (response.success) {
        logInfo('cli', 'command_completed', meta);
      } else {
        logError('cli', 'command_failed', meta);
      }
      // 完整输出预览记录到 debug 级别，便于排查问题且不污染常规日志
      logDebug('cli', 'command_output', {
        command,
        stdout: previewOutput(stdout),
        stderr: previewOutput(stderr),
      });
      resolve(response);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      logWarn('cli', 'command_timeout', { command, pid: child.pid, timeoutMs });
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout = appendLimited(stdout, chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = appendLimited(stderr, chunk);
    });
    child.on('error', (error) => {
      logError('cli', 'command_spawn_error', { command, error: error.message });
      finish({ success: false, error: error.message, timedOut });
    });
    child.on('close', (exitCode) => {
      finish({ success: exitCode === 0 && !timedOut, exitCode: exitCode ?? undefined, timedOut, error: timedOut ? '命令执行超时' : undefined });
    });
  });
}
