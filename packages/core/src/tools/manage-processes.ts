/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { getToolSet } from './definitions/coreTools.js';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';

// ---- list_background_processes ----

export type ListProcessesParams = object;

export class ListProcessesInvocation extends BaseToolInvocation<
  ListProcessesParams,
  ToolResult
> {
  constructor(
    params: ListProcessesParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    return `Listing active background processes`;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: unknown) => void,
  ): Promise<ToolResult> {
    try {
      const processes = ShellExecutionService.getActiveProcesses();

      if (processes.length === 0) {
        return {
          llmContent: 'No active background processes managed by the agent.',
          returnDisplay: 'No active background processes.',
        };
      }

      const listStr = processes
        .map(
          (p) =>
            `- PID: ${p.pid}, Command: ${p.command || 'unknown'}, Backgrounded: ${p.backgrounded}`,
        )
        .join('\n');

      return {
        llmContent: `Active background processes:\n${listStr}`,
        returnDisplay: `Found ${processes.length} active processes.`,
      };
    } catch (e) {
      const errorMsg = getErrorMessage(e);
      return {
        llmContent: `Error listing processes: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
      };
    }
  }
}

export class ListProcessesTool extends BaseDeclarativeTool<
  ListProcessesParams,
  ToolResult
> {
  static readonly Name = 'list_background_processes';

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    const definition = getToolSet(
      context.config.getModel(),
    ).list_background_processes;
    super(
      ListProcessesTool.Name,
      'List Processes',
      definition.description!,
      Kind.Execute,
      definition.parametersJsonSchema,
      messageBus,
      false, // output is not markdown
      false, // output can not be updated
    );
  }

  protected override validateToolParamValues(
    _params: ListProcessesParams,
  ): string | null {
    return null;
  }

  protected createInvocation(
    params: ListProcessesParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<ListProcessesParams, ToolResult> {
    return new ListProcessesInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    const definition = getToolSet(
      this.context.config.getModel(),
    ).list_background_processes;
    return resolveToolDeclaration({ base: definition }, modelId);
  }
}

// ---- kill_process ----

export interface KillProcessParams {
  pid: number;
}

export class KillProcessInvocation extends BaseToolInvocation<
  KillProcessParams,
  ToolResult
> {
  constructor(
    params: KillProcessParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    return `Killing background process ${this.params.pid}`;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: unknown) => void,
  ): Promise<ToolResult> {
    try {
      const pid = this.params.pid;
      const processes = ShellExecutionService.getActiveProcesses();

      if (!processes.some((p) => p.pid === pid)) {
        return {
          llmContent: `Error: Process ${pid} is not active or could not be found among managed processes.`,
          returnDisplay: `Process ${pid} not found.`,
        };
      }

      await ShellExecutionService.kill(pid);

      return {
        llmContent: `Successfully killed process ${pid}.`,
        returnDisplay: `Killed process ${pid}.`,
      };
    } catch (e) {
      const errorMsg = getErrorMessage(e);
      return {
        llmContent: `Error killing process: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
      };
    }
  }
}

export class KillProcessTool extends BaseDeclarativeTool<
  KillProcessParams,
  ToolResult
> {
  static readonly Name = 'kill_process';

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    const definition = getToolSet(context.config.getModel()).kill_process;
    super(
      KillProcessTool.Name,
      'Kill Process',
      definition.description!,
      Kind.Execute,
      definition.parametersJsonSchema,
      messageBus,
      false, // output is not markdown
      false, // output can not be updated
    );
  }

  protected override validateToolParamValues(
    params: KillProcessParams,
  ): string | null {
    if (params.pid === undefined || params.pid === null) {
      return 'PID is required.';
    }
    return null;
  }

  protected createInvocation(
    params: KillProcessParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<KillProcessParams, ToolResult> {
    return new KillProcessInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    const definition = getToolSet(this.context.config.getModel()).kill_process;
    return resolveToolDeclaration({ base: definition }, modelId);
  }
}
