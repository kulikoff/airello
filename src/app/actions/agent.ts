'use server';

import { createStreamableValue } from '@ai-sdk/rsc';

import { createAgentGraph } from '@/lib/agent/graph';
import type { Task } from '@/lib/agent/types';

// Exact chunk signature sent across the wire to the dashboard
export type StreamChunk = {
  activeNode: 'planner' | 'validator' | 'end';
  tasks: Task[];
  validationErrors: string[];
  loopCount: number;
  status: 'thinking' | 'verifying' | 'completed' | 'failed';
  isValid?: boolean;
  reasoning?: string;
};

type NodeOutput = {
  tasks?: Task[];
  loopCount?: number;
  isValid?: boolean;
  validationErrors?: string[];
  auditReasoning?: string;
};

export async function runAgenticWorkflow(businessGoal: string) {
  // 1. Initialize Vercel AI SDK real-time streaming handle
  const stream = createStreamableValue<StreamChunk>();
  const goal = businessGoal.trim();
  const startedAt = Date.now();

  if (!goal) {
    stream.error(new Error('Empty business goal'));
    return { output: stream.value };
  }

  // 2. Fire-and-forget so the server immediately returns the stream pointer
  (async () => {
    try {
      console.log(
        `[SERVER ACTION] Initializing Agent Loop for Goal: "${goal}"`,
      );

      // Fresh graph instance so logging gets accurate startedAt timing
      const compiledWorkflow = createAgentGraph({ startedAt });

      const initialState = {
        businessGoal: goal,
        tasks: [] as Task[],
        validationErrors: [] as string[],
        loopCount: 0,
        isValid: false,
        auditReasoning: '',
      };

      // Accumulated snapshot — LangGraph "updates" mode only returns per-node deltas
      let snapshot: {
        tasks: Task[];
        validationErrors: string[];
        loopCount: number;
        isValid: boolean;
        reasoning: string;
      } = {
        tasks: [],
        validationErrors: [],
        loopCount: 0,
        isValid: false,
        reasoning: '',
      };

      // 3. Consume cyclic execution via event streaming
      const graphStream = await compiledWorkflow.stream(initialState, {
        streamMode: 'updates',
      });

      for await (const chunk of graphStream) {
        const nodeName = Object.keys(chunk)[0];
        if (!nodeName) continue;

        const nodeState =
          (chunk as Record<string, NodeOutput>)[nodeName] ?? {};

        if (nodeState.tasks) snapshot.tasks = nodeState.tasks;
        if (nodeState.loopCount != null) snapshot.loopCount = nodeState.loopCount;
        if (nodeState.isValid != null) snapshot.isValid = nodeState.isValid;
        if (nodeState.validationErrors) {
          snapshot.validationErrors = nodeState.validationErrors;
        }
        if (nodeState.auditReasoning) {
          snapshot.reasoning = nodeState.auditReasoning;
        }

        let activeNode: StreamChunk['activeNode'] = 'planner';
        let status: StreamChunk['status'] = 'thinking';

        if (nodeName === 'PlannerNode' || nodeName === 'planner') {
          activeNode = 'planner';
          status = 'thinking';
        } else if (nodeName === 'ValidatorNode' || nodeName === 'validator') {
          activeNode = 'validator';
          status = 'verifying';
        }

        console.log('[SERVER ACTION] stream delta', {
          activeNode,
          status,
          loopCount: snapshot.loopCount,
          taskCount: snapshot.tasks.length,
          errorCount: snapshot.validationErrors.length,
          isValid: snapshot.isValid,
          elapsedMs: Date.now() - startedAt,
        });

        // 4. Push live delta to the client dashboard
        stream.update({
          activeNode,
          tasks: snapshot.tasks,
          validationErrors: snapshot.validationErrors,
          loopCount: snapshot.loopCount,
          status,
          isValid: snapshot.isValid,
          reasoning: snapshot.reasoning || undefined,
        });
      }

      // 5. Broadcast terminating payload (accumulated snapshot — no checkpointer needed)
      const finalStatus: StreamChunk['status'] = snapshot.isValid
        ? 'completed'
        : 'failed';

      console.log('[SERVER ACTION] graph finished', {
        status: finalStatus,
        loopCount: snapshot.loopCount,
        taskCount: snapshot.tasks.length,
        elapsedMs: Date.now() - startedAt,
      });

      stream.done({
        activeNode: 'end',
        tasks: snapshot.tasks,
        validationErrors: snapshot.validationErrors,
        loopCount: snapshot.loopCount,
        status: finalStatus,
        isValid: snapshot.isValid,
        reasoning: snapshot.reasoning || undefined,
      });
    } catch (error) {
      console.error('[SERVER ACTION ERROR]:', error);
      stream.error(error);
    }
  })();

  // Pure reference interface for client hooks
  return { output: stream.value };
}

/** @deprecated Prefer runAgenticWorkflow */
export const startAgentWorkflow = runAgenticWorkflow;
