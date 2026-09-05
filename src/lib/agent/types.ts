import type { ManagedTask } from './tools';

export const MODEL_ID = 'deepseek-v4-flash';
export const MAX_ITERATIONS = 3;

/** Graph/UI task shape — produced by createTask tool calls. */
export type Task = ManagedTask;

export type AgentStreamUpdate = {
  status?: 'running' | 'completed' | 'error';
  node: string | null;
  tasks: Task[] | null;
  isValid: boolean | null;
  validationErrors: string[] | null;
  loopCount: number | null;
  message?: string;
  reasoning?: string | null;
};
