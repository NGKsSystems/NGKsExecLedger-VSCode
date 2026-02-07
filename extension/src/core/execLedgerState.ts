/**
 * Task state machine
 */
export enum TaskState {
  READY = 'READY',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED_AUDIT_GAP = 'BLOCKED_AUDIT_GAP',
  SEALED = 'SEALED',
}

/**
 * Step state machine
 */
export enum StepState {
  GUIDANCE_CAPTURED = 'GUIDANCE_CAPTURED',
  AWAITING_PROOF = 'AWAITING_PROOF',
  VALIDATING = 'VALIDATING',
  COMPLIANT = 'COMPLIANT',
  NON_COMPLIANT = 'NON_COMPLIANT',
}

/**
 * Status bar indicator color
 */
export enum StatusIndicator {
  Green = 'Green',
  Yellow = 'Yellow',
  Red = 'Red',
  Blue = 'Blue',
}

/**
 * Context: current session/task/step pointers
 */
export interface ActiveContext {
  sessionId: string;
  sessionPath: string;
  taskId?: string;
  taskPath?: string;
  currentStep?: number;
  taskState: TaskState;
  stepState?: StepState;
}

/**
 * Session meta (persisted)
 */
export interface SessionMeta {
  id: string;
  timestamp: string;
  workspace: string;
  status: 'ACTIVE' | 'CLOSED';
  openedAt: string;
  closedAt?: string;
}

/**
 * Task meta (persisted)
 */
export interface TaskMeta {
  id: string;
  timestamp: string;
  name: string;
  state: TaskState;
  createdAt: string;
  sealedAt?: string;
  totalSteps: number;
}

/**
 * Ledger event (JSONL format)
 */
export interface LedgerEvent {
  ts: string;
  kind: 'TASK_OPENED' | 'GUIDANCE_ADDED' | 'PROOF_RECEIVED' | 'TASK_SEALED' | 'STEP_STATE_CHANGED';
  sessionId: string;
  taskId?: string;
  step?: number;
  payload: Record<string, unknown>;
}

/**
 * State transition validators (Phase 1)
 */
export function canTransitionTaskState(from: TaskState, to: TaskState): boolean {
  const allowed: Record<TaskState, TaskState[]> = {
    [TaskState.READY]: [TaskState.IN_PROGRESS],
    [TaskState.IN_PROGRESS]: [TaskState.BLOCKED_AUDIT_GAP, TaskState.SEALED],
    [TaskState.BLOCKED_AUDIT_GAP]: [TaskState.IN_PROGRESS, TaskState.SEALED],
    [TaskState.SEALED]: [],
  };
  return allowed[from]?.includes(to) ?? false;
}

export function canTransitionStepState(from: StepState | undefined, to: StepState): boolean {
  if (!from) {
    return to === StepState.GUIDANCE_CAPTURED;
  }
  const allowed: Record<StepState, StepState[]> = {
    [StepState.GUIDANCE_CAPTURED]: [StepState.AWAITING_PROOF],
    [StepState.AWAITING_PROOF]: [StepState.VALIDATING],
    [StepState.VALIDATING]: [StepState.COMPLIANT, StepState.NON_COMPLIANT],
    [StepState.COMPLIANT]: [],
    [StepState.NON_COMPLIANT]: [],
  };
  return allowed[from]?.includes(to) ?? false;
}
