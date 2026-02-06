// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\watchers\taskWatcher.ts
import * as vscode from "vscode";
import { SessionManager } from "../core/sessionManager";

export class TaskWatcher {
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly sessions: SessionManager) {}

  public activate(): void {
    // Hook task start events
    const onTaskStart = vscode.tasks.onDidStartTaskProcess((event) => {
      this.handleTaskStart(event);
    });

    // Hook task end events  
    const onTaskEnd = vscode.tasks.onDidEndTaskProcess((event) => {
      this.handleTaskEnd(event);
    });

    this.disposables.push(onTaskStart, onTaskEnd);
  }

  private handleTaskStart(event: vscode.TaskProcessStartEvent): void {
    try {
      const task = event.execution.task;
      const taskName = this.extractTaskName(task);

      this.sessions.log("TASK_START", {
        task_name: taskName,
        task_source: task.source,
        execution_id: event.execution.task.name || undefined
      });

    } catch (error) {
      // Log errors but don't fail
      console.warn("Failed to log task start:", error);
    }
  }

  private handleTaskEnd(event: vscode.TaskProcessEndEvent): void {
    try {
      const task = event.execution.task;
      const taskName = this.extractTaskName(task);

      this.sessions.log("TASK_END", {
        task_name: taskName,
        task_source: task.source,
        execution_id: event.execution.task.name || undefined,
        exit_code: event.exitCode
      });

    } catch (error) {
      // Log errors but don't fail
      console.warn("Failed to log task end:", error);
    }
  }

  private extractTaskName(task: vscode.Task): string {
    // Try to get a meaningful task name
    if (task.name) {
      return task.name;
    }
    
    if (task.definition?.type) {
      return `${task.definition.type}`;
    }

    return "unknown";
  }

  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}