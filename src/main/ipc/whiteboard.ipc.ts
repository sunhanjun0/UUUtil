/**
 * 白板 IPC 模块：状态读写与附件管理。
 */

import { defineInvoke } from './types';
import type { IpcModule } from './types';
import {
  getWhiteboardState,
  saveWhiteboardState,
  saveWhiteboardAttachment,
  getWhiteboardAttachment,
  openWhiteboardAttachmentsDir,
  openWhiteboardAttachment,
  showWhiteboardAttachmentInFolder,
  type WhiteboardAttachmentInput,
} from '../whiteboard';

export const whiteboardIpc: IpcModule = {
  namespace: 'core:whiteboard',
  defs: [
    defineInvoke('core:whiteboard:get-state', () => getWhiteboardState()),
    defineInvoke('core:whiteboard:save-state', (_event, state: string) => saveWhiteboardState(state)),
    defineInvoke('core:whiteboard:save-attachment', (_event, input: WhiteboardAttachmentInput) => saveWhiteboardAttachment(input)),
    defineInvoke('core:whiteboard:get-attachment', (_event, filename: string, mime?: string) => getWhiteboardAttachment(filename, mime)),
    defineInvoke('core:whiteboard:open-attachments-dir', () => openWhiteboardAttachmentsDir()),
    defineInvoke('core:whiteboard:open-attachment', (_event, filename: string) => openWhiteboardAttachment(filename)),
    defineInvoke('core:whiteboard:show-attachment-in-folder', (_event, filename: string) => showWhiteboardAttachmentInFolder(filename)),
  ],
};
