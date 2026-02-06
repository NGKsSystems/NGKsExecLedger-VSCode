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
exports.autosaveProofCopy = autosaveProofCopy;
// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\core\autosave.ts
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs_1 = require("../util/fs");
const time_1 = require("../util/time");
function autosaveProofCopy(params) {
    try {
        const downloads = path.join(os.homedir(), "Downloads");
        const root = path.join(downloads, "NGKsLogs", params.appName);
        const ts = (0, time_1.safeFileTimestamp)();
        const fileName = `${ts}_${params.reason}_${params.sessionId}.jsonl`;
        const dest = path.join(root, fileName);
        (0, fs_1.copyFileSyncSafe)(params.logFilePath, dest);
        return { autosaved: true, autosavePath: dest };
    }
    catch {
        return { autosaved: false };
    }
}
//# sourceMappingURL=autosave.js.map