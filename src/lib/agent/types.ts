import { z } from 'zod';

export const MODEL_ID = 'xai/grok-4.6';
export const MAX_ITERATIONS = 3;

export const taskSchema = z.object({
  title: z.string().describe('Subtask title'),
  description: z.string().describe('What specifically needs to be done'),
  priority: z.enum(['low', 'medium', 'high']),
});

export type Task = z.infer<typeof taskSchema>;

export type AgentStreamUpdate = {
  status?: 'running' | 'completed' | 'error';
  node: string | null;
  tasks: Task[] | null;
  isValid: boolean | null;
  validationErrors: string[] | null;
  loopCount: number | null;
  message?: string;
};
