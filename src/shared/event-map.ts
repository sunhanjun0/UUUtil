import type {
  DevUtilsApi,
  FocusArea,
  FocusHorizon,
  FocusImportance,
  FocusMigration,
  FocusSession,
  FocusStats,
  FocusStatus,
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

export interface FocusAreaPayload {
  name: string;
  description: string;
  whyImportant: string;
  horizon: FocusHorizon;
  status: FocusStatus;
  importance: FocusImportance;
  tagIds: string[];
  desiredOutcome?: string;
  nextReviewAt?: string;
  contextLinks?: string[];
}

export type FocusAreaUpdatePayload = FocusAreaPayload & { areaId: string };
export type FocusAreaFilterPayload = {
  horizon?: FocusHorizon;
  status?: FocusStatus;
  tagId?: string;
  importance?: FocusImportance;
} | undefined;
export type FocusMigratePayload = { areaId: string; toHorizon: FocusHorizon; reason?: string };
export type FocusStatusPayload = { areaId: string; toStatus: FocusStatus; reason?: string };
export type FocusTagPayload = { name: string; color?: string };
export type FocusEndSessionPayload = { sessionId: string; notes?: string };

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

  'focus:create-area': [FocusAreaPayload];
  'focus:update-area': [FocusAreaUpdatePayload];
  'focus:delete-area': [string];
  'focus:get-areas': [FocusAreaFilterPayload];
  'focus:get-area-by-id': [string];
  'focus:migrate-area': [FocusMigratePayload];
  'focus:change-area-status': [FocusStatusPayload];
  'focus:get-migrations': [string?];
  'focus:create-tag': [FocusTagPayload];
  'focus:get-tags': [];
  'focus:delete-tag': [string];
  'focus:start-session': [string];
  'focus:end-session': [FocusEndSessionPayload];
  'focus:get-sessions': [string?];
  'focus:get-stats': [];
  'focus:area-created': [ReturnType<KnowledgeBaseApi['deleteNote']> & { areaId?: string }];
  'focus:area-updated': [ReturnType<KnowledgeBaseApi['deleteNote']>];
  'focus:area-deleted': [ReturnType<KnowledgeBaseApi['deleteNote']>];
  'focus:areas-loaded': [FocusArea[]];
  'focus:area-loaded': [FocusArea | null];
  'focus:area-migrated': [ReturnType<KnowledgeBaseApi['deleteNote']>];
  'focus:area-status-changed': [ReturnType<KnowledgeBaseApi['deleteNote']>];
  'focus:migrations-loaded': [FocusMigration[]];
  'focus:tag-created': [ReturnType<KnowledgeBaseApi['createTag']>];
  'focus:tags-loaded': [FocusTag[]];
  'focus:tag-deleted': [ReturnType<KnowledgeBaseApi['deleteNote']>];
  'focus:session-started': [{ success: boolean; sessionId?: string; error?: string }];
  'focus:session-ended': [{ success: boolean; durationMinutes?: number; error?: string }];
  'focus:sessions-loaded': [FocusSession[]];
  'focus:stats-loaded': [FocusStats];
  'focus:activated': [PluginLifecyclePayload];
  'focus:deactivated': [];
}

export type AppEventName = keyof AppEventMap;
export type AppEventHandler<K extends AppEventName> = (...args: AppEventMap[K]) => void;
