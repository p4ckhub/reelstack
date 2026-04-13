export class AgentError extends Error {
  constructor(
    message: string,
    readonly phase: 'discovery' | 'planning' | 'generation' | 'assembly' | 'render',
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class PlanningError extends AgentError {
  constructor(message: string, cause?: unknown) {
    super(message, 'planning', cause);
    this.name = 'PlanningError';
  }
}

export class GenerationError extends AgentError {
  constructor(
    message: string,
    readonly toolId: string,
    cause?: unknown
  ) {
    super(message, 'generation', cause);
    this.name = 'GenerationError';
  }
}
