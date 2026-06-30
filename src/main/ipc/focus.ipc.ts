/**
 * Focus 专注管理 IPC 模块
 */

import { defineInvoke } from './types';
import type { IpcModule } from './types';
import { api as focusApi } from '../../plugins/focus/api';
import type { FocusHorizon, FocusStatus, FocusImportance } from '../../shared/types';

export const focusIpc: IpcModule = {
  namespace: 'focus',
  defs: [
    defineInvoke('focus:create-area', (_event, name: string, description: string, whyImportant: string, horizon: FocusHorizon, status: FocusStatus, importance: FocusImportance, tagIds: string[], desiredOutcome?: string, nextReviewAt?: string, contextLinks?: string[]) =>
      focusApi.createArea(name, description, whyImportant, horizon, status, importance, tagIds, desiredOutcome, nextReviewAt, contextLinks)
    ),
    defineInvoke('focus:update-area', (_event, areaId: string, name: string, description: string, whyImportant: string, horizon: FocusHorizon, status: FocusStatus, importance: FocusImportance, tagIds: string[], desiredOutcome?: string, nextReviewAt?: string, contextLinks?: string[]) =>
      focusApi.updateArea(areaId, name, description, whyImportant, horizon, status, importance, tagIds, desiredOutcome, nextReviewAt, contextLinks)
    ),
    defineInvoke('focus:delete-area', (_event, areaId: string) =>
      focusApi.deleteArea(areaId)
    ),
    defineInvoke('focus:get-areas', (_event, horizon?: FocusHorizon, status?: FocusStatus, tagId?: string, importance?: FocusImportance) =>
      focusApi.getAreas(horizon, status, tagId, importance)
    ),
    defineInvoke('focus:get-area-by-id', (_event, areaId: string) =>
      focusApi.getAreaById(areaId)
    ),
    defineInvoke('focus:migrate-area', (_event, areaId: string, toHorizon: FocusHorizon, reason?: string) =>
      focusApi.migrateArea(areaId, toHorizon, reason)
    ),
    defineInvoke('focus:change-area-status', (_event, areaId: string, toStatus: FocusStatus, reason?: string) =>
      focusApi.changeAreaStatus(areaId, toStatus, reason)
    ),
    defineInvoke('focus:get-migrations', (_event, areaId?: string) =>
      focusApi.getMigrations(areaId)
    ),
    defineInvoke('focus:create-tag', (_event, name: string, color?: string) =>
      focusApi.createTag(name, color)
    ),
    defineInvoke('focus:get-tags', () =>
      focusApi.getTags()
    ),
    defineInvoke('focus:delete-tag', (_event, tagId: string) =>
      focusApi.deleteTag(tagId)
    ),
    defineInvoke('focus:start-session', (_event, focusId: string) =>
      focusApi.startSession(focusId)
    ),
    defineInvoke('focus:end-session', (_event, sessionId: string, notes?: string) =>
      focusApi.endSession(sessionId, notes)
    ),
    defineInvoke('focus:get-sessions', (_event, focusId?: string) =>
      focusApi.getSessions(focusId)
    ),
    defineInvoke('focus:get-stats', () =>
      focusApi.getStats()
    ),
  ],
};
