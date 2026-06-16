/**
 * dev-utils 插件 —— 对外 API
 */

import type { DevUtilsApi } from '../../shared/types';

export const api: DevUtilsApi = {
  jsonFormat(input: string) {
    try {
      const obj = JSON.parse(input);
      return { success: true, output: JSON.stringify(obj, null, 2) };
    } catch (e: any) {
      return { success: false, output: `JSON 解析失败: ${e.message}` };
    }
  },

  base64Encode(input: string) {
    return btoa(unescape(encodeURIComponent(input)));
  },

  base64Decode(input: string) {
    try {
      return { success: true, output: decodeURIComponent(escape(atob(input))) };
    } catch {
      return { success: false, output: 'Base64 解码失败，请检查输入' };
    }
  },

  timestampToDate(ts: string) {
    const num = Number(ts);
    if (!ts.trim() || isNaN(num)) {
      return { success: false, output: '无效的时间戳' };
    }
    const ms = ts.length <= 10 ? num * 1000 : num;
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      success: true,
      output: [
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
        d.toISOString(),
        d.toUTCString(),
        d.toLocaleString('zh-CN'),
      ].join('\n'),
    };
  },

  dateToTimestamp(dateStr: string) {
    const ts = Date.parse(dateStr);
    if (isNaN(ts)) {
      return { success: false, output: '无效的日期格式' };
    }
    return { success: true, output: `${ts}\n${Math.floor(ts / 1000)}` };
  },

  regexTest(pattern: string, text: string, flags: string) {
    try {
      const re = new RegExp(pattern, flags);
      const matches: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        matches.push(m[0]);
        if (!re.global) break;
      }
      return { success: true, matches };
    } catch (e: any) {
      return { success: false, matches: [], error: e.message };
    }
  },

  uuidGenerate(version) {
    if (version === 'v4') {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    // UUID v7 (简化版: 时间戳前缀 + 随机后缀)
    const ts = Date.now().toString(16).padStart(12, '0');
    const rand = Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${rand.slice(0, 3)}-${rand.slice(3, 7)}-${rand.slice(7, 19)}`;
  },
};
