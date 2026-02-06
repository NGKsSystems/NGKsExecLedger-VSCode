// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\watchers\taskWatcher.ts
import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";
import { SessionManager } from "../core/sessionManager";

interface ActiveTaskExecution {
  task: vscode.Task;
  startTime: Date;
  execution_id: string;
  taskStartLogged: boolean; // De-dupe flag
}

export class TaskWatcher {
  // Use task execution hash for better uniqueness than just task.name
  private activeTasks = new Map<string, ActiveTaskExecution>();

  constructor(
    private sessionManager: SessionManager,
  ) {
    this.registerListeners();
  }

  private registerListeners() {
    // Listen for task starts
    vscode.tasks.onDidStartTaskProcess((event) => {
      this.onTaskStart(event);
    });

    // Listen for task ends
    vscode.tasks.onDidEndTaskProcess((event) => {
      this.onTaskEnd(event);
    });
  }

  private onTaskStart(event: vscode.TaskProcessStartEvent) {
    const task = event.execution.task;
    const taskKey = this.getTaskKey(task, event.execution);
    
    // Check for duplicate start events
    const existingExecution = this.activeTasks.get(taskKey);
    if (existingExecution && existingExecution.taskStartLogged) {
      // Duplicate start event - do not log again
      console.warn(`Duplicate TASK_START for task: ${task.name}, key: ${taskKey}`);
      return;
    }
    
    const execution_id = existingExecution?.execution_id || uuidv4();
    const startTime = existingExecution?.startTime || new Date();

    // Store/update execution mapping
    this.activeTasks.set(taskKey, {
      task,
      startTime,
      execution_id,
      taskStartLogged: true
    });

    // Log TASK_START event
    this.sessionManager.log("TASK_START", {
      task_name: task.name,
      source: task.source,
      scope: (task.scope as vscode.WorkspaceFolder)?.name || "unknown",
      execution_id,
      ts_start: startTime.toISOString(),
    });
  }

  private onTaskEnd(event: vscode.TaskProcessEndEvent) {
    const task = event.execution.task;
    const taskKey = this.getTaskKey(task, event.execution);
    const mapping = this.activeTasks.get(taskKey);
    
    let execution_id: string;
    let duration_ms: number;
    let endReason: string | undefined = undefined;
    
    if (!mapping) {
      // TASK_END without corresponding TASK_START
      execution_id = uuidv4();
      duration_ms = 0; // Unknown duration
      endReason = "end_without_start";
      console.warn(`TASK_END without start for task: ${task.name}, key: ${taskKey}`);
    } else {
      // Normal case: matching start found
      execution_id = mapping.execution_id;
      duration_ms = Date.now() - mapping.startTime.getTime();
      
      // Remove from active tracking
      this.activeTasks.delete(taskKey);
    }

    // Determine exit code and end reason
    let exit_code: number | null = event.exitCode ?? null;
    if (exit_code === undefined || exit_code === null) {
      if (!endReason) {
        endReason = "unknown_or_cancelled";
      }
    }

    // Log TASK_END event
    const logPayload: any = {
      execution_id,
      exit_code,
      duration_ms
    };

    if (endReason) {
      logPayload.end_reason = endReason;
    }

    this.sessionManager.log("TASK_END", logPayload);
  }

  /**
   * Generate a unique key for task execution correlation.
   * Uses combination of task properties and execution info for better uniqueness.
   */
  private getTaskKey(task: vscode.Task, execution: vscode.TaskExecution): string {
    const taskName = task.name || "unnamed";
    const taskSource = task.source || "unknown";
    const scopeName = (task.scope as vscode.WorkspaceFolder)?.name || "global";
    
    // Include execution timestamp or process ID if available for uniqueness
    const executionId = (execution as any).id || Date.now();
    
    return `${taskSource}:${scopeName}:${taskName}:${executionId}`;
  }

  dispose() {
    this.activeTasks.clear();
  }
}