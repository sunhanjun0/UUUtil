import type { AiChatRequest, AiChatResponse, AiProviderConfig, AiRuntimeConfig } from '../../shared/types';

export type ModelConnectorCapability = 'chat' | 'stream' | 'vision' | 'embedding';

export interface ConnectorChatRequest {
  provider: AiProviderConfig;
  runtimeConfig: AiRuntimeConfig;
  request: AiChatRequest;
}

export interface ModelConnector {
  id: string;
  name: string;
  providerType: AiProviderConfig['type'];
  capabilities: ModelConnectorCapability[];
  chat(request: ConnectorChatRequest): Promise<AiChatResponse>;
}
