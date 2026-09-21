import React, { useEffect, useMemo, useState } from 'react';
import { Select, useToast } from '@chakra-ui/react';
import type { AiChatResponse, AiProviderConfig, AiRuntimeConfig } from '../../src/shared/types';

type ProviderDraft = Omit<AiProviderConfig, 'createdAt' | 'updatedAt'>;

const emptyProvider: ProviderDraft = {
  id: '',
  name: '',
  type: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  enabled: true,
};

const providerPresets = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
];

function makeProviderId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `provider-${Date.now()}`;
}

export default function AiConfigPage() {
  const toast = useToast();
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [runtimeConfig, setRuntimeConfig] = useState<AiRuntimeConfig>({});
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(emptyProvider);
  const [testPrompt, setTestPrompt] = useState('用一句话回复：AI 配置已连通。');
  const [testResult, setTestResult] = useState('');
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deletingProviderId, setDeletingProviderId] = useState<string | null>(null);

  const activeProvider = useMemo(
    () => providers.find((provider) => provider.id === runtimeConfig.defaultProviderId) || providers[0],
    [providers, runtimeConfig.defaultProviderId]
  );

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    const [providerList, config] = await Promise.all([
      window.assistant.ai.listProviders(),
      window.assistant.ai.getRuntimeConfig(),
    ]);
    setProviders(providerList);
    setRuntimeConfig(config);
  }

  function updateProviderDraft(patch: Partial<ProviderDraft>) {
    setProviderDraft((draft) => {
      const next = { ...draft, ...patch };
      if (!draft.id && patch.name) next.id = makeProviderId(patch.name);
      return next;
    });
  }

  function editProvider(provider: AiProviderConfig) {
    setProviderDraft({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey || '',
      enabled: provider.enabled,
    });
  }

  function applyPreset(preset: typeof providerPresets[number]) {
    setProviderDraft({
      id: makeProviderId(preset.name),
      name: preset.name,
      type: 'openai-compatible',
      baseUrl: preset.baseUrl,
      apiKey: providerDraft.apiKey || '',
      enabled: true,
    });
    setRuntimeConfig((config) => ({ ...config, defaultModel: config.defaultModel || preset.model }));
  }

  async function saveProvider() {
    if (!providerDraft.name.trim() || !providerDraft.baseUrl.trim()) {
      toast({ title: '请填写 Provider 名称和 Base URL', status: 'warning' });
      return;
    }

    setSavingProvider(true);
    try {
      const provider = { ...providerDraft, id: providerDraft.id || makeProviderId(providerDraft.name) };
      const result = await window.assistant.ai.upsertProvider(provider);
      if (!result.success) throw new Error(result.error || '保存 Provider 失败');

      await window.assistant.ai.updateRuntimeConfig({
        ...runtimeConfig,
        defaultProviderId: runtimeConfig.defaultProviderId || provider.id,
      });
      setProviderDraft(emptyProvider);
      await loadConfig();
      toast({ title: 'AI Provider 已保存', status: 'success' });
    } catch (err) {
      toast({ title: String(err), status: 'error' });
    } finally {
      setSavingProvider(false);
    }
  }

  async function deleteProvider(providerId: string) {
    if (!window.confirm('确定删除这个 AI Provider？')) return;
    setDeletingProviderId(providerId);
    try {
      const result = await window.assistant.ai.deleteProvider(providerId);
      if (!result.success) throw new Error(result.error || '删除 Provider 失败');
      if (runtimeConfig.defaultProviderId === providerId) {
        await window.assistant.ai.updateRuntimeConfig({ defaultProviderId: undefined });
      }
      await loadConfig();
      toast({ title: 'AI Provider 已删除', status: 'success' });
    } catch (err) {
      toast({ title: String(err), status: 'error' });
    } finally {
      setDeletingProviderId(null);
    }
  }

  async function saveRuntimeConfig() {
    setSavingRuntime(true);
    try {
      const result = await window.assistant.ai.updateRuntimeConfig(runtimeConfig);
      if (!result.success) throw new Error(result.error || '保存运行配置失败');
      await loadConfig();
      toast({ title: '运行配置已保存', status: 'success' });
    } catch (err) {
      toast({ title: String(err), status: 'error' });
    } finally {
      setSavingRuntime(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult('');
    try {
      const result = await window.assistant.ai.chat({
        providerId: runtimeConfig.defaultProviderId || activeProvider?.id,
        model: runtimeConfig.defaultModel,
        messages: [{ role: 'user', content: testPrompt }],
        temperature: runtimeConfig.temperature,
        maxTokens: runtimeConfig.maxTokens,
        timeoutMs: runtimeConfig.timeoutMs,
      }) as AiChatResponse;

      setTestResult(result.success ? result.content || '' : result.error || '测试失败');
      toast({ title: result.success ? 'AI 连接成功' : 'AI 连接失败', status: result.success ? 'success' : 'error' });
    } catch (err) {
      setTestResult(String(err));
      toast({ title: String(err), status: 'error' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="ck" style={{ padding: '18px 22px 20px', gap: 10, display: 'flex', flexDirection: 'column' }}>
      <div className="ck-head">
        <span className="code">AI CORE</span>
        <span className="zh">AI 配置</span>
        <span className="sub">PROVIDERS // 模型供应商</span>
      </div>

      <div className="ck-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="ck-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="ck-sub" style={{ fontSize: 12 }}>统一管理模型 Provider，后续翻译 / 助理等插件复用配置</span>
            <div className="ck-spacer" />
            <span className={'ck-chip' + (activeProvider ? ' on' : '')}>{activeProvider ? '● 已配置' : '○ 未配置'}</span>
          </div>
          <div className="ck-chips" style={{ marginTop: 8 }}>
            {providerPresets.map((preset) => (
              <button key={preset.name} className="ck-chip" onClick={() => applyPreset(preset)}>
                使用 {preset.name} 模板
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <div className="ck-panel" style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="ck-hairline" style={{ marginTop: 0 }}>PROVIDER // 编辑</div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.18em' }}>NAME 名称</span>
              <div className="ck-input" style={{ padding: '7px 12px' }}>
                <input value={providerDraft.name} placeholder="例如 DeepSeek" onChange={(e) => updateProviderDraft({ name: e.target.value })} />
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.18em' }}>ID 标识</span>
              <div className="ck-input" style={{ padding: '7px 12px' }}>
                <input value={providerDraft.id} placeholder="deepseek" onChange={(e) => updateProviderDraft({ id: e.target.value })} />
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.18em' }}>TYPE 类型</span>
              <Select size="sm" value={providerDraft.type} onChange={(e) => updateProviderDraft({ type: e.target.value as ProviderDraft['type'] })}>
                <option value="openai-compatible">OpenAI Compatible</option>
                <option value="custom">Custom</option>
              </Select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.18em' }}>BASE URL 地址</span>
              <div className="ck-input" style={{ padding: '7px 12px' }}>
                <input value={providerDraft.baseUrl} placeholder="https://api.deepseek.com/v1" onChange={(e) => updateProviderDraft({ baseUrl: e.target.value })} />
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.18em' }}>API KEY 密钥</span>
              <div className="ck-input" style={{ padding: '7px 12px' }}>
                <input type="password" value={providerDraft.apiKey || ''} placeholder="sk-..." onChange={(e) => updateProviderDraft({ apiKey: e.target.value })} />
              </div>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.18em' }}>ENABLED 启用</span>
              <div className="ck-spacer" />
              <button className={'ck-chip' + (providerDraft.enabled ? ' on' : '')} onClick={() => updateProviderDraft({ enabled: !providerDraft.enabled })}>
                {providerDraft.enabled ? '● 启用' : '○ 停用'}
              </button>
            </div>

            <div className="ck-tools">
              <button className="ck-btn primary" onClick={saveProvider}>{savingProvider ? '保存中…' : '保存 Provider'}</button>
              <button className="ck-btn" onClick={() => setProviderDraft(emptyProvider)}>清空</button>
            </div>
          </div>

          <div className="ck-panel" style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="ck-hairline" style={{ marginTop: 0 }}>RUNTIME // 运行配置</div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.18em' }}>PROVIDER 默认供应商</span>
              <Select size="sm" value={runtimeConfig.defaultProviderId || ''} onChange={(e) => setRuntimeConfig({ ...runtimeConfig, defaultProviderId: e.target.value || undefined })}>
                <option value="">自动选择第一个启用 Provider</option>
                {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
              </Select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.18em' }}>MODEL 默认模型</span>
              <div className="ck-input" style={{ padding: '7px 12px' }}>
                <input value={runtimeConfig.defaultModel || ''} placeholder="deepseek-chat / gpt-4o-mini" onChange={(e) => setRuntimeConfig({ ...runtimeConfig, defaultModel: e.target.value })} />
              </div>
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.18em' }}>TEMP Temperature</span>
                <div className="ck-input" style={{ padding: '7px 12px' }}>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    placeholder="0.7"
                    value={runtimeConfig.temperature ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      const num = value === '' ? Number.NaN : Number(value);
                      setRuntimeConfig({ ...runtimeConfig, temperature: Number.isNaN(num) ? undefined : num });
                    }}
                  />
                </div>
              </label>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.18em' }}>TOKENS Max Tokens</span>
                <div className="ck-input" style={{ padding: '7px 12px' }}>
                  <input
                    type="number"
                    min={1}
                    placeholder="1024"
                    value={runtimeConfig.maxTokens ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      const num = value === '' ? Number.NaN : Number(value);
                      setRuntimeConfig({ ...runtimeConfig, maxTokens: Number.isNaN(num) ? undefined : num });
                    }}
                  />
                </div>
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.18em' }}>TIMEOUT 超时 ms</span>
              <div className="ck-input" style={{ padding: '7px 12px' }}>
                <input
                  type="number"
                  min={1000}
                  placeholder="30000"
                  value={runtimeConfig.timeoutMs ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    const num = value === '' ? Number.NaN : Number(value);
                    setRuntimeConfig({ ...runtimeConfig, timeoutMs: Number.isNaN(num) ? undefined : num });
                  }}
                />
              </div>
            </label>

            <div className="ck-tools">
              <button className="ck-btn primary" onClick={saveRuntimeConfig}>{savingRuntime ? '保存中…' : '保存运行配置'}</button>
            </div>
          </div>
        </div>

        <div className="ck-panel">
          <div className="ck-hairline" style={{ marginTop: 0 }}>SAVED // 已保存 Provider <span className="n">{providers.length}</span></div>
          {providers.length === 0 ? (
            <div className="ck-empty">
              <div className="code">NO PROVIDER</div>
              还没有 Provider，建议先使用上方模板创建
            </div>
          ) : providers.map((provider) => (
            <div key={provider.id} className="ck-row">
              <div className="ck-item">
                <div className="ck-item-main" style={{ flex: 1 }}>
                  <div className="ck-item-title">
                    {provider.name}
                    {runtimeConfig.defaultProviderId === provider.id && <span className="ck-phos"> · 默认</span>}
                  </div>
                  <div className="ck-dim" style={{ fontSize: 11 }}>{provider.id} · {provider.baseUrl}</div>
                </div>
              </div>
              <span className="tag">{provider.enabled ? '启用' : '停用'}</span>
              <button className="ck-btn" onClick={() => editProvider(provider)}>编辑</button>
              <button className="ck-btn danger" onClick={() => deleteProvider(provider.id)}>{deletingProviderId === provider.id ? '删除中…' : '删除'}</button>
            </div>
          ))}
        </div>

        <div className="ck-panel">
          <div className="ck-hairline" style={{ marginTop: 0 }}>PROBE // 连通性测试</div>
          <textarea
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              minHeight: 72,
              resize: 'vertical',
              background: 'transparent',
              border: '1px solid var(--line)',
              borderRadius: 4,
              padding: '10px 14px',
              color: 'var(--ink)',
              fontFamily: 'inherit',
              fontSize: '12.5px',
              lineHeight: 1.6,
              outline: 'none',
            }}
          />
          <div className="ck-tools" style={{ marginTop: 8 }}>
            <button className="ck-btn primary" onClick={testConnection}>{testing ? '测试中…' : '发送测试'}</button>
          </div>
          {testResult && <div className="ck-term" style={{ marginTop: 8 }}>{testResult}</div>}
        </div>
      </div>
    </div>
  );
}