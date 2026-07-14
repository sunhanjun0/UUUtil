/**
 * FIE (Focus Ingestion Engine) HTTP 客户端
 *
 * focus 插件不再持有本地数据库，改为通过本模块调用 FIE 服务（默认 127.0.0.1:17879）。
 * - 写入路径：ingest / ingestBatch（事件摄取，归因决策由 FIE 完成）
 * - 只读路径：listFocuses / listRuns / getRun / getTrend / health
 *
 * 所有方法返回结构化 FieResult，网络不可达时以 offline=true 标记，供 UI 优雅降级。
 * 客户端只负责传输，不落地任何请求/响应正文（脱敏由 FIE 侧保证）。
 */

import http from 'http';
import type {
  AttentionEvent,
  FieFocus,
  FieRunDetail,
  FieRunSummary,
  FieResult,
  IngestBatchResult,
  IngestResult,
  TrendPoint,
} from '../../shared/types';

const DEFAULT_TIMEOUT = 8000;

function resolveBaseUrl(): string {
  const explicit = process.env.UUUTIL_FIE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const host = process.env.FIE_HOST || '127.0.0.1';
  const port = process.env.FIE_PORT || '17879';
  return `http://${host}:${port}`;
}

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  timeoutMs?: number;
}

interface FieErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

/** 发起一次 FIE HTTP 请求，统一转换为 FieResult。 */
function request<T>({ method, path, body, timeoutMs = DEFAULT_TIMEOUT }: RequestOptions): Promise<FieResult<T>> {
  const base = resolveBaseUrl();
  const url = new URL(`${base}${path}`);
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: FieResult<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers: payload
          ? { 'content-type': 'application/json', 'content-length': payload.length }
          : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          let parsed: unknown = undefined;
          if (raw.trim()) {
            try { parsed = JSON.parse(raw); }
            catch { finish({ ok: false, error: `FIE 返回非 JSON 响应（HTTP ${status}）` }); return; }
          }
          if (status >= 200 && status < 300) {
            finish({ ok: true, data: parsed as T });
            return;
          }
          const errBody = parsed as FieErrorBody | undefined;
          const code = errBody?.error?.code;
          const message = errBody?.error?.message || `FIE 请求失败（HTTP ${status}）`;
          finish({ ok: false, error: code ? `${code}: ${message}` : message });
        });
      },
    );

    const timer = setTimeout(() => {
      req.destroy();
      finish({ ok: false, error: 'FIE 请求超时', offline: true });
    }, timeoutMs);

    req.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      const offline = code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'ETIMEDOUT';
      finish({ ok: false, error: offline ? 'FIE 服务未运行或不可达' : err.message, offline });
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ---------- 写入 ----------

/** 摄取单条注意力事件。 */
export function ingest(event: AttentionEvent): Promise<FieResult<IngestResult>> {
  return request<IngestResult>({ method: 'POST', path: '/v1/events/ingest', body: event });
}

/** 批量摄取（1–100 条），逐条隔离。 */
export function ingestBatch(events: AttentionEvent[]): Promise<FieResult<IngestBatchResult>> {
  return request<IngestBatchResult>({ method: 'POST', path: '/v1/events/batch', body: { events } });
}

// ---------- 只读 ----------

/** 列出 ingestion run（按事件 occurredAt 倒序）。 */
export function listRuns(limit = 50): Promise<FieResult<FieRunSummary[]>> {
  const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(200, limit))) });
  return request<{ runs: FieRunSummary[] }>({ method: 'GET', path: `/v1/runs?${params}` })
    .then((res) => unwrap(res, (data) => data.runs ?? []));
}

/** 单次 run 详情（含脱敏事件、候选打分、check-in）。 */
export function getRun(id: string): Promise<FieResult<FieRunDetail>> {
  return request<{ run: FieRunDetail }>({ method: 'GET', path: `/v1/runs/${encodeURIComponent(id)}` })
    .then((res) => unwrap(res, (data) => data.run));
}

/** 列出 Focus（按 last_activity_at 倒序）。 */
export function listFocuses(options: { limit?: number; includeArchived?: boolean } = {}): Promise<FieResult<FieFocus[]>> {
  const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(200, options.limit ?? 50))) });
  if (options.includeArchived) params.set('includeArchived', '1');
  return request<{ focuses: FieFocus[] }>({ method: 'GET', path: `/v1/focuses?${params}` })
    .then((res) => unwrap(res, (data) => data.focuses ?? []));
}

/** 活跃度趋势（按事件 occurredAt 所在日历日聚合）。 */
export function getTrend(options: { days?: number; focusId?: string } = {}): Promise<FieResult<TrendPoint[]>> {
  const params = new URLSearchParams({ days: String(Math.max(1, Math.min(365, options.days ?? 30))) });
  if (options.focusId) params.set('focusId', options.focusId);
  return request<{ trend: TrendPoint[] }>({ method: 'GET', path: `/v1/trend?${params}` })
    .then((res) => unwrap(res, (data) => data.trend ?? []));
}

/** 健康检查。 */
export function health(): Promise<FieResult<{ ok: boolean; service: string }>> {
  return request<{ ok: boolean; service: string }>({ method: 'GET', path: '/health', timeoutMs: 3000 });
}

/** 把 { key: T } 包裹的响应解包成 T，保持 FieResult 语义。 */
function unwrap<TWrap, TOut>(res: FieResult<TWrap>, pick: (data: TWrap) => TOut): FieResult<TOut> {
  if (!res.ok) return res;
  return { ok: true, data: pick(res.data) };
}
