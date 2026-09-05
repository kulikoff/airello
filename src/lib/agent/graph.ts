import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { generateObject, generateText, isStepCount } from 'ai';
import { z } from 'zod';

import { taskManagerTools } from './tools';
import { MAX_ITERATIONS, MODEL_ID, type Task } from './types';

// Structured DeepSeek audit report — forces precise LangGraph routing inputs
export const AuditReportSchema = z.object({
  isValid: z
    .boolean()
    .describe(
      'Set to true ONLY if the tasks comprehensively and realistically achieve the business goal.',
    ),
  errors: z
    .array(z.string())
    .describe(
      'List of clear, actionable errors or gaps if isValid is false. Empty array if true.',
    ),
  reasoning: z
    .string()
    .describe(
      'A brief internal justification of why the plan is valid or invalid.',
    ),
});

// Shared memory (State) for the agent graph
export const AgentState = Annotation.Root({
  businessGoal: Annotation<string>(),
  tasks: Annotation<Task[]>(),
  isValid: Annotation<boolean>(),
  validationErrors: Annotation<string[]>(),
  loopCount: Annotation<number>(),
  auditReasoning: Annotation<string>(),
});

export type AgentStateType = typeof AgentState.State;

export type CreateAgentGraphOptions = {
  startedAt?: number;
};

export function routeAfterValidation(state: AgentStateType) {
  // If the validator confirmed the plan, terminate the graph loop safely
  if (state.isValid) {
    console.log('--- ROUTING: END (Plan is verified!) ---');
    return END;
  }

  // Fallback protection against infinite looping if model hits a wall
  if ((state.loopCount ?? 0) >= MAX_ITERATIONS) {
    console.log(
      '--- ROUTING: END (Max loop iterations reached, exiting safely) ---',
    );
    return END;
  }

  // Route back to the planner with state.validationErrors populated
  console.log(
    `--- ROUTING: BACK TO PLANNER (Loop turn ${state.loopCount}/${MAX_ITERATIONS}) ---`,
  );
  return 'planner';
}

export function createAgentGraph(options: CreateAgentGraphOptions = {}) {
  const startedAt = options.startedAt ?? Date.now();

  const plannerNode = async (state: AgentStateType) => {
    const nextLoopCount = (state.loopCount || 0) + 1;
    const previousErrors = (state.validationErrors ?? []).join('\n');
    const existingTasks = JSON.stringify(state.tasks ?? []);

    console.log('--- START PLANNER NODE ---', {
      loopCount: nextLoopCount,
      errorCount: state.validationErrors?.length ?? 0,
      existingTaskCount: state.tasks?.length ?? 0,
      elapsedMs: Date.now() - startedAt,
    });

    const systemPrompt = `You are an autonomous AI Project Manager. Your job is to break down a global goal into tactical tasks.
Current Goal: "${state.businessGoal}".
Already created tasks: ${existingTasks}.
Validator errors to fix (if any): ${previousErrors || '(none)'}.
Use the 'createTask' tool to create 3-5 concrete tasks that cover the goal.
If validator feedback exists, rebuild the plan to address those issues (create a corrected full set of tasks).
Assign each task a realistic development role in the assignee field.`;

    const response = await generateText({
      model: MODEL_ID,
      system: systemPrompt,
      prompt: `Break down this project goal into tasks using createTask: ${state.businessGoal}`,
      tools: taskManagerTools,
      stopWhen: isStepCount(5),
    });

    const createdTasks: Task[] = [];

    for (const result of response.toolResults) {
      if (result.toolName !== 'createTask') continue;

      const output = result.output as {
        success?: boolean;
        task?: Task;
      };

      if (output?.success && output.task) {
        createdTasks.push(output.task);
        console.log('[agent] planner tool result createTask', {
          id: output.task.id,
          title: output.task.title,
          assignee: output.task.assignee,
          priority: output.task.priority,
        });
      }
    }

    const updatedTasks =
      createdTasks.length > 0 ? createdTasks : (state.tasks ?? []);

    console.log('[agent] planner finish', {
      loopCount: nextLoopCount,
      toolCallCount: response.toolCalls.length,
      taskCount: updatedTasks.length,
      titles: updatedTasks.map(t => t.title),
      elapsedMs: Date.now() - startedAt,
    });

    return {
      tasks: updatedTasks,
      loopCount: nextLoopCount,
      // Wipe past errors — a new planning turn has processed adjustments
      validationErrors: [] as string[],
      isValid: false,
      auditReasoning: '',
    };
  };

  const validatorNode = async (state: AgentStateType) => {
    console.log('--- START VALIDATOR NODE (DEEPSEEK-V4-FLASH) ---', {
      loopCount: state.loopCount,
      taskCount: state.tasks?.length ?? 0,
      elapsedMs: Date.now() - startedAt,
    });

    // If the planner completely failed to generate tasks, immediately reject it
    if (!state.tasks || state.tasks.length === 0) {
      const validationErrors = [
        'The PlannerNode did not create any tasks. A project plan cannot be empty.',
      ];
      console.log('[VALIDATOR AUDIT] Valid: false | Errors Found: 1');
      console.log('[VALIDATOR ERRORS]:', validationErrors);

      return {
        isValid: false,
        validationErrors,
        auditReasoning: 'Empty task list — plan rejected without LLM audit.',
      };
    }

    const systemPrompt = `You are a strict QA Senior Project Manager auditing an AI Agentic loop.
Your task is to analyze the generated list of engineering tasks against the user's high-level business goal.

User's Business Goal: "${state.businessGoal}"
Current Generated Tasks: ${JSON.stringify(state.tasks)}

CRITERIA FOR ACCEPTANCE:
1. Completeness: Do these tasks completely build the requested product? (e.g., if it's a website, is there a database, frontend, and deployment task?)
2. Clarity: Are task titles explicit? (Reject vague tasks like "do coding" or "fix stuff").
3. Distribution: Are roles/assignees logical for a technical stack?

Analyze deeply. If the plan fails any criteria, mark isValid as false and list explicit, actionable changes the planner must perform.`;

    const response = await generateObject({
      model: MODEL_ID,
      schema: AuditReportSchema,
      prompt: systemPrompt,
    });

    const audit = response.object;

    console.log(
      `[VALIDATOR AUDIT] Valid: ${audit.isValid} | Errors Found: ${audit.errors.length}`,
    );
    if (!audit.isValid) {
      console.log('[VALIDATOR ERRORS]:', audit.errors);
    }
    console.log('[VALIDATOR REASONING]:', audit.reasoning);

    return {
      isValid: audit.isValid,
      validationErrors: audit.errors,
      auditReasoning: audit.reasoning,
    };
  };

  return new StateGraph(AgentState)
    .addNode('planner', plannerNode)
    .addNode('validator', validatorNode)
    .addEdge(START, 'planner')
    .addEdge('planner', 'validator')
    .addConditionalEdges('validator', routeAfterValidation, {
      planner: 'planner',
      [END]: END,
    })
    .compile();
}

/** Default compiled graph (for Server Action / stream). */
export const workflow = createAgentGraph();
