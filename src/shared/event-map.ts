import type {
  DevUtilsApi,
  FocusAlert,
  FocusAreaView,
  FocusCheckIn,
  FocusCheckInInput,
  FocusCreateInput,
  FocusListFilters,
  FocusMetadataUpdateInput,
  FocusStats,
  FocusTag,
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
export type CalculatorResultPayload = { expression: string; result: string };
export type HelloWorldGreetedPayload = { name: string; greeting: string };
export type ActionResultPayload<T = unknown> = { action: string; result: T };

export type DevUtilsAction = keyof DevUtilsApi;
export type DevUtilsResult = ReturnType<DevUtilsApi[DevUtilsAction]>;
export type KnowledgeBaseAction = keyof KnowledgeBaseApi;
export type KnowledgeBaseResult = ReturnType<KnowledgeBaseApi[KnowledgeBaseAction]>;

export type FocusMetadataUpdatePayload = { focusId: string; input: FocusMetadataUpdateInput };
export type FocusTagPayload = { name: string; color?: string };
export type FocusTagUpdatePayload = { tagId: string; name: string; color?: string };

export interface AppEventMap {
  'core:ready': [];
  'core:plugins-loaded': [PluginLike[]];
  'core:plugin-activated': [PluginManifestLike];

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

  'focus:create': [FocusCreateInput];
  'focus:update-metadata': [FocusMetadataUpdatePayload];
  'focus:check-in': [FocusCheckInInput];
  'focus:get': [string];
  'focus:list': [FocusListFilters?];
  'focus:alerts': [];
  'focus:checkins': [string];
  'focus:stats': [];
  'focus:create-tag': [FocusTagPayload];
  'focus:update-tag': [FocusTagUpdatePayload];
  'focus:list-tags': [];
  'focus:delete-tag': [string];
  'focus:created': [{ success: boolean; focusId?: string; error?: string }];
  'focus:metadata-updated': [{ success: boolean; error?: string }];
  'focus:checked-in': [{ success: boolean; checkInId?: string; error?: string }];
  'focus:loaded': [FocusAreaView | null];
  'focus:list-loaded': [FocusAreaView[]];
  'focus:alerts-loaded': [FocusAlert[]];
  'focus:checkins-loaded': [FocusCheckIn[]];
  'focus:stats-loaded': [FocusStats];
  'focus:tag-created': [{ success: boolean; tagId?: string; error?: string }];
  'focus:tag-updated': [{ success: boolean; error?: string }];
  'focus:tags-loaded': [FocusTag[]];
  'focus:tag-deleted': [{ success: boolean; error?: string }];
  'focus:activated': [PluginLifecyclePayload];
  'focus:deactivated': [];
}

export type AppEventName = keyof AppEventMap;
export type AppEventHandler<K extends AppEventName> = (...args: AppEventMap[K]) => void;
