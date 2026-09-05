'use client';

import { readStreamableValue } from '@ai-sdk/rsc';
import { useState } from 'react';

import {
  runAgenticWorkflow,
  type StreamChunk,
} from '@/app/actions/agent';
import { KanbanBoard } from '@/components/KanbanBoard';

export default function AgentDashboard() {
  const [goal, setGoal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentUpdate, setCurrentUpdate] = useState<StreamChunk | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim() || isLoading) return;

    setIsLoading(true);
    setCurrentUpdate(null);
    setError(null);

    try {
      // 1. Trigger our Server Action
      const { output } = await runAgenticWorkflow(goal);

      // 2. Consume the streamable values line by line
      for await (const chunk of readStreamableValue(output)) {
        if (chunk) {
          setCurrentUpdate(chunk);
        }
      }
    } catch (err) {
      console.error('Streaming failed:', err);
      setError(err instanceof Error ? err.message : 'Streaming failed');
    } finally {
      setIsLoading(false);
    }
  };

  const pulseClass =
    currentUpdate?.status === 'thinking'
      ? 'bg-amber-400'
      : currentUpdate?.status === 'verifying'
        ? 'bg-purple-500'
        : currentUpdate?.status === 'failed'
          ? 'bg-rose-500'
          : 'bg-emerald-400';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="border-b border-slate-800 pb-4">
          <h1 className="text-3xl font-black bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent">
            Autonomous AI Project Manager
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Sprint 2: Real-time Agentic Loop Live Stream
          </p>
        </header>

        {/* Input Bar */}
        <form
          onSubmit={handleSubmit}
          className="flex gap-4 bg-slate-800 p-4 rounded-xl border border-slate-700"
        >
          <input
            type="text"
            value={goal}
            onChange={e => setGoal(e.target.value)}
            disabled={isLoading}
            placeholder="e.g., Build a microservices-based SaaS e-commerce site with high load protection..."
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !goal.trim()}
            className="bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-600 hover:to-indigo-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg disabled:opacity-50 transition-all duration-200"
          >
            {isLoading ? 'Processing Loop...' : 'Generate Roadmap'}
          </button>
        </form>

        {error && (
          <div className="bg-red-950/50 border border-red-900 text-red-300 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Status Tracker Sub-component */}
        {currentUpdate && (
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <span
                className={`h-3 w-3 rounded-full ${isLoading ? 'animate-pulse' : ''} ${pulseClass}`}
              />
              <div>
                <p className="text-sm font-medium capitalize">
                  Current Status:{' '}
                  <span className="font-bold text-cyan-400">
                    {currentUpdate.status}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  Active Node: {currentUpdate.activeNode.toUpperCase()} | Loop
                  Turn: {currentUpdate.loopCount}/3
                </p>
                {currentUpdate.reasoning && (
                  <p className="mt-1 text-xs text-slate-400 italic max-w-2xl">
                    {currentUpdate.reasoning}
                  </p>
                )}
              </div>
            </div>

            {/* Validation Error Feedback Banner */}
            {currentUpdate.validationErrors.length > 0 && (
              <div className="bg-red-950/50 border border-red-900 text-red-400 px-4 py-2 rounded-lg text-xs max-w-md">
                <span className="font-bold block mb-1">
                  Validator Corrections Triggered:
                </span>
                <ul className="list-disc pl-4 space-y-0.5">
                  {currentUpdate.validationErrors.map((err, i) => (
                    <li key={`${i}-${err.slice(0, 24)}`}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Kanban Canvas rendering the stream state array directly */}
        {currentUpdate && <KanbanBoard tasks={currentUpdate.tasks} />}

        {!currentUpdate && !isLoading && (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-6 py-16 text-center text-sm text-slate-500">
            Enter a business goal and click &quot;Generate Roadmap&quot; to
            watch Planner → Validator stream into the Kanban board.
          </div>
        )}
      </div>
    </div>
  );
}
