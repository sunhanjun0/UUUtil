/**
 * Focus 注意力观察 IPC 模块
 */

import { defineInvoke } from './types';
import type { IpcModule } from './types';
import { api as focusApi } from '../../plugins/focus/api';
import { info as logInfo, reloadDatabaseIfChanged } from '../../core';
import type { FocusCreateInput, FocusListFilters, FocusMetadataUpdateInput, FocusCheckInInput } from '../../shared/types';

function syncExternalFocusChanges(): void {
  if (reloadDatabaseIfChanged()) {
    logInfo('focus', 'external_database_changes_reloaded');
  }
}

export const focusIpc: IpcModule = {
  namespace: 'focus',
  defs: [
    defineInvoke('focus:create', (_event, input: FocusCreateInput) => {
      syncExternalFocusChanges();
      return focusApi.create(input);
    }),
    defineInvoke('focus:update-metadata', (_event, focusId: string, input: FocusMetadataUpdateInput) => {
      syncExternalFocusChanges();
      return focusApi.updateMetadata(focusId, input);
    }),
    defineInvoke('focus:check-in', (_event, input: FocusCheckInInput) => {
      syncExternalFocusChanges();
      return focusApi.checkIn(input);
    }),
    defineInvoke('focus:get', (_event, focusId: string) => {
      syncExternalFocusChanges();
      return focusApi.get(focusId);
    }),
    defineInvoke('focus:list', (_event, filters?: FocusListFilters) => {
      syncExternalFocusChanges();
      return focusApi.list(filters);
    }),
    defineInvoke('focus:alerts', () => {
      syncExternalFocusChanges();
      return focusApi.alerts();
    }),
    defineInvoke('focus:checkins', (_event, focusId: string) => {
      syncExternalFocusChanges();
      return focusApi.checkins(focusId);
    }),
    defineInvoke('focus:stats', () => {
      syncExternalFocusChanges();
      return focusApi.stats();
    }),
    defineInvoke('focus:create-tag', (_event, name: string, color?: string) => {
      syncExternalFocusChanges();
      return focusApi.createTag(name, color);
    }),
    defineInvoke('focus:update-tag', (_event, tagId: string, name: string, color?: string) => {
      syncExternalFocusChanges();
      return focusApi.updateTag(tagId, name, color);
    }),
    defineInvoke('focus:list-tags', () => {
      syncExternalFocusChanges();
      return focusApi.listTags();
    }),
    defineInvoke('focus:delete-tag', (_event, tagId: string) => {
      syncExternalFocusChanges();
      return focusApi.deleteTag(tagId);
    }),
  ],
};
