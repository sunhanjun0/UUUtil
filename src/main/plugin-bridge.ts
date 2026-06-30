/**
 * 插件桥接 —— 通过 EventBus 向插件发起「请求/响应」式调用。
 *
 * 内核不直接 import 插件实现，统一走 bus.emit/bus.on（遵循插件隔离铁律）。
 */

import { bus } from '../core';

const PLUGIN_RESPONSE_TIMEOUT = 5000;

interface PluginResultMessage<T = any> {
  action: string;
  result: T;
}

export function waitForPluginEvent<T>(
  event: string,
  emitEvent: string,
  args: any[],
  match?: (data: T) => boolean,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      bus.offDynamic(event, handler);
      reject(new Error(`插件事件超时: ${event}`));
    }, PLUGIN_RESPONSE_TIMEOUT);

    const handler = (data: T) => {
      if (match && !match(data)) return;
      clearTimeout(timeout);
      bus.offDynamic(event, handler);
      resolve(data);
    };

    bus.onDynamic(event, handler);
    bus.emitDynamic(emitEvent, ...args);
  });
}

export function invokeActionPlugin<T>(responseEvent: string, action: string, emitEvent: string, args: any[]): Promise<T> {
  return waitForPluginEvent<PluginResultMessage<T>>(
    responseEvent,
    emitEvent,
    args,
    (message) => message.action === action,
  ).then((data) => data.result);
}
