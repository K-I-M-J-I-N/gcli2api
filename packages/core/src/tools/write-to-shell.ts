/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import { WRITE_TO_SHELL_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { getToolSet } from './definitions/coreTools.js';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import stripAnsi from 'strip-ansi';

export interface WriteToShellParams {
  pid: number;
  input: string;
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
    return `Writing input to shell process ${this.params.pid}`;
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: unknown) => void,
  ): Promise<ToolResult> {
    if (signal.aborted) {
      return {
        llmContent: 'Action was cancelled by user.',
        returnDisplay: 'Action cancelled.',
      };
    }

    try {
      const pid = this.params.pid;
      const input = this.params.input;

      if (!ShellExecutionService.isPtyActive(pid)) {
        return {
          llmContent: `Error: Process ${pid} is not active or could not be found.`,
          returnDisplay: `Process ${pid} is not active.`,
        };
      }

      let cumulativeOutput = '';
      let isBinaryStream = false;
      let resolvePromise: (result: ToolResult) => void;

      const promise = new Promise<ToolResult>((resolve) => {
        resolvePromise = resolve;
      });

      // Use a short 3-second timeout for hang detection (waiting for more input)
      const HANG_TIMEOUT_MS = 3000;
      let timeoutTimer: NodeJS.Timeout | undefined;

      const resetTimeout = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        timeoutTimer = setTimeout(() => {
          // It's already in background, but we need to resolve our local promise
          const currentOutput = ShellExecutionService.getOutput(pid);
          resolvePromise({
            llmContent: `Command is paused and waiting for input again (PID: ${pid}). Last output:\n${currentOutput ? stripAnsi(currentOutput) : '(empty)'}\nUse 'write_to_shell' tool to provide input.`,
            returnDisplay: `Command paused waiting for input (PID: ${pid}).`,
          });
        }, HANG_TIMEOUT_MS);
      };

      const unsubscribe = ShellExecutionService.subscribe(pid, (event) => {
        resetTimeout();
        if (!updateOutput) return;

        switch (event.type) {
          case 'data':
            if (isBinaryStream) break;
            cumulativeOutput = event.chunk;
            updateOutput(cumulativeOutput);
            break;
          case 'binary_detected':
          case 'binary_progress':
            isBinaryStream = true;
            updateOutput('[Binary output detected. Halting stream...]');
            break;
          case 'exit':
            resolvePromise({
              llmContent: `Process ${pid} exited.`,
              returnDisplay: `Process ${pid} exited.`,
            });
            break;
          default:
            break;
        }
      });

      const unsubscribeExit = ShellExecutionService.onExit(
        pid,
        (exitCode, exitSignal) => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          resolvePromise({
            llmContent: `Process ${pid} exited with code ${exitCode}${exitSignal ? ` (signal: ${exitSignal})` : ''}.`,
            returnDisplay: `Process ${pid} exited with code ${exitCode}.`,
          });
        },
      );

      signal.addEventListener(
        'abort',
        () => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          resolvePromise({
            llmContent: 'Action was cancelled by user.',
            returnDisplay: 'Action cancelled.',
          });
        },
        { once: true },
      );

      // Start observing
      resetTimeout();

      // Write to PTY
      ShellExecutionService.writeToPty(pid, input);

      const result = await promise;

      unsubscribe();
      unsubscribeExit();
      if (timeoutTimer) clearTimeout(timeoutTimer);

      return result;
    } catch (e) {
      const errorMsg = getErrorMessage(e);
      return {
        llmContent: `Failed to write to shell: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
      };
    }
  }
}

export class WriteToShellTool extends BaseDeclarativeTool<
  WriteToShellParams,
  ToolResult
> {
  static readonly Name = WRITE_TO_SHELL_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    const definition = getToolSet(config.getModel()).write_to_shell;
    super(
      WriteToShellTool.Name,
      'Write to Shell',
      definition.description!,
      Kind.Execute,
      definition.parametersJsonSchema,
      messageBus,
      false, // output is not markdown
      true, // output can be updated
    );
  }

  protected override validateToolParamValues(
    params: WriteToShellParams,
  ): string | null {
    if (params.pid === undefined || params.pid === null) {
      return 'PID is required.';
    }
    if (typeof params.input !== 'string') {
      return 'Input must be a string.';
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
    const definition = getToolSet(this.config.getModel()).write_to_shell;
    return resolveToolDeclaration({ base: definition }, modelId);
  }
}
