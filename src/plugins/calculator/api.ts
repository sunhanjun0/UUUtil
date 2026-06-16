/**
 * calculator 插件 —— 对外 API
 */

import type { CalculatorApi } from '../../shared/types';

export const api: CalculatorApi = {
  calculate(expression: string): string {
    // 清理输入，只允许数字、运算符、小数点、括号
    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
    if (!sanitized.trim()) return '';

    try {
      const result = Function(`"use strict"; return (${sanitized})`)();
      if (typeof result !== 'number' || !isFinite(result)) {
        return 'Error';
      }
      // 避免浮点数精度问题
      return String(Math.round(result * 1e10) / 1e10);
    } catch {
      return 'Error';
    }
  },
};
