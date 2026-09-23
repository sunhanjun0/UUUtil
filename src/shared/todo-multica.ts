/**
 * todo × Multica 打通的纯函数助手（Stage 2）
 *
 * 渲染进程与主进程共用，零依赖、可单测：
 * - external_ref 组装/解析（Stage 1 起就在用，本阶段从 multica-bridge 上提到 shared）；
 * - ⇩ 拉入的优先级映射与 note 预填规则（铁律：规则只在这里定义一次）。
 */

const EXTERNAL_REF_PREFIX = 'multica:';

/** 组装 external_ref：multica:<issue-uuid>:<identifier>（identifier 可缺省）。 */
export function buildMulticaExternalRef(issueId: string, identifier?: string): string {
  const base = `${EXTERNAL_REF_PREFIX}${issueId}`;
  return identifier ? `${base}:${identifier}` : base;
}

/** 解析 external_ref；非 multica ref 或缺 issue id 返回 null。 */
export function parseMulticaExternalRef(ref: string): { issueId: string; identifier: string | null } | null {
  if (typeof ref !== 'string' || !ref.startsWith(EXTERNAL_REF_PREFIX)) return null;
  const rest = ref.slice(EXTERNAL_REF_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep === -1) return rest ? { issueId: rest, identifier: null } : null;
  const issueId = rest.slice(0, sep);
  return issueId ? { issueId, identifier: rest.slice(sep + 1) || null } : null;
}

/**
 * Multica 优先级 → todo priority 数值（定稿映射）：
 * urgent/high → 3（高），medium → 2（中），low → 1（低），none/未知 → 0（无）。
 */
export function mapMulticaPriority(priority: string): number {
  switch ((priority ?? '').trim().toLowerCase()) {
    case 'urgent':
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

/** 拉入 note 预填时 description 的最大保留长度（超出截断补省略号）。 */
export const MULTICA_PULL_NOTE_DESC_MAX = 500;

/**
 * ⇩ 拉入的 note 预填：issue description 截前 ~500 字符 + 来源行；
 * description 为空时只留来源行。
 */
export function buildMulticaPullNote(issue: { identifier: string; description: string | null }): string {
  const source = `——来源：Multica ${issue.identifier}`;
  const desc = (issue.description ?? '').trim();
  if (!desc) return source;
  const cut = desc.length > MULTICA_PULL_NOTE_DESC_MAX
    ? `${desc.slice(0, MULTICA_PULL_NOTE_DESC_MAX)}…`
    : desc;
  return `${cut}\n\n${source}`;
}
