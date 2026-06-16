/**
 * hello-world 插件 —— 对外 API
 *
 * 铁律：这是插件暴露给外部的唯一合法访问入口
 * 其他地方禁止 import 此插件内部实现的任何文件
 */

import type { HelloWorldApi } from '../../shared/types';

export const api: HelloWorldApi = {
  greet(name: string): string {
    return `你好，${name}！来自 hello-world 插件 👋`;
  },
};
