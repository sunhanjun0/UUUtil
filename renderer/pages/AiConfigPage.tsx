import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  NumberInput,
  NumberInputField,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@chakra-ui/react';
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
    <Box w="100%">
      <Box bg="white" borderRadius="sm" p={4} mb={1.5}>
        <Flex justify="space-between" align="center" mb={3}>
          <Box>
            <Heading size="sm">AI 配置</Heading>
            <Text fontSize="xs" color="gray.500" mt={1}>统一管理模型 Provider，后续翻译、助理等插件会复用这里的配置。</Text>
          </Box>
          <Badge colorScheme={activeProvider ? 'green' : 'gray'}>{activeProvider ? '已配置' : '未配置'}</Badge>
        </Flex>

        <Flex gap={2} wrap="wrap">
          {providerPresets.map((preset) => (
            <Button key={preset.name} size="xs" variant="outline" onClick={() => applyPreset(preset)}>
              使用 {preset.name} 模板
            </Button>
          ))}
        </Flex>
      </Box>

      <Flex gap={1.5} align="stretch" wrap="wrap">
        <Box bg="white" borderRadius="sm" p={4} flex="1 1 320px">
          <Heading size="xs" mb={3}>Provider</Heading>
          <Stack gap={3}>
            <FormControl>
              <FormLabel fontSize="xs">名称</FormLabel>
              <Input size="sm" value={providerDraft.name} placeholder="例如 DeepSeek" onChange={(e) => updateProviderDraft({ name: e.target.value })} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs">ID</FormLabel>
              <Input size="sm" value={providerDraft.id} placeholder="deepseek" onChange={(e) => updateProviderDraft({ id: e.target.value })} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs">类型</FormLabel>
              <Select size="sm" value={providerDraft.type} onChange={(e) => updateProviderDraft({ type: e.target.value as ProviderDraft['type'] })}>
                <option value="openai-compatible">OpenAI Compatible</option>
                <option value="custom">Custom</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs">Base URL</FormLabel>
              <Input size="sm" value={providerDraft.baseUrl} placeholder="https://api.deepseek.com/v1" onChange={(e) => updateProviderDraft({ baseUrl: e.target.value })} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs">API Key</FormLabel>
              <Input size="sm" type="password" value={providerDraft.apiKey || ''} placeholder="sk-..." onChange={(e) => updateProviderDraft({ apiKey: e.target.value })} />
            </FormControl>
            <Flex justify="space-between" align="center">
              <Text fontSize="sm">启用</Text>
              <Switch isChecked={providerDraft.enabled} onChange={(e) => updateProviderDraft({ enabled: e.target.checked })} />
            </Flex>
            <Flex gap={2}>
              <Button size="sm" colorScheme="blue" onClick={saveProvider} isLoading={savingProvider}>保存 Provider</Button>
              <Button size="sm" variant="outline" onClick={() => setProviderDraft(emptyProvider)}>清空</Button>
            </Flex>
          </Stack>
        </Box>

        <Box bg="white" borderRadius="sm" p={4} flex="1 1 320px">
          <Heading size="xs" mb={3}>运行配置</Heading>
          <Stack gap={3}>
            <FormControl>
              <FormLabel fontSize="xs">默认 Provider</FormLabel>
              <Select size="sm" value={runtimeConfig.defaultProviderId || ''} onChange={(e) => setRuntimeConfig({ ...runtimeConfig, defaultProviderId: e.target.value || undefined })}>
                <option value="">自动选择第一个启用 Provider</option>
                {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs">默认模型</FormLabel>
              <Input size="sm" value={runtimeConfig.defaultModel || ''} placeholder="deepseek-chat / gpt-4o-mini" onChange={(e) => setRuntimeConfig({ ...runtimeConfig, defaultModel: e.target.value })} />
            </FormControl>
            <Flex gap={3}>
              <FormControl>
                <FormLabel fontSize="xs">Temperature</FormLabel>
                <NumberInput size="sm" min={0} max={2} step={0.1} value={runtimeConfig.temperature ?? ''} onChange={(_, value) => setRuntimeConfig({ ...runtimeConfig, temperature: Number.isNaN(value) ? undefined : value })}>
                  <NumberInputField placeholder="0.7" />
                </NumberInput>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs">Max Tokens</FormLabel>
                <NumberInput size="sm" min={1} value={runtimeConfig.maxTokens ?? ''} onChange={(_, value) => setRuntimeConfig({ ...runtimeConfig, maxTokens: Number.isNaN(value) ? undefined : value })}>
                  <NumberInputField placeholder="1024" />
                </NumberInput>
              </FormControl>
            </Flex>
            <FormControl>
              <FormLabel fontSize="xs">超时时间 ms</FormLabel>
              <NumberInput size="sm" min={1000} value={runtimeConfig.timeoutMs ?? ''} onChange={(_, value) => setRuntimeConfig({ ...runtimeConfig, timeoutMs: Number.isNaN(value) ? undefined : value })}>
                <NumberInputField placeholder="30000" />
              </NumberInput>
            </FormControl>
            <Button size="sm" colorScheme="blue" onClick={saveRuntimeConfig} isLoading={savingRuntime}>保存运行配置</Button>
          </Stack>
        </Box>
      </Flex>

      <Box bg="white" borderRadius="sm" p={4} mt={1.5}>
        <Flex justify="space-between" align="center" mb={3}>
          <Heading size="xs">已保存 Provider</Heading>
          <Text fontSize="xs" color="gray.500">{providers.length} 个</Text>
        </Flex>
        <Stack gap={2}>
          {providers.length === 0 ? (
            <Text fontSize="sm" color="gray.500">还没有 Provider，建议先使用上方模板创建。</Text>
          ) : providers.map((provider) => (
            <Flex key={provider.id} justify="space-between" align="center" p={2} bg="gray.50" borderRadius="md" gap={3}>
              <Box minW={0}>
                <Flex gap={2} align="center" wrap="wrap">
                  <Text fontSize="sm" fontWeight="semibold">{provider.name}</Text>
                  <Badge size="sm" colorScheme={provider.enabled ? 'green' : 'gray'}>{provider.enabled ? '启用' : '停用'}</Badge>
                  {runtimeConfig.defaultProviderId === provider.id && <Badge colorScheme="blue">默认</Badge>}
                </Flex>
                <Text fontSize="xs" color="gray.500" noOfLines={1}>{provider.id} · {provider.baseUrl}</Text>
              </Box>
              <Flex gap={2} shrink={0}>
                <Button size="xs" variant="outline" onClick={() => editProvider(provider)}>编辑</Button>
                <Button size="xs" colorScheme="red" variant="ghost" onClick={() => deleteProvider(provider.id)} isLoading={deletingProviderId === provider.id}>删除</Button>
              </Flex>
            </Flex>
          ))}
        </Stack>
      </Box>

      <Box bg="white" borderRadius="sm" p={4} mt={1.5}>
        <Heading size="xs" mb={3}>连通性测试</Heading>
        <Stack gap={3}>
          <Textarea size="sm" value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} minH="72px" />
          <Button size="sm" colorScheme="green" alignSelf="flex-start" onClick={testConnection} isLoading={testing}>发送测试</Button>
          {testResult && (
            <>
              <Divider />
              <Text fontSize="sm" whiteSpace="pre-wrap">{testResult}</Text>
            </>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
