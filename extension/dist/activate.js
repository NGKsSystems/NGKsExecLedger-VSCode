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
exports.activateExtension = activateExtension;
// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\activate.ts
const vscode = __importStar(require("vscode"));
const statusBarToggle_1 = require("./ui/statusBarToggle");
const agentBridgePanel_1 = require("./bridge/agentBridgePanel");
const agentBridgeCommands_1 = require("./bridge/agentBridgeCommands");
async function activateExtension(context, sessions) {
    const cfg = vscode.workspace.getConfiguration("ngksAutologger");
    const enabled = !!cfg.get("enabled");
    // Create status bar toggle
    const statusBarToggle = new statusBarToggle_1.StatusBarToggle(sessions);
    context.subscriptions.push(statusBarToggle);
    // Register agent bridge panel (Explorer view)
    const agentBridgeProvider = new agentBridgePanel_1.AgentBridgePanel(context.extensionUri, sessions);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(agentBridgePanel_1.AgentBridgePanel.viewType, agentBridgeProvider));
    // Register agent bridge commands (open/focus)
    (0, agentBridgeCommands_1.registerAgentBridgeCommands)(context);
    // Commands (manual control)
    context.subscriptions.push(vscode.commands.registerCommand("ngksAutologger.startSession", () => {
        sessions.start(context);
        statusBarToggle.render();
        vscode.window.setStatusBarMessage("NGKs Log: ACTIVE", 2500);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("ngksAutologger.stopSession", () => {
        sessions.stop("manual_stop");
        statusBarToggle.render();
        vscode.window.setStatusBarMessage("NGKs Log: STOPPED", 2500);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("ngksAutologger.toggle", () => {
        if (sessions.isActive()) {
            sessions.stop("manual_stop");
            vscode.window.setStatusBarMessage("NGKs Log: STOPPED", 2500);
        }
        else {
            sessions.start(context);
            vscode.window.setStatusBarMessage("NGKs Log: ACTIVE", 2500);
        }
        statusBarToggle.render();
    }));
    if (enabled) {
        sessions.start(context);
        statusBarToggle.render();
        vscode.window.setStatusBarMessage("NGKs Log: ACTIVE", 2500);
    }
}
//# sourceMappingURL=activate.js.map