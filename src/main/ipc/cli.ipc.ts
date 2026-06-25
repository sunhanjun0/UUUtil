/**
 * CLI IPC 模块：执行受沙箱限制的 shell 命令。
 */

import { warn as logWarn } from '../../core';
import { defineInvoke } from './types';
import type { IpcModule } from './types';
import { executeCliCommand } from '../cli';
import type { CliCommandRequest, CliCommandResult } from '../../shared/types';

export const cliIpc: IpcModule = {
  namespace: 'core:cli',
  defs: [
    defineInvoke('core:cli:execute', async (_event, request: CliCommandRequest) => {
      try {
        return await executeCliCommand(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'CLI 命令执行失败';
        logWarn('cli', 'command_rejected', { command: request.command, cwd: request.cwd, error: message });
        return {
          success: false,
          command: request.command,
          cwd: process.cwd(),
          stdout: '',
          stderr: '',
          durationMs: 0,
          error: message,
        } satisfies CliCommandResult;
      }
    }),
  ],
};
