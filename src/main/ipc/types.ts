/**
 * IPC 注册表类型定义。
 *
 * 一个「IPC 模块」是一组通道声明，每条声明同时承载运行时 handler。
 * 通过 defineInvoke / defineSend 声明，再由 registerIpcModules 统一注册，
 * 消除「index.ts handler / preload 转发 / 渲染层类型」三处重复定义。
 */

import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';

/** ipcMain.handle 通道：renderer→main 带返回值 */
export interface IpcInvokeDef {
  channel: string;
  kind: 'invoke';
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown;
}

/** ipcMain.on 通道：renderer→main 单向无返回 */
export interface IpcSendDef {
  channel: string;
  kind: 'send';
  handler: (event: IpcMainEvent, ...args: any[]) => void;
}

export type IpcDef = IpcInvokeDef | IpcSendDef;

export interface IpcModule {
  /** 命名空间，仅用于校验与日志（core:* 内核 / plugin-id:* 插件）。 */
  namespace: string;
  defs: IpcDef[];
}

export function defineInvoke(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
): IpcInvokeDef {
  return { channel, kind: 'invoke', handler };
}

export function defineSend(
  channel: string,
  handler: (event: IpcMainEvent, ...args: any[]) => void,
): IpcSendDef {
  return { channel, kind: 'send', handler };
}
