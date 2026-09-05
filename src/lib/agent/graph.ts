import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { generateObject } from 'ai';
import { z } from 'zod';

import { MAX_ITERATIONS, MODEL_ID, taskSchema, type Task } from './types';

// Shared memory (State) for the agent graph
export const AgentState = Annotation.Root({
  userPrompt: Annotation<string>(),
  tasks: Annotation<Task[]>(),
  validationFeedback: Annotation<string>(),
  iterations: Annotation<number>(),
});

export type AgentStateType = typeof AgentState.State;

export type CreateAgentGraphOptions = {
  startedAt?: number;
};

export function createAgentGraph(options: CreateAgentGraphOptions = {}) {
  const startedAt = options.startedAt ?? Date.now();

  const plannerNode = async (state: AgentStateType) => {
    const currentIterations = state.iterations || 0;
    const nextIteration = currentIterations + 1;

    console.log('[agent] planner start', {
      iteration: nextIteration,
      hasFeedback: Boolean(state.validationFeedback),
      feedbackPreview: state.validationFeedback?.slice(0, 200) || '',
      elapsedMs: Date.now() - startedAt,
    });

    let systemPrompt =
      'You are an experienced Project Manager. Your job is to break the user goal into 3-5 concrete subtasks.';
    if (state.validationFeedback) {
      systemPrompt += `\nAttention! Your previous plan was rejected with this feedback: "${state.validationFeedback}". Fix the issues and redo the task plan.`;
    }

    const { object } = await generateObject({
      model: MODEL_ID,
      system: systemPrompt,
      prompt: `Project goal: ${state.userPrompt}`,
      schema: z.object({
        tasks: z.array(taskSchema),
      }),
    });

    console.log('[agent] planner finish', {
      iteration: nextIteration,
      taskCount: object.tasks.length,
      titles: object.tasks.map(t => t.title),
      elapsedMs: Date.now() - startedAt,
    });

    return {
      tasks: object.tasks,
      iterations: nextIteration,
    };
  };

  const validatorNode = async (state: AgentStateType) => {
    console.log('[agent] validator start', {
      iteration: state.iterations,
      taskCount: state.tasks?.length ?? 0,
      elapsedMs: Date.now() - startedAt,
    });

    const { object } = await generateObject({
      model: MODEL_ID,
      system:
        'You are a strict Technical Director (CTO). Review the PM task list for realism and completeness. If task descriptions are too vague, priorities are missing, or deadlines/urgency are unclear — reject the plan.',
      prompt: `Original goal: ${state.userPrompt}\nGenerated task plan: ${JSON.stringify(state.tasks)}`,
      schema: z.object({
        isValid: z
          .boolean()
          .describe('true if the plan is ideal; false if it needs revision'),
        feedback: z
          .string()
          .describe(
            'Detailed explanation of why the plan was rejected, or an empty string if everything is fine',
          ),
      }),
    });

    console.log('[agent] validator finish', {
      iteration: state.iterations,
      isValid: object.isValid,
      feedbackPreview: object.isValid ? '' : object.feedback.slice(0, 300),
      elapsedMs: Date.now() - startedAt,
    });

    return {
      validationFeedback: object.isValid ? '' : object.feedback,
    };
  };

  return new StateGraph(AgentState)
    .addNode('planner', plannerNode)
    .addNode('validator', validatorNode)
    .addEdge(START, 'planner')
    .addEdge('planner', 'validator')
    .addConditionalEdges(
      'validator',
      (state: AgentStateType) => {
        if ((state.iterations ?? 0) >= MAX_ITERATIONS) {
          console.log('[agent] route → end (max iterations)', {
            iterations: state.iterations,
            elapsedMs: Date.now() - startedAt,
          });
          return END;
        }

        if (state.validationFeedback) {
          console.log('[agent] route → planner (rewrite)', {
            iterations: state.iterations,
            feedbackPreview: state.validationFeedback.slice(0, 300),
            elapsedMs: Date.now() - startedAt,
          });
          return 'planner';
        }

        console.log('[agent] route → end (plan approved)', {
          iterations: state.iterations,
          taskCount: state.tasks?.length ?? 0,
          elapsedMs: Date.now() - startedAt,
        });
        return END;
      },
      {
        planner: 'planner',
        [END]: END,
      },
    )
    .compile();
}

/** Default compiled graph (for Server Action / stream). */
export const workflow = createAgentGraph();
