import type { AiChatRequest, AiChatResponse, AiProviderConfig } from '../../shared/types';
import { getModelConnector } from './connector-registry';
import { getAiRuntimeConfig } from './runtime-config';
import { listAiProviders } from './provider-store';

function resolveProvider(providerId?: string): AiProviderConfig | null {
  const runtimeConfig = getAiRuntimeConfig();
  const id = providerId || runtimeConfig.defaultProviderId;
  const providers = listAiProviders().filter((provider) => provider.enabled);
  return providers.find((provider) => provider.id === id) || providers[0] || null;
}

export async function chat(request: AiChatRequest): Promise<AiChatResponse> {
  const provider = resolveProvider(request.providerId);
  if (!provider) {
    return { success: false, error: '未配置可用的 AI Provider' };
  }

  const connector = getModelConnector(provider);
  if (!connector) {
    return { success: false, providerId: provider.id, error: `暂不支持的 AI Provider 类型: ${provider.type}` };
  }

  return connector.chat({
    provider,
    runtimeConfig: getAiRuntimeConfig(),
    request,
  });
}
