import { tool } from 'ai';
import { z } from 'zod';

// Task structure schema for the mock task-manager API
export const TaskSchema = z.object({
  id: z.string().optional(),
  title: z
    .string()
    .describe('The title of the task, e.g., "Configure Supabase db"'),
  status: z.enum(['todo', 'in_progress', 'done']).default('todo'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  assignee: z
    .string()
    .describe('The assigned development role, e.g., "Backend Engineer"'),
});

export type ManagedTask = z.infer<typeof TaskSchema>;

const createTaskInputSchema = z.object({
  id: z.string().optional(),
  title: z
    .string()
    .describe('The title of the task, e.g., "Configure Supabase db"'),
  status: z.enum(['todo', 'in_progress', 'done']).optional().default('todo'),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  assignee: z
    .string()
    .describe('The assigned development role, e.g., "Backend Engineer"'),
});

const updateTaskStatusInputSchema = z.object({
  id: z.string().describe('Unique task identifier ID'),
  status: z.enum(['todo', 'in_progress', 'done']),
});

// Export tools for the AI agent (AI SDK v7 declarative tool() API)
export const taskManagerTools = {
  createTask: tool({
    description: 'Creates a new project task based on requirements.',
    inputSchema: createTaskInputSchema,
    execute: async task => {
      // Simulate database latency
      await new Promise(resolve => setTimeout(resolve, 300));
      const mockId =
        task.id ?? `task_${Math.random().toString(36).slice(2, 11)}`;
      console.log(`[API LOG] Task created: ${task.title} (ID: ${mockId})`);
      return {
        success: true as const,
        task: {
          ...task,
          id: mockId,
          status: task.status ?? 'todo',
          priority: task.priority ?? 'medium',
        },
      };
    },
  }),
  updateTaskStatus: tool({
    description: 'Updates the status of an existing task.',
    inputSchema: updateTaskStatusInputSchema,
    execute: async ({ id, status }) => {
      console.log(`[API LOG] Task ${id} status updated to ${status}`);
      return { success: true as const, id, updatedStatus: status };
    },
  }),
};

export type TaskManagerTools = typeof taskManagerTools;
