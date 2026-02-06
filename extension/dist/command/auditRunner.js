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
exports.AuditCommandRunner = void 0;
exports.registerAuditCommands = registerAuditCommands;
// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\command\auditRunner.ts
const vscode = __importStar(require("vscode"));
const auditPty_1 = require("../terminal/auditPty");
class AuditCommandRunner {
    sessions;
    constructor(sessions) {
        this.sessions = sessions;
    }
    async runWithAudit() {
        if (!this.sessions.isActive()) {
            vscode.window.showWarningMessage("NGKs session not active. Start logging first.");
            return;
        }
        // Prompt user for command
        const command = await vscode.window.showInputBox({
            prompt: "Enter command to run with audit",
            placeHolder: "e.g., node -v, git --version, ls -la",
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return "Command cannot be empty";
                }
                return null;
            }
        });
        if (!command) {
            return; // User cancelled
        }
        try {
            // Get workspace root for execution context
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const workspaceRoot = workspaceFolder?.uri.fsPath;
            // Create or show audit terminal
            const terminal = auditPty_1.AuditTerminalProvider.createOrShowAuditTerminal(this.sessions, workspaceRoot);
            // Execute command through PTY
            await auditPty_1.AuditTerminalProvider.executeCommand(command.trim(), workspaceRoot);
            vscode.window.setStatusBarMessage("Command executed with audit logging", 3000);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to execute audited command: ${errorMessage}`);
        }
    }
    dispose() {
        auditPty_1.AuditTerminalProvider.dispose();
    }
}
exports.AuditCommandRunner = AuditCommandRunner;
function registerAuditCommands(context, sessions) {
    const auditRunner = new AuditCommandRunner(sessions);
    // Register the "Run with Audit" command
    const runWithAuditCommand = vscode.commands.registerCommand("ngksAutologger.runWithAudit", () => auditRunner.runWithAudit());
    context.subscriptions.push(runWithAuditCommand);
    context.subscriptions.push(auditRunner);
}
//# sourceMappingURL=auditRunner.js.map