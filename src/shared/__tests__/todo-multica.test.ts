/**
 * todo × Multica 纯函数助手单测（Multica 打通 Stage 2）
 *
 * 覆盖：external_ref 组装/解析、优先级映射（定稿口径 urgent/high→3, medium→2, low→1, 其余→0）、
 * ⇩ 拉入 note 预填（description 截前 500 字符 + 来源行）。
 */
import { describe, it, expect } from 'vitest';
import {
  buildMulticaExternalRef,
  buildMulticaPullNote,
  mapMulticaPriority,
  MULTICA_PULL_NOTE_DESC_MAX,
  parseMulticaExternalRef,
} from '../todo-multica';

describe('buildMulticaExternalRef / parseMulticaExternalRef', () => {
  it('带识别号与缺省两种形态，往返还原', () => {
    expect(buildMulticaExternalRef('uuid-1', 'HANJ-90')).toBe('multica:uuid-1:HANJ-90');
    expect(buildMulticaExternalRef('uuid-1')).toBe('multica:uuid-1');
    expect(parseMulticaExternalRef(buildMulticaExternalRef('uuid-1', 'HANJ-90')))
      .toEqual({ issueId: 'uuid-1', identifier: 'HANJ-90' });
    expect(parseMulticaExternalRef(buildMulticaExternalRef('uuid-1')))
      .toEqual({ issueId: 'uuid-1', identifier: null });
  });

  it('非 multica ref / 空 ref 解析为 null', () => {
    expect(parseMulticaExternalRef('jira:PROJ-1')).toBeNull();
    expect(parseMulticaExternalRef('multica:')).toBeNull();
    expect(parseMulticaExternalRef('')).toBeNull();
  });
});

describe('mapMulticaPriority（定稿映射）', () => {
  it('urgent/high → 3，medium → 2，low → 1，none → 0', () => {
    expect(mapMulticaPriority('urgent')).toBe(3);
    expect(mapMulticaPriority('high')).toBe(3);
    expect(mapMulticaPriority('medium')).toBe(2);
    expect(mapMulticaPriority('low')).toBe(1);
    expect(mapMulticaPriority('none')).toBe(0);
  });

  it('未知值与大小写混杂容错为 0/正确映射', () => {
    expect(mapMulticaPriority('HIGH')).toBe(3);
    expect(mapMulticaPriority(' Medium ')).toBe(2);
    expect(mapMulticaPriority('bogus')).toBe(0);
    expect(mapMulticaPriority('')).toBe(0);
  });
});

describe('buildMulticaPullNote', () => {
  it('description + 来源行', () => {
    const note = buildMulticaPullNote({ identifier: 'HANJ-90', description: '投影分组与拉入交互' });
    expect(note).toBe('投影分组与拉入交互\n\n——来源：Multica HANJ-90');
  });

  it('description 截前 500 字符，超出补省略号且来源行保留', () => {
    const long = 'x'.repeat(MULTICA_PULL_NOTE_DESC_MAX + 100);
    const note = buildMulticaPullNote({ identifier: 'HANJ-90', description: long });
    const [descPart, sourcePart] = note.split('\n\n');
    expect(descPart).toHaveLength(MULTICA_PULL_NOTE_DESC_MAX + 1);
    expect(descPart.endsWith('…')).toBe(true);
    expect(sourcePart).toBe('——来源：Multica HANJ-90');
  });

  it('description 为空 / null / 全空白时只留来源行', () => {
    expect(buildMulticaPullNote({ identifier: 'HANJ-90', description: null }))
      .toBe('——来源：Multica HANJ-90');
    expect(buildMulticaPullNote({ identifier: 'HANJ-90', description: '   ' }))
      .toBe('——来源：Multica HANJ-90');
  });
});
