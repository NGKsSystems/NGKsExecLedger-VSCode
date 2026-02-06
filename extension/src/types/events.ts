// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\types\events.ts
export type BaseEvent = {
  ts: string;                 // ISO timestamp
  level: "INFO" | "WARN" | "ERROR";
  type: string;               // e.g. SESSION_START
  session_id: string;
  seq: number;                // monotonically increasing
  prev_hash?: string;         // hash chain
  hash?: string;              // hash of this event
};

export type SessionStartEvent = BaseEvent & {
  type: "SESSION_START";
  payload: {
    workspaceName?: string;
    workspacePath?: string;
    vscodeVersion: string;
    platform: string;
    arch: string;
    logDirMode: "workspace" | "global";
  };
};

export type SessionEndEvent = BaseEvent & {
  type: "SESSION_END";
  payload: {
    reason: "normal_exit" | "error_exit" | "manual_stop";
    error?: { name?: string; message?: string; stack?: string };
    autosaved?: boolean;
    autosavePath?: string;
  };
};

export type AgentInputEvent = BaseEvent & {
  type: "AGENT_INPUT";
  payload: {
    text: string;
    context?: {
      activeFile?: string;
      selectionLength?: number;
    };
  };
};

export type AgentOutputEvent = BaseEvent & {
  type: "AGENT_OUTPUT";
  payload: {
    text: string;
    context?: {
      activeFile?: string;
      selectionLength?: number;
    };
  };
};

export type AuditCmdStartEvent = BaseEvent & {
  type: "AUDIT_CMD_START";
  payload: {
    cmd: string;
    cwd: string;
    terminal_id: string;
    request_id: string;
    ts_start: string;
  };
};

export type AuditCmdOutputEvent = BaseEvent & {
  type: "AUDIT_CMD_OUTPUT";
  payload: {
    request_id: string;
    stream: "stdout" | "stderr";
    chunk: string;
    chunk_index: number;
  };
};

export type AuditCmdEndEvent = BaseEvent & {
  type: "AUDIT_CMD_END";
  payload: {
    request_id: string;
    exit_code: number | null;
    signal?: string;
    duration_ms: number;
  };
};

export type TaskStartEvent = BaseEvent & {
  type: "TASK_START";
  payload: {
    task_name: string;
    task_source?: string;
    execution_id?: string;
  };
};

export type TaskEndEvent = BaseEvent & {
  type: "TASK_END";
  payload: {
    task_name: string;
    task_source?: string;
    execution_id?: string;
    exit_code?: number | null;
  };
};

export type DebugStartEvent = BaseEvent & {
  type: "DEBUG_START";
  payload: {
    session_name: string;
    type?: string;
    workspace_folder?: string;
  };
};

export type DebugEndEvent = BaseEvent & {
  type: "DEBUG_END";
  payload: {
    session_name: string;
    type?: string;
    workspace_folder?: string;
  };
};

export type AnyEvent = BaseEvent & { payload?: unknown };
