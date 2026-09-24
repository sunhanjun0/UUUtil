/**
 * multica 桥接层单元测试（Multica 打通 Stage 1）
 *
 * mock child_process.spawn：用 EventEmitter 假 child 脚本化 stdout/stderr/close/error，
 * 验证命令参数拼装、JSON 解析、超时、ENOENT、非零退出等路径。
 * addComment / createIssue 的临时文件走真实 os.tmpdir()，验证写入内容与用后清理。
 *
 * 每个用例前 vi.resetModules() + 动态 import，重置桥接层的成员 id 缓存。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

import type { MulticaBridgeApi } from '../../../shared/types';

let bridge: MulticaBridgeApi;
let helpers: typeof import('../multica-bridge');

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

interface ScriptedResponse {
  stdout?: string;
  stderr?: string;
  code?: number;
  error?: Error;
  /** spawn 调用瞬间同步执行（用于读取临时文件内容）。 */
  onSpawn?: (args: string[]) => void;
}

/** 让下一次 spawn 按脚本响应；events 在 microtask 里派发，模拟真实异步。 */
function scriptNextSpawn(response: ScriptedResponse): void {
  spawnMock.mockImplementationOnce((_cmd: string, args: string[]) => {
    response.onSpawn?.(args);
    const child = fakeChild();
    queueMicrotask(() => {
      if (response.error) {
        child.emit('error', response.error);
        return;
      }
      if (response.stdout) child.stdout.emit('data', Buffer.from(response.stdout));
      if (response.stderr) child.stderr.emit('data', Buffer.from(response.stderr));
      child.emit('close', response.code ?? 0);
    });
    return child;
  });
}

const PROFILE_JSON = JSON.stringify({ id: 'member-uuid-1', name: 'sunhanjun1988' });
const ISSUE_RAW = {
  id: 'issue-uuid-1',
  identifier: 'HANJ-89',
  title: 'Stage 1',
  status: 'todo',
  priority: 'high',
  project_id: 'proj-1',
  due_date: '2026-09-30',
  description: '阶段一描述',
  updated_at: '2026-09-23T08:00:00Z',
};
const PROJECTS_JSON = JSON.stringify([{ id: 'proj-1', title: '个人AI建设' }]);

