/**
 * Focus API —— FIE (Focus Ingestion Engine) 客户端薄封装。
 *
 * 应用侧不再持有焦点数据：写入走事件摄取，读取走 FIE 只读接口。
 * 本模块只负责透传 + 摄取活动日志（用于悬浮球活动提示），不落地正文。
 */

import { info as logInfo } from '../../core/logger';
import * as fie from './fie-client';
import type { AttentionEvent, FocusApi } from '../../shared/types';

export const api: FocusApi = {
  async ingest(event: AttentionEvent) {
    const result = await fie.ingest(event);
    if (result.ok) {
      logInfo('focus', 'event_ingested', {
        source: event.source,
        type: event.type,
        decision: result.data.decision,
        deduplicated: result.data.deduplicated,
        lowConfidence: result.data.lowConfidence,
      });
    }
    return result;
  },

  async ingestBatch(events: AttentionEvent[]) {
    const result = await fie.ingestBatch(events);
    if (result.ok) {
      logInfo('focus', 'event_ingested', {
        batch: events.length,
        accepted: result.data.accepted,
        duplicates: result.data.duplicates,
        failed: result.data.failed,
      });
    }
    return result;
  },

  listFocuses(options) {
    return fie.listFocuses(options);
  },

  listRuns(limit) {
    return fie.listRuns(limit);
  },

  getRun(id) {
    return fie.getRun(id);
  },

  getTrend(options) {
    return fie.getTrend(options);
  },

  health() {
    return fie.health();
  },
};
