/**
 * 事件总线 —— 模块间通信的唯一合法通道
 *
 * 铁律：插件之间禁止直接 import，所有跨模块通信必须走这里
 */
import { error as logError } from './logger';
import type { AppEventMap, AppEventName, AppEventHandler } from '../shared/event-map';

export type EventHandler = (...args: any[]) => void;
type EventArgs<K extends AppEventName> = AppEventMap[K];

class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();

  /** 监听事件 */
  on<K extends AppEventName>(event: K, handler: AppEventHandler<K>): void {
    this.addListener(event, handler as EventHandler);
  }

  /** 监听动态事件，仅用于插件桥接等运行时字符串场景 */
  onDynamic(event: string, handler: EventHandler): void {
    this.addListener(event, handler);
  }

  private addListener(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  /** 监听一次事件 */
  once<K extends AppEventName>(event: K, handler: AppEventHandler<K>): void {
    const wrappedHandler: EventHandler = (...args) => {
      this.offDynamic(event, wrappedHandler);
      (handler as EventHandler)(...args);
    };
    this.onDynamic(event, wrappedHandler);
  }

  /** 监听一次动态事件，仅用于插件桥接等运行时字符串场景 */
  onceDynamic(event: string, handler: EventHandler): void {
    const wrappedHandler: EventHandler = (...args) => {
      this.offDynamic(event, wrappedHandler);
      handler(...args);
    };
    this.onDynamic(event, wrappedHandler);
  }

  /** 取消监听 */
  off<K extends AppEventName>(event: K, handler: AppEventHandler<K>): void {
    this.offDynamic(event, handler as EventHandler);
  }

  /** 取消动态事件监听，仅用于插件桥接等运行时字符串场景 */
  offDynamic(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  /** 取消所有以 prefix 开头的事件监听（用于插件禁用时按命名空间批量清理） */
  offPrefix(prefix: string): number {
    let removed = 0;
    for (const event of Array.from(this.listeners.keys())) {
      if (event.startsWith(prefix)) {
        removed += this.listeners.get(event)!.size;
        this.listeners.delete(event);
      }
    }
    return removed;
  }

  /** 触发事件（同步） */
  emit<K extends AppEventName>(event: K, ...args: EventArgs<K>): void {
    this.emitDynamic(event, ...args);
  }

  /** 触发动态事件，仅用于插件桥接等运行时字符串场景 */
  emitDynamic(event: string, ...args: any[]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logError('event-bus', '事件处理器出错', { event, error: message });
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
