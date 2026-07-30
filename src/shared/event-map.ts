import type {
  AttentionEvent,
  ClipboardUpdatePayload,
  DevUtilsApi,
  FieResult,
  IngestResult,
  KnowledgeBaseApi,
} from './types';

export interface PluginManifestLike {
  id: string;
  name: string;
  version: string;
  description?: string;
}

export interface PluginLike {
  manifest: PluginManifestLike;
  activate?: () => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

export type PluginLifecyclePayload = { version: string };
export type ReminderChangedPayload = {
  reason: 'notify' | 'ask' | 'respond' | 'dismiss';
  type: 'info' | 'action';
  deduped: boolean;
};
export type CalculatorResultPayload = { expression: string; result: string };
export type HelloWorldGreetedPayload = { name: string; greeting: string };
export type ActionResultPayload<T = unknown> = { action: string; result: T };

export type DevUtilsAction = keyof DevUtilsApi;
export type DevUtilsResult = ReturnType<DevUtilsApi[DevUtilsAction]>;
export type KnowledgeBaseAction = keyof KnowledgeBaseApi;
export type KnowledgeBaseResult = ReturnType<KnowledgeBaseApi[KnowledgeBaseAction]>;

export interface AppEventMap {
  'core:ready': [];
  'core:plugins-loaded': [PluginLike[]];
  'core:plugin-activated': [PluginManifestLike];
  'core:plugin-deactivated': [PluginManifestLike];

  'hello-world:greet': [string];
  'hello-world:greeted': [HelloWorldGreetedPayload];
  'hello-world:activated': [PluginLifecyclePayload];
  'hello-world:deactivated': [];

  'calculator:calculate': [string];
  'calculator:result': [CalculatorResultPayload];
  'calculator:activated': [PluginLifecyclePayload];
  'calculator:deactivated': [];

  'dev-utils:invoke': [DevUtilsAction | string, ...unknown[]];
  'dev-utils:result': [ActionResultPayload<DevUtilsResult>];
  'dev-utils:activated': [PluginLifecyclePayload];
  'dev-utils:deactivated': [];

  'knowledge-base:getNotes': [string?, string?];
  'knowledge-base:searchNotes': [string];
  'knowledge-base:createNote': [string, string, string, string[]];
  'knowledge-base:updateNote': [string, string, string, string, string[]];
  'knowledge-base:deleteNote': [string];
  'knowledge-base:getCategories': [];
  'knowledge-base:createCategory': [string, string?];
  'knowledge-base:deleteCategory': [string];
  'knowledge-base:getTags': [];
  'knowledge-base:createTag': [string];
  'knowledge-base:deleteTag': [string];
  'knowledge-base:result': [ActionResultPayload<KnowledgeBaseResult>];

  'focus:ingest': [AttentionEvent];
  'focus:ingested': [FieResult<IngestResult>];
  'focus:activated': [PluginLifecyclePayload];
  'focus:deactivated': [];

  'reminder:activated': [PluginLifecyclePayload];
  'reminder:deactivated': [];
  'reminder:changed': [ReminderChangedPayload];

  'clipboard:activated': [PluginLifecyclePayload];
  'clipboard:deactivated': [];
  'clipboard:changed': [ClipboardUpdatePayload];
}

export type AppEventName = keyof AppEventMap;
export type AppEventHandler<K extends AppEventName> = (...args: AppEventMap[K]) => void;
