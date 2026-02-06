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

export type AnyEvent = BaseEvent & { payload?: unknown };
