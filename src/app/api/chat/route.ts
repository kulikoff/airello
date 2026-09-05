import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  UIMessage,
} from 'ai';

import { createAgentGraph } from '@/lib/agent/graph';
import { MAX_ITERATIONS, MODEL_ID } from '@/lib/agent/types';

// Multiple LLM calls in the graph (planner/validator × iterations + final stream)
export const maxDuration = 120;

function lastUserText(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return '';
  return lastUser.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('')
    .trim();
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const { messages }: { messages: UIMessage[] } = await req.json();
    const businessGoal = lastUserText(messages);

    console.log('[chat] incoming request', {
      messageCount: messages.length,
      businessGoal: businessGoal.slice(0, 200),
      roles: messages.map(m => m.role),
    });

    if (!businessGoal) {
      return new Response(JSON.stringify({ error: 'Empty user request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('[agent] graph invoke start', {
      model: MODEL_ID,
      maxIterations: MAX_ITERATIONS,
      elapsedMs: Date.now() - startedAt,
    });

    const app = createAgentGraph({ startedAt });
    const finalState = await app.invoke({
      businessGoal,
      tasks: [],
      isValid: false,
      validationErrors: [],
      loopCount: 0,
      auditReasoning: '',
    });

    console.log('[agent] graph invoke finish', {
      loopCount: finalState.loopCount,
      taskCount: finalState.tasks?.length ?? 0,
      isValid: finalState.isValid,
      validationErrors: finalState.validationErrors,
      tasks: finalState.tasks,
      elapsedMs: Date.now() - startedAt,
    });

    console.log('[chat] starting final presentation stream', {
      elapsedMs: Date.now() - startedAt,
    });

    const result = streamText({
      model: MODEL_ID,
      system:
        'You are an AI project manager. Present the final, team-approved task plan to the user in clean Markdown.',
      prompt: `Original request: ${finalState.businessGoal}\nApproved tasks: ${JSON.stringify(finalState.tasks)}${
        !finalState.isValid && finalState.validationErrors?.length
          ? `\nNote: iteration limit reached; remaining validator errors: ${finalState.validationErrors.join('; ')}`
          : ''
      }`,
      onStart: ({ modelId }) => {
        console.log('[chat] presentation AI started (waiting…)', {
          modelId,
          elapsedMs: Date.now() - startedAt,
        });
      },
      onFinish: ({ text, finishReason, usage }) => {
        console.log('[chat] presentation AI finished', {
          finishReason,
          usage,
          textPreview: text.slice(0, 300),
          elapsedMs: Date.now() - startedAt,
        });
      },
      onError: ({ error }) => {
        console.error('[chat] presentation stream error', {
          error,
          elapsedMs: Date.now() - startedAt,
        });
      },
    });

    console.log('[chat] returning stream response to client', {
      elapsedMs: Date.now() - startedAt,
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        onFinish: ({ responseMessage }) => {
          const text = responseMessage.parts
            .filter(part => part.type === 'text')
            .map(part => part.text)
            .join('');
          console.log('[chat] UI stream finished / response delivered', {
            textPreview: text.slice(0, 300),
            elapsedMs: Date.now() - startedAt,
          });
        },
      }),
    });
  } catch (error: unknown) {
    console.error('[agent] backend error', {
      error,
      elapsedMs: Date.now() - startedAt,
    });
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
