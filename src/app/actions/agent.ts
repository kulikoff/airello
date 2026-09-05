'use server';

import { createStreamableValue } from '@ai-sdk/rsc';

import { createAgentGraph } from '@/lib/agent/graph';
import type { AgentStreamUpdate, Task } from '@/lib/agent/types';

type NodeOutput = {
  tasks?: Task[];
  iterations?: number;
  validationFeedback?: string;
};

function toStreamUpdate(
  nodeName: string,
  nodeOutput: NodeOutput,
): AgentStreamUpdate {
  const feedback = nodeOutput.validationFeedback?.trim();

  return {
    status: 'running',
    node: nodeName,
    tasks: nodeOutput.tasks ?? null,
    // Validator writes feedback; planner does not touch it
    isValid:
      nodeName === 'validator' ? !feedback : null,
    validationErrors: feedback ? [feedback] : null,
    loopCount: nodeOutput.iterations ?? null,
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
          userPrompt: goal,
          tasks: [],
          validationFeedback: '',
          iterations: 0,
        },
        {
          streamMode: 'updates',
        },
      );

      let latestTasks: Task[] | null = null;
      let latestLoopCount: number | null = 0;
      let latestIsValid: boolean | null = null;
      let latestErrors: string[] | null = null;

      for await (const event of eventStream) {
        const nodeName = Object.keys(event)[0];
        if (!nodeName) continue;

        const nodeOutput = (event as Record<string, NodeOutput>)[nodeName] ?? {};
        const update = toStreamUpdate(nodeName, nodeOutput);

        if (update.tasks) latestTasks = update.tasks;
        if (update.loopCount != null) latestLoopCount = update.loopCount;
        if (update.isValid != null) latestIsValid = update.isValid;
        if (update.validationErrors) latestErrors = update.validationErrors;

        console.log('[action] graph node update', {
          node: nodeName,
          loopCount: update.loopCount,
          isValid: update.isValid,
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
        message: 'Graph completed successfully',
      });
    } catch (error) {
      console.error('[action] Error in graph Server Action:', error);
      stream.error(error);
    }
  })();

  return { output: stream.value };
}
