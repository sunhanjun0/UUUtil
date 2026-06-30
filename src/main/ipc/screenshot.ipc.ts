/**
 * 截图功能 IPC 模块
 */

import { app, desktopCapturer, shell } from 'electron';
import { defineInvoke } from './types';
import type { IpcModule } from './types';
import * as fs from 'fs';
import * as path from 'path';

async function takeScreenshot(): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });

    if (sources.length === 0) {
      return { success: false, error: '未找到屏幕源' };
    }

    // 取主屏幕（第一个）的截图
    const primarySource = sources[0];
    const image = primarySource.thumbnail;

    // 保存到桌面
    const desktopPath = app.getPath('desktop');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `screenshot-${timestamp}.png`;
    const filePath = path.join(desktopPath, fileName);

    const pngData = image.toPNG();
    fs.writeFileSync(filePath, pngData);

    // 在 Finder 中显示文件
    shell.showItemInFolder(filePath);

    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export const screenshotIpc: IpcModule = {
  namespace: 'screenshot',
  defs: [
    defineInvoke('screenshot:take', () => takeScreenshot()),
  ],
};
