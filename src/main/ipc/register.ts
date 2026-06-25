/**
 * IPC 模块注册器：遍历模块声明，按 kind 注册到 ipcMain，并校验通道唯一性。
 */

import { ipcMain } from 'electron';
import { info as logInfo, warn as logWarn } from '../../core';
import type { IpcModule } from './types';

export function registerIpcModules(modules: IpcModule[]): void {
  const seen = new Set<string>();
  let count = 0;

  for (const module of modules) {
    for (const def of module.defs) {
      if (seen.has(def.channel)) {
        logWarn('ipc', 'duplicate_channel', { channel: def.channel, namespace: module.namespace });
        continue;
      }
      seen.add(def.channel);

      if (def.kind === 'invoke') {
        ipcMain.handle(def.channel, def.handler);
      } else {
        ipcMain.on(def.channel, def.handler);
      }
      count += 1;
    }
  }

  logInfo('ipc', 'modules_registered', { moduleCount: modules.length, channelCount: count });
}
