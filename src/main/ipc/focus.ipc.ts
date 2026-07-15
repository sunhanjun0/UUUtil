/**
 * Focus 注意力观察 IPC 模块 —— FIE 客户端代理。
 *
 * 只读查询 + 事件摄取，全部透传到 FIE，不触碰本地数据库。
 */

import { defineInvoke } from './types';
import type { IpcModule } from './types';
import { api as focusApi } from '../../plugins/focus/api';
import type { AttentionEvent } from '../../shared/types';

export const focusIpc: IpcModule = {
  namespace: 'focus',
  defs: [
    defineInvoke('focus:ingest', (_event, input: AttentionEvent) => focusApi.ingest(input)),
    defineInvoke('focus:ingest-batch', (_event, events: AttentionEvent[]) => focusApi.ingestBatch(events)),
    defineInvoke('focus:list-focuses', (_event, options?: { limit?: number; includeArchived?: boolean }) => focusApi.listFocuses(options)),
    defineInvoke('focus:list-runs', (_event, limit?: number) => focusApi.listRuns(limit)),
    defineInvoke('focus:get-run', (_event, id: string) => focusApi.getRun(id)),
    defineInvoke('focus:trend', (_event, options?: { days?: number; focusId?: string }) => focusApi.getTrend(options)),
    defineInvoke('focus:health', () => focusApi.health()),
  ],
};
