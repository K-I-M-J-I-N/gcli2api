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
  type ToolLiveOutput,
} from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { getToolSet } from './definitions/coreTools.js';
import { ExecutionLifecycleService } from '../services/executionLifecycleService.js';
import { type ShellExecutionConfig } from '../services/shellExecutionService.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';

export interface WriteToShellParams {
  pid: number;
  input?: string;
  control_sequence?:
    | 'ctrl-c'
    | 'ctrl-d'
    | 'enter'
    | 'escape'
    | 'arrow-up'
    | 'arrow-down';
}

export class WriteToShellInvocation extends BaseToolInvocation<
  WriteToShellParams,
  ToolResult
> {
  constructor(
    params: WriteToShellParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const { pid, input, control_sequence } = this.params;
    let desc = `Sending to process ${pid}:`;
    if (input) {
      desc += ` input "${input.replace(/\n/g, '\\n')}"`;
    }
    if (control_sequence) {
      desc += `${input ? ' and' : ''} control sequence ${control_sequence}`;
    }
    return desc;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: ToolLiveOutput) => void,
    _shellExecutionConfig?: ShellExecutionConfig,
  ): Promise<ToolResult> {
    try {
      const { pid, input, control_sequence } = this.params;

      if (!input && !control_sequence) {
        return {
          llmContent:
            'Error: Either input or control_sequence must be provided.',
          returnDisplay: 'Error: No input or control sequence provided.',
        };
      }

      if (input) {
        ExecutionLifecycleService.writeInput(pid, input);
      }

      if (control_sequence) {
        switch (control_sequence) {
          case 'ctrl-c': {
            ExecutionLifecycleService.writeInput(pid, '\x03');
            break;
          }
          case 'ctrl-d': {
            ExecutionLifecycleService.writeInput(pid, '\x04');
            break;
          }
          case 'enter': {
            ExecutionLifecycleService.writeInput(pid, '\r');
            break;
          }
          case 'escape': {
            ExecutionLifecycleService.writeInput(pid, '\x1b');
            break;
          }
          case 'arrow-up': {
            ExecutionLifecycleService.writeInput(pid, '\x1b[A');
            break;
          }
          case 'arrow-down': {
            ExecutionLifecycleService.writeInput(pid, '\x1b[B');
            break;
          }
          default: {
            // Should not happen due to validation
            break;
          }
        }
      }

      return {
        llmContent: `Successfully sent input/sequence to process ${pid}.`,
        returnDisplay: `Sent to process ${pid}.`,
      };
    } catch (e) {
      const errorMsg = getErrorMessage(e);
      return {
        llmContent: `Error sending to process: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
      };
    }
  }
}

export class WriteToShellTool extends BaseDeclarativeTool<
  WriteToShellParams,
  ToolResult
> {
  static readonly Name = 'write_to_shell';

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    const definition = getToolSet(context.config.getModel()).write_to_shell;
    super(
      WriteToShellTool.Name,
      'Write to Shell',
      definition.description!,
      Kind.Execute,
      definition.parametersJsonSchema,
      messageBus,
      false, // output is not markdown
      false, // output can not be updated
    );
  }

  protected override validateToolParamValues(
    params: WriteToShellParams,
  ): string | null {
    if (!params.pid) {
      return 'PID is required.';
    }
    if (!params.input && !params.control_sequence) {
      return 'Either input or control_sequence must be provided.';
    }
    return null;
  }

  protected createInvocation(
    params: WriteToShellParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<WriteToShellParams, ToolResult> {
    return new WriteToShellInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    const definition = getToolSet(
      this.context.config.getModel(),
    ).write_to_shell;
    return resolveToolDeclaration({ base: definition }, modelId);
  }
}
