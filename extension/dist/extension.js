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
const sessionManager_1 = require("./core/sessionManager");
const activate_1 = require("./activate");
const deactivate_1 = require("./deactivate");
const sessions = new sessionManager_1.SessionManager();
async function activate(context) {
    // Hard proof in the UI that activation ran
    vscode.window.showInformationMessage("NGKs AutoLogger activated");
    // Extension-host exception hooks (Phase 1 proof)
    process.on("uncaughtException", (err) => {
        try {
            sessions.log("UNCAUGHT_EXCEPTION", { name: err.name, message: err.message, stack: err.stack }, "ERROR");
        }
        finally {
            sessions.stop("error_exit", err);
        }
    });
    process.on("unhandledRejection", (reason) => {
        try {
            sessions.log("UNHANDLED_REJECTION", { reason }, "ERROR");
        }
        finally {
            sessions.stop("error_exit", reason);
        }
    });
    // IMPORTANT: this is what was missing
    await (0, activate_1.activateExtension)(context, sessions);
    // Optional marker
    sessions.log("EXTENSION_READY", { vscodeVersion: vscode.version });
}
function deactivate() {
    (0, deactivate_1.deactivateExtension)(sessions);
}
//# sourceMappingURL=extension.js.map