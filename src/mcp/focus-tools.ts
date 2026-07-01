import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { error as logError, info as logInfo, warn as logWarn } from '../core/logger';
import { flushDatabase, reloadDatabaseIfChanged } from '../core/db';
import { api as focusApi } from '../plugins/focus/api';
import type { FocusAttentionMode, FocusCheckInEnergy, FocusHealth } from '../shared/types';

const attentionModeSchema = z.enum(['deep', 'pulse', 'scan', 'dormant']);
const energySchema = z.enum(['engaged', 'neutral', 'avoiding']);
const healthSchema = z.enum(['aligned', 'drifting', 'neglected', 'cooling']);
const mutatingTools = new Set(['focus_create', 'focus_update_metadata', 'focus_check_in', 'focus_create_tag', 'focus_update_tag', 'focus_delete_tag']);
let toolQueue: Promise<unknown> = Promise.resolve();

function jsonContent(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function summarizeInput(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (typeof value === 'string' && value.length > 160) return [key, `${value.slice(0, 160)}…`];
    if (Array.isArray(value) && value.length > 12) return [key, [...value.slice(0, 12), `…(${value.length})`]];
    return [key, value];
  }));
}

function inferSuccess(result: unknown): boolean | undefined {
  if (result && typeof result === 'object' && 'success' in result) return Boolean((result as { success?: unknown }).success);
  return undefined;
}

function loggedTool<T extends Record<string, unknown>>(toolName: string, handler: (input: T) => unknown) {
  return (input: T) => {
    const run = async () => {
      const startedAt = Date.now();
      logInfo('mcp', 'tool_call_started', { tool: toolName, input: summarizeInput(input) });
      try {
        if (reloadDatabaseIfChanged()) logInfo('mcp', 'external_database_changes_reloaded', { tool: toolName });
        const result = await handler(input);
        const success = inferSuccess(result);
        if (mutatingTools.has(toolName) && success !== false) flushDatabase();
        const meta = {
          tool: toolName,
          durationMs: Date.now() - startedAt,
          success,
          error: success === false && result && typeof result === 'object' && 'error' in result
            ? String((result as { error?: unknown }).error)
            : undefined,
        };
        if (success === false) logWarn('mcp', 'tool_call_completed', meta);
        else logInfo('mcp', 'tool_call_completed', meta);
        return jsonContent(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logError('mcp', 'tool_call_failed', { tool: toolName, durationMs: Date.now() - startedAt, error: message });
        throw err;
      }
    };

    const queued = toolQueue.then(run, run);
    toolQueue = queued.catch(() => undefined);
    return queued;
  };
}

export function registerFocusTools(server: McpServer): void {
  server.registerTool('focus_create', {
    title: 'Create focus',
    description: 'Declare a focus object. This is one of the two write paths in the attention observation model.',
    inputSchema: {
      name: z.string().min(1),
      description: z.string().optional(),
      attentionMode: attentionModeSchema.default('pulse'),
      weight: z.number().min(0).max(10).default(5),
      expectedExit: z.string().optional(),
      tags: z.array(z.string()).default([]),
    },
  }, loggedTool('focus_create', ({ name, description, attentionMode, weight, expectedExit, tags }) => focusApi.create({
    name,
    description,
    attentionMode: attentionMode as FocusAttentionMode,
    weight,
    expectedExit,
    tags,
  })));

  server.registerTool('focus_check_in', {
    title: 'Check in focus',
    description: 'Record a focus check-in. Blank periods are meaningful; only check in what the user is willing to face.',
    inputSchema: {
      focusId: z.string().min(1),
      energy: energySchema,
      blocker: z.string().optional(),
      nextAction: z.string().optional(),
      notes: z.string().optional(),
    },
  }, loggedTool('focus_check_in', ({ focusId, energy, blocker, nextAction, notes }) => focusApi.checkIn({
    focusId,
    energy: energy as FocusCheckInEnergy,
    blocker,
    nextAction,
    notes,
  })));

  server.registerTool('focus_update_metadata', {
    title: 'Update focus metadata',
    description: 'Correct focus metadata only. This does not change health, status, or weight directly.',
    inputSchema: {
      focusId: z.string().min(1),
      name: z.string().optional(),
      description: z.string().optional(),
      expectedExit: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
  }, loggedTool('focus_update_metadata', ({ focusId, name, description, expectedExit, tags }) => focusApi.updateMetadata(focusId, {
    name,
    description,
    expectedExit,
    tags,
  })));
  server.registerTool('focus_get', {
    title: 'Get focus',
    description: 'Get one focus with computed health, cadence, days since check-in, and alerts.',
    inputSchema: { focusId: z.string().min(1) },
  }, loggedTool('focus_get', ({ focusId }) => focusApi.get(focusId)));

  server.registerTool('focus_list', {
    title: 'List focus',
    description: 'List focus views sorted by attention risk. Defaults to hiding fully faded focus objects.',
    inputSchema: {
      minWeight: z.number().min(0).max(10).optional(),
      maxWeight: z.number().min(0).max(10).optional(),
      health: healthSchema.optional(),
      attentionMode: attentionModeSchema.optional(),
      tag: z.string().optional(),
      includeDormant: z.boolean().optional(),
    },
  }, loggedTool('focus_list', ({ minWeight, maxWeight, health, attentionMode, tag, includeDormant }) => focusApi.list({
    minWeight,
    maxWeight,
    health: health as FocusHealth | undefined,
    attentionMode: attentionMode as FocusAttentionMode | undefined,
    tag,
    includeDormant,
  })));

  server.registerTool('focus_alerts', {
    title: 'List focus alerts',
    description: 'List computed focus anomalies such as neglected, weight decay, attention drift, and natural exit.',
    inputSchema: {},
  }, loggedTool('focus_alerts', () => focusApi.alerts()));

  server.registerTool('focus_checkins', {
    title: 'List focus check-ins',
    description: 'List check-in history for one focus.',
    inputSchema: { focusId: z.string().min(1) },
  }, loggedTool('focus_checkins', ({ focusId }) => focusApi.checkins(focusId)));

  server.registerTool('focus_stats', {
    title: 'Get focus stats',
    description: 'Get attention distribution stats by mode, health, alert count, and check-in activity.',
    inputSchema: {},
  }, loggedTool('focus_stats', () => focusApi.stats()));
  server.registerTool('focus_list_tags', {
    title: 'List focus tags',
    description: 'List tags available for focus classification.',
    inputSchema: {},
  }, loggedTool('focus_list_tags', () => focusApi.listTags()));

  server.registerTool('focus_create_tag', {
    title: 'Create focus tag',
    description: 'Create a tag for focus classification.',
    inputSchema: { name: z.string().min(1), color: z.string().optional() },
  }, loggedTool('focus_create_tag', ({ name, color }) => focusApi.createTag(name, color)));

  server.registerTool('focus_update_tag', {
    title: 'Update focus tag',
    description: 'Update a focus tag name or color.',
    inputSchema: { tagId: z.string().min(1), name: z.string().min(1), color: z.string().optional() },
  }, loggedTool('focus_update_tag', ({ tagId, name, color }) => focusApi.updateTag(tagId, name, color)));

  server.registerTool('focus_delete_tag', {
    title: 'Delete focus tag',
    description: 'Delete a tag when it is not referenced by any focus.',
    inputSchema: { tagId: z.string().min(1) },
  }, loggedTool('focus_delete_tag', ({ tagId }) => focusApi.deleteTag(tagId)));
}
