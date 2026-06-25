/**
 * 终端 IPC 模块。
 *
 * 安全说明：终端是完整交互式 shell，仅供用户手动操作，严禁暴露给 AI。
 * 输出（core:terminal:data / :exit）由 createTerminalSession 内部 sender.send 推送，
 * 不在此注册。
 */

import { defineInvoke, defineSend } from './types';
import type { IpcModule } from './types';
import {
  createTerminalSession,
  writeTerminal,
  resizeTerminal,
  disposeTerminal,
  type CreateTerminalOptions,
} from '../terminal';

export const terminalIpc: IpcModule = {
  namespace: 'core:terminal',
  defs: [
    defineInvoke('core:terminal:create', (event, options?: CreateTerminalOptions) =>
      createTerminalSession(event.sender, options)),
    defineSend('core:terminal:input', (_event, id: string, data: string) => writeTerminal(id, data)),
    defineSend('core:terminal:resize', (_event, id: string, cols: number, rows: number) => resizeTerminal(id, cols, rows)),
    defineSend('core:terminal:dispose', (_event, id: string) => disposeTerminal(id)),
  ],
};
