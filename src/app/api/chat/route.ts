import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  UIMessage,
} from 'ai';

// Позволяет серверу обрабатывать долгие ответы от ИИ (до 30 секунд)
export const maxDuration = 30;

const MODEL_ID = 'xai/grok-4.6';

function lastUserText(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return '(no user message)';
  return lastUser.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('')
    .slice(0, 200);
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    // TEMP logging — remove when debugging is done
    console.log('[chat] incoming request', {
      messageCount: messages.length,
      lastUserText: lastUserText(messages),
      roles: messages.map(m => m.role),
    });

    const modelMessages = await convertToModelMessages(messages);

    console.log('[chat] starting outgoing AI request', {
      model: MODEL_ID,
      modelMessageCount: modelMessages.length,
      elapsedMs: Date.now() - startedAt,
    });

    const result = streamText({
      model: MODEL_ID,
      messages: modelMessages,
      onStart: ({ modelId }) => {
        console.log('[chat] AI request started (waiting for response…)', {
          modelId,
          elapsedMs: Date.now() - startedAt,
        });
      },
      onFinish: ({ text, finishReason, usage }) => {
        console.log('[chat] AI response finished', {
          finishReason,
          usage,
          textPreview: text.slice(0, 300),
          elapsedMs: Date.now() - startedAt,
        });
      },
      onError: ({ error }) => {
        console.error('[chat] AI stream error', {
          error,
          elapsedMs: Date.now() - startedAt,
        });
      },
    });

    console.log('[chat] returning stream response to client (still waiting on AI…)', {
      elapsedMs: Date.now() - startedAt,
    });

    // AI SDK v7: toDataStreamResponse удалён — нужен UI message stream
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
    console.error('[chat] backend error', {
      error,
      elapsedMs: Date.now() - startedAt,
    });
    const message =
      error instanceof Error ? error.message : 'Внутренняя ошибка сервера';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
