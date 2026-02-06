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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const sessionManager_1 = require("./core/sessionManager");
const activate_1 = require("./activate");
const deactivate_1 = require("./deactivate");
const crashGuard_1 = require("./core/crashGuard");
const sessions = new sessionManager_1.SessionManager();
let crashGuard = null;
async function activate(context) {
    // Hard proof in the UI that activation ran
    vscode.window.showInformationMessage("NGKs AutoLogger activated");
    // IMPORTANT: this is what was missing
    await (0, activate_1.activateExtension)(context, sessions);
    // Setup crash guard if session is active
    if (sessions.isActive()) {
        const session = sessions.getSession();
        const crashLogPath = path.join(session.logDirPath, "crash.jsonl");
        crashGuard = new crashGuard_1.CrashGuard({
            crashLogPath,
            getContext: () => ({
                sessionId: session.sessionId,
                workspacePath: session.workspacePath
            })
        });
        crashGuard.install();
    }
    // Optional marker
    sessions.log("EXTENSION_READY", { vscodeVersion: vscode.version });
}
function deactivate() {
    if (crashGuard) {
        crashGuard.dispose();
        crashGuard = null;
    }
    (0, deactivate_1.deactivateExtension)(sessions);
}
//# sourceMappingURL=extension.js.map