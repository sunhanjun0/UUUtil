/**
 * 事件总线 —— 模块间通信的唯一合法通道
 *
 * 铁律：插件之间禁止直接 import，所有跨模块通信必须走这里
 */
export type EventHandler = (...args: any[]) => void;

class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();

  /** 监听事件 */
  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  /** 监听一次事件 */
  once(event: string, handler: EventHandler): void {
    const wrappedHandler: EventHandler = (...args) => {
      this.off(event, wrappedHandler);
      handler(...args);
    };
    this.on(event, wrappedHandler);
  }

  /** 取消监听 */
  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  /** 触发事件（同步） */
  emit(event: string, ...args: any[]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[EventBus] 事件 "${event}" 处理器出错:`, err);
        // 不抛异常，一个插件挂了不影响其他插件
      }
    }
  }

  /** 调试用：列出所有已注册事件 */
  debug(): string[] {
    const result: string[] = [];
    for (const [event, handlers] of this.listeners) {
      result.push(`${event} (${handlers.size} listeners)`);
    }
    return result;
  }
}

/** 全局单例 */
export const bus = new EventBus();
