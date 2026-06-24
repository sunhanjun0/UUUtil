import type { AiProviderConfig } from '../../shared/types';
import type { ModelConnector } from './types';

const modelConnectors = new Map<string, ModelConnector>();

export function registerModelConnector(connector: ModelConnector): void {
  modelConnectors.set(connector.providerType, connector);
}

export function getModelConnector(provider: AiProviderConfig): ModelConnector | null {
  return modelConnectors.get(provider.type) || null;
}

export function listModelConnectors(): ModelConnector[] {
  return Array.from(modelConnectors.values());
}
