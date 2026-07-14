/**
 * 界面设置 IPC 模块：TAB 栏显隐与排序等布局配置的读写。
 */

import { getTabLayout, saveTabLayout } from '../../core';
import { defineInvoke } from './types';
import type { IpcModule } from './types';
import type { TabLayout } from '../../shared/types';

export const uiSettingsIpc: IpcModule = {
  namespace: 'core:ui',
  defs: [
    defineInvoke('core:ui:get-tab-layout', () => getTabLayout()),
    defineInvoke('core:ui:save-tab-layout', (_event, layout: TabLayout) => saveTabLayout(layout)),
  ],
};