beforeEach(async () => {
  vi.resetModules();
  spawnMock.mockReset();
  helpers = await import('../multica-bridge');
  bridge = helpers.multicaBridge;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('listAssignedIssues', () => {
  it('先探测身份再按 assignee-id 拉取；参数拼装正确、字段映射 camelCase、项目名回填', async () => {
    scriptNextSpawn({ stdout: PROFILE_JSON });
    scriptNextSpawn({ stdout: JSON.stringify({ has_more: false, issues: [ISSUE_RAW] }) });
    scriptNextSpawn({ stdout: PROJECTS_JSON });

    const r = await bridge.listAssignedIssues();

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual([{
      id: 'issue-uuid-1',
      identifier: 'HANJ-89',
      title: 'Stage 1',
      status: 'todo',
      priority: 'high',
      projectId: 'proj-1',
      projectTitle: '个人AI建设',
      dueAt: '2026-09-30',
      description: '阶段一描述',
      updatedAt: '2026-09-23T08:00:00Z',
    }]);

    expect(spawnMock).toHaveBeenCalledTimes(3);
    expect(spawnMock.mock.calls[0][1]).toEqual(['user', 'profile', 'get', '--output', 'json']);
    expect(spawnMock.mock.calls[1][1]).toEqual([
      'issue', 'list', '--assignee-id', 'member-uuid-1', '--status', 'todo,in_progress', '--output', 'json',
    ]);
    expect(spawnMock.mock.calls[2][1]).toEqual(['project', 'list', '--output', 'json']);
    // 始终以 argv 数组调 spawn（不走 shell）
    expect(spawnMock.mock.calls[0][0]).toBe('multica');
  });

  it('成员 id 与项目名录进程内缓存：第二次调用只拉 issue 列表', async () => {
    scriptNextSpawn({ stdout: PROFILE_JSON });
    scriptNextSpawn({ stdout: JSON.stringify({ issues: [] }) });
    scriptNextSpawn({ stdout: PROJECTS_JSON });
    scriptNextSpawn({ stdout: JSON.stringify({ issues: [ISSUE_RAW] }) });

    await bridge.listAssignedIssues();
    const r2 = await bridge.listAssignedIssues();

    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.data[0]?.projectTitle).toBe('个人AI建设');
    expect(spawnMock).toHaveBeenCalledTimes(4);
    expect(spawnMock.mock.calls[3][1][0]).toBe('issue');
  });

  it('身份探测失败（未认证）→ 静默降级 ok:false，不继续拉取', async () => {
    scriptNextSpawn({ stderr: 'not authenticated', code: 1 });

    const r = await bridge.listAssignedIssues();

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('not authenticated');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('issues 缺省 / 畸形条目被容错为空数组', async () => {
    scriptNextSpawn({ stdout: PROFILE_JSON });
    scriptNextSpawn({ stdout: JSON.stringify({ issues: [null, { no_id: true }, ISSUE_RAW] }) });
    scriptNextSpawn({ stdout: PROJECTS_JSON });

    const r = await bridge.listAssignedIssues();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(1);
  });

  it('项目名录拉取失败：静默降级 projectTitle=null，不影响 issue 列表', async () => {
    scriptNextSpawn({ stdout: PROFILE_JSON });
    scriptNextSpawn({ stdout: JSON.stringify({ issues: [ISSUE_RAW] }) });
    scriptNextSpawn({ stderr: 'project list denied', code: 1 });

    const r = await bridge.listAssignedIssues();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(1);
    expect(r.data[0]?.projectTitle).toBeNull();
  });
});

describe('getIssue', () => {
  it('参数拼装与字段映射', async () => {
    scriptNextSpawn({ stdout: JSON.stringify(ISSUE_RAW) });

    const r = await bridge.getIssue('issue-uuid-1');

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.identifier).toBe('HANJ-89');
    expect(spawnMock.mock.calls[0][1]).toEqual(['issue', 'get', 'issue-uuid-1', '--output', 'json']);
  });

  it('空 id 不发 CLI 直接 ok:false；返回结构不可识别时内化错误', async () => {
    const empty = await bridge.getIssue('  ');
    expect(empty.ok).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();

    scriptNextSpawn({ stdout: JSON.stringify({ unexpected: true }) });
    const bad = await bridge.getIssue('issue-uuid-1');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('不可识别');
  });
});

describe('addComment', () => {
  it('临时文件写入标注后的正文，--content-file + --allow-external-file，用后删除', async () => {
    let capturedPath = '';
    let capturedContent = '';
    scriptNextSpawn({
      stdout: JSON.stringify({ id: 'comment-1' }),
      onSpawn: (args) => {
        capturedPath = args[args.indexOf('--content-file') + 1];
        capturedContent = fs.readFileSync(capturedPath, 'utf8');
      },
    });

    const r = await bridge.addComment('issue-uuid-1', '跟进记录：已完成桥接层');

    expect(r.ok).toBe(true);
    expect(capturedContent).toBe('跟进记录：已完成桥接层\n\n——代驾驶舱回写');
    expect(capturedPath).toContain('uuutil-multica-');
    // 用后删除：临时文件与其独立子目录都不复存在
    expect(fs.existsSync(capturedPath)).toBe(false);
    expect(fs.existsSync(capturedPath.replace(/\/comment\.md$/, ''))).toBe(false);

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args.slice(0, 4)).toEqual(['issue', 'comment', 'add', 'issue-uuid-1']);
    expect(args).toContain('--allow-external-file');
  });

  it('正文已带标注时不重复追加', async () => {
    let capturedContent = '';
    scriptNextSpawn({
      stdout: '{}',
      onSpawn: (args) => {
        capturedContent = fs.readFileSync(args[args.indexOf('--content-file') + 1], 'utf8');
      },
    });

    await bridge.addComment('i1', '备注\n\n——代驾驶舱回写');
    expect(capturedContent).toBe('备注\n\n——代驾驶舱回写');
  });

  it('空正文 / 空 id 不发 CLI', async () => {
    expect((await bridge.addComment('', 'x')).ok).toBe(false);
    expect((await bridge.addComment('i1', '   ')).ok).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('CLI 失败时临时文件同样清理', async () => {
    let capturedPath = '';
    scriptNextSpawn({
      stderr: 'issue not found',
      code: 1,
      onSpawn: (args) => {
        capturedPath = args[args.indexOf('--content-file') + 1];
      },
    });

    const r = await bridge.addComment('ghost', '正文');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('issue not found');
    expect(fs.existsSync(capturedPath)).toBe(false);
  });
});

describe('createIssue', () => {
  it('带描述与项目：--description-file + --project，返回映射后的 issue', async () => {
    let descContent = '';
    scriptNextSpawn({
      stdout: JSON.stringify(ISSUE_RAW),
      onSpawn: (args) => {
        descContent = fs.readFileSync(args[args.indexOf('--description-file') + 1], 'utf8');
      },
    });

    const r = await bridge.createIssue({ title: '毕业事项', description: '多行\n描述', project: 'proj-1' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.id).toBe('issue-uuid-1');
    expect(descContent).toBe('多行\n描述');
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args.slice(0, 3)).toEqual(['issue', 'create', '--title']);
    expect(args).toContain('毕业事项');
    expect(args).toContain('--project');
    expect(args).toContain('proj-1');
    expect(args).toContain('--allow-external-file');
  });

  it('无描述时不写临时文件、不带 --description-file', async () => {
    scriptNextSpawn({ stdout: JSON.stringify(ISSUE_RAW) });

    const r = await bridge.createIssue({ title: '仅标题' });

    expect(r.ok).toBe(true);
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain('--description-file');
    expect(args).not.toContain('--project');
  });

  it('空 title 不发 CLI', async () => {
    expect((await bridge.createIssue({ title: ' ' })).ok).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe('错误路径', () => {
  it('spawn 触发 error（ENOENT = CLI 不存在）→ 静默降级', async () => {
    const err = new Error('spawn multica ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    scriptNextSpawn({ error: err });

    const r = await bridge.getIssue('i1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('不可用');
  });

  it('非零退出：error 取 stderr 摘要', async () => {
    scriptNextSpawn({ stderr: 'unknown flag: --bogus', code: 1 });

    const r = await bridge.getIssue('i1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unknown flag: --bogus');
  });

  it('stdout 非合法 JSON → ok:false', async () => {
    scriptNextSpawn({ stdout: 'not json at all' });

    const r = await bridge.getIssue('i1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('JSON');
  });

  it('超时：kill(SIGTERM) 并返回超时错误', async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    spawnMock.mockImplementationOnce(() => child);

    const promise = bridge.getIssue('i1');
    await vi.advanceTimersByTimeAsync(15000);
    const r = await promise;

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('超时');
  });

  it('超时后迟到的 close 不覆盖超时结果', async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    spawnMock.mockImplementationOnce(() => child);

    const promise = bridge.getIssue('i1');
    await vi.advanceTimersByTimeAsync(15000);
    child.stdout.emit('data', Buffer.from(JSON.stringify(ISSUE_RAW)));
    child.emit('close', 0);
    const r = await promise;

    expect(r.ok).toBe(false);
  });
});

describe('external_ref 组装与解析', () => {
  it('buildMulticaExternalRef：带识别号与缺省两种形态', () => {
    expect(helpers.buildMulticaExternalRef('uuid-1', 'HANJ-89')).toBe('multica:uuid-1:HANJ-89');
    expect(helpers.buildMulticaExternalRef('uuid-1')).toBe('multica:uuid-1');
  });

  it('parseMulticaExternalRef：解析两种形态；非 multica ref 返回 null', () => {
    expect(helpers.parseMulticaExternalRef('multica:uuid-1:HANJ-89'))
      .toEqual({ issueId: 'uuid-1', identifier: 'HANJ-89' });
    expect(helpers.parseMulticaExternalRef('multica:uuid-1'))
      .toEqual({ issueId: 'uuid-1', identifier: null });
    expect(helpers.parseMulticaExternalRef('jira:PROJ-1')).toBeNull();
    expect(helpers.parseMulticaExternalRef('multica:')).toBeNull();
  });
});
