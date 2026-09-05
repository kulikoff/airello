import type { Task } from '@/lib/agent/types';

export function KanbanBoard({ tasks }: { tasks: Task[] }) {
  const columns: { id: NonNullable<Task['status']>; label: string; color: string }[] =
    [
      {
        id: 'todo',
        label: 'To Do',
        color: 'border-t-slate-500 bg-slate-900/50',
      },
      {
        id: 'in_progress',
        label: 'In Progress / Engineering',
        color: 'border-t-cyan-500 bg-cyan-950/10',
      },
      {
        id: 'done',
        label: 'Completed / Verified',
        color: 'border-t-emerald-500 bg-emerald-950/10',
      },
    ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {columns.map(col => {
        const filteredTasks = tasks.filter(
          t => (t.status ?? 'todo') === col.id,
        );

        return (
          <div
            key={col.id}
            className={`rounded-xl border border-slate-800 border-t-4 p-4 min-h-[400px] ${col.color}`}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-sm tracking-wide text-slate-300 uppercase">
                {col.label}
              </h3>
              <span className="bg-slate-800 text-xs px-2.5 py-0.5 rounded-full text-slate-400 font-mono">
                {filteredTasks.length}
              </span>
            </div>

            <div className="space-y-3">
              {filteredTasks.map((task, index) => (
                <div
                  key={task.id || index}
                  className="bg-slate-950 border border-slate-800 p-4 rounded-lg shadow-sm hover:border-slate-700 transition duration-150"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] uppercase font-extrabold px-2 py-0.5 rounded ${
                        task.priority === 'high'
                          ? 'bg-red-950 text-red-400 border border-red-900'
                          : task.priority === 'medium'
                            ? 'bg-amber-950 text-amber-400 border border-amber-900'
                            : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {task.priority ?? 'medium'}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      @{task.assignee}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-200 line-clamp-2">
                    {task.title}
                  </p>
                </div>
              ))}

              {filteredTasks.length === 0 && (
                <div className="border border-dashed border-slate-800 rounded-lg p-8 text-center text-xs text-slate-600">
                  No tasks assigned here yet
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
