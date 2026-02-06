"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskWatcher = void 0;
// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\watchers\taskWatcher.ts
const vscode = __importStar(require("vscode"));
class TaskWatcher {
    sessions;
    disposables = [];
    constructor(sessions) {
        this.sessions = sessions;
    }
    activate() {
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
    handleTaskStart(event) {
        try {
            const task = event.execution.task;
            const taskName = this.extractTaskName(task);
            this.sessions.log("TASK_START", {
                task_name: taskName,
                task_source: task.source,
                execution_id: event.execution.task.name || undefined
            });
        }
        catch (error) {
            // Log errors but don't fail
            console.warn("Failed to log task start:", error);
        }
    }
    handleTaskEnd(event) {
        try {
            const task = event.execution.task;
            const taskName = this.extractTaskName(task);
            this.sessions.log("TASK_END", {
                task_name: taskName,
                task_source: task.source,
                execution_id: event.execution.task.name || undefined,
                exit_code: event.exitCode
            });
        }
        catch (error) {
            // Log errors but don't fail
            console.warn("Failed to log task end:", error);
        }
    }
    extractTaskName(task) {
        // Try to get a meaningful task name
        if (task.name) {
            return task.name;
        }
        if (task.definition?.type) {
            return `${task.definition.type}`;
        }
        return "unknown";
    }
    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
exports.TaskWatcher = TaskWatcher;
//# sourceMappingURL=taskWatcher.js.map