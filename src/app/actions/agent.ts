'use server';

import { createStreamableValue } from '@ai-sdk/rsc';

import { createAgentGraph } from '@/lib/agent/graph';
import type { AgentStreamUpdate, Task } from '@/lib/agent/types';

type NodeOutput = {
  tasks?: Task[];
  loopCount?: number;
  isValid?: boolean;
  validationErrors?: string[];
  auditReasoning?: string;
};

function toStreamUpdate(
  nodeName: string,
  nodeOutput: NodeOutput,
): AgentStreamUpdate {
  return {
    status: 'running',
    node: nodeName,
    tasks: nodeOutput.tasks ?? null,
    isValid: nodeOutput.isValid ?? null,
    validationErrors: nodeOutput.validationErrors ?? null,
    loopCount: nodeOutput.loopCount ?? null,
    reasoning: nodeOutput.auditReasoning ?? null,
  };
}

export async function startAgentWorkflow(businessGoal: string) {
  const startedAt = Date.now();
  const stream = createStreamableValue<AgentStreamUpdate>();
  const goal = businessGoal.trim();

  console.log('[action] startAgentWorkflow', {
    goalPreview: goal.slice(0, 200),
    elapsedMs: 0,
  });

  if (!goal) {
    stream.error(new Error('Empty business goal'));
    return { output: stream.value };
  }

  // Run async so we can return stream.value to the client immediately
  (async () => {
    try {
      const workflow = createAgentGraph({ startedAt });

      stream.update({
        status: 'running',
        node: 'start',
        tasks: null,
        isValid: null,
        validationErrors: null,
        loopCount: 0,
        message: 'Agent graph started',
      });

      const eventStream = await workflow.stream(
        {
          businessGoal: goal,
          tasks: [],
          isValid: false,
          validationErrors: [],
          loopCount: 0,
          auditReasoning: '',
        },
        {
          streamMode: 'updates',
        },
      );

      let latestTasks: Task[] | null = null;
      let latestLoopCount: number | null = 0;
      let latestIsValid: boolean | null = null;
      let latestErrors: string[] | null = null;
      let latestReasoning: string | null = null;

      for await (const event of eventStream) {
        const nodeName = Object.keys(event)[0];
        if (!nodeName) continue;

        const nodeOutput = (event as Record<string, NodeOutput>)[nodeName] ?? {};
        const update = toStreamUpdate(nodeName, nodeOutput);

        if (update.tasks) latestTasks = update.tasks;
        if (update.loopCount != null) latestLoopCount = update.loopCount;
        if (update.isValid != null) latestIsValid = update.isValid;
        if (update.validationErrors) latestErrors = update.validationErrors;
        if (update.reasoning) latestReasoning = update.reasoning;

        console.log('[action] graph node update', {
          node: nodeName,
          loopCount: update.loopCount,
          isValid: update.isValid,
          errorCount: update.validationErrors?.length ?? null,
          taskCount: update.tasks?.length ?? null,
          elapsedMs: Date.now() - startedAt,
        });

        stream.update(update);
      }

      console.log('[action] graph completed', {
        loopCount: latestLoopCount,
        taskCount: latestTasks?.length ?? 0,
        isValid: latestIsValid,
        elapsedMs: Date.now() - startedAt,
      });

      stream.done({
        status: 'completed',
        node: 'end',
        tasks: latestTasks,
        isValid: latestIsValid,
        validationErrors: latestIsValid ? null : latestErrors,
        loopCount: latestLoopCount,
        reasoning: latestReasoning,
        message: latestIsValid
          ? 'Graph completed successfully — plan verified'
          : 'Graph stopped (max loops or unresolved validation errors)',
      });
    } catch (error) {
      console.error('[action] Error in graph Server Action:', error);
      stream.error(error);
    }
  })();

  return { output: stream.value };
}
