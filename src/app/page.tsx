'use client';

import { readStreamableValue } from '@ai-sdk/rsc';
import { useState } from 'react';

import { startAgentWorkflow } from './actions/agent';
import type { AgentStreamUpdate, Task } from '@/lib/agent/types';

type LogStep = AgentStreamUpdate & {
  node: string;
};

export default function AgentUiTest() {
  const [input, setInput] = useState(
    'Build an MVP e-commerce store on Next.js',
  );
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<LogStep[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setLogs([]);
    setError(null);

    try {
      const { output } = await startAgentWorkflow(input);

      for await (const delta of readStreamableValue(output)) {
        if (delta?.node) {
          setLogs(prev => [...prev, delta as LogStep]);
        }
      }
    } catch (err) {
      console.error('Error reading stream:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 font-sans text-slate-800">
      <h1 className="text-2xl font-bold mb-6 text-slate-800">
        Agent Graph Testing (UI)
      </h1>

      <form onSubmit={handleSubmit} className="mb-8 flex gap-4">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isLoading}
          className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 bg-white"
          placeholder="Enter a business goal..."
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition"
        >
          {isLoading ? 'Agent is thinking...' : 'Run AI'}
        </button>
      </form>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {isLoading && logs.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8 animate-pulse">
            Graph is starting, waiting for the first node…
          </p>
        )}

        {logs.map((log, index) => (
          <div
            key={`${log.node}-${index}`}
            className="p-4 border rounded-xl bg-slate-50 border-slate-200 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="px-2 py-1 text-xs font-bold uppercase tracking-wider rounded bg-indigo-100 text-indigo-800">
                Node: {log.node}
              </span>
              <span className="text-xs text-slate-400">Step #{index + 1}</span>
              {log.loopCount != null && (
                <span className="text-xs text-slate-400">
                  Iteration: {log.loopCount}
                </span>
              )}
              {log.status === 'completed' && (
                <span className="text-xs px-2 py-0.5 font-semibold bg-emerald-100 text-emerald-800 rounded">
                  completed
                </span>
              )}
            </div>

            {log.message && (
              <p className="text-sm text-slate-600 mb-2">{log.message}</p>
            )}

            {log.node === 'planner' && log.tasks && log.tasks.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">
                  Planner generated {log.tasks.length} tasks:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                  {log.tasks.map((t: Task, taskIndex) => (
                    <li key={`${t.title}-${taskIndex}`}>
                      <strong>{t.title}</strong> — {t.description}{' '}
                      <span className="text-slate-400">[{t.priority}]</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {log.node === 'validator' && (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">
                    Validation result:
                  </span>
                  {log.isValid ? (
                    <span className="text-xs px-2 py-0.5 font-semibold bg-emerald-100 text-emerald-800 rounded">
                      Plan approved
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 font-semibold bg-rose-100 text-rose-800 rounded">
                      Rejected for revision
                    </span>
                  )}
                </div>
                {!log.isValid &&
                  log.validationErrors &&
                  log.validationErrors.length > 0 && (
                    <div className="mt-2 bg-rose-50 border border-rose-100 p-2 rounded text-xs text-rose-700">
                      <strong>Validator errors:</strong>
                      <ul className="list-disc pl-4 mt-1">
                        {log.validationErrors.map((err, i) => (
                          <li key={`${i}-${err.slice(0, 24)}`}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            )}

            {log.node === 'end' && log.tasks && log.tasks.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-semibold text-slate-700 mb-2">
                  Final plan ({log.tasks.length}):
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                  {log.tasks.map((t: Task, taskIndex) => (
                    <li key={`final-${t.title}-${taskIndex}`}>
                      <strong>{t.title}</strong> — {t.description}{' '}
                      <span className="text-slate-400">[{t.priority}]</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        {logs.length === 0 && !isLoading && (
          <p className="text-center text-sm text-slate-400 py-12 border-2 border-dashed border-slate-200 rounded-xl">
            Enter a goal and click &quot;Run AI&quot; to watch the cyclic graph
            work
          </p>
        )}
      </div>
    </div>
  );
}
