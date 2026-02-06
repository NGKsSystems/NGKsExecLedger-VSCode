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
exports.ensureDirSync = ensureDirSync;
exports.copyFileSyncSafe = copyFileSyncSafe;
exports.writeLineSync = writeLineSync;
exports.fileExists = fileExists;
// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\util\fs.ts
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function ensureDirSync(dirPath) {
    if (!fs.existsSync(dirPath))
        fs.mkdirSync(dirPath, { recursive: true });
}
function copyFileSyncSafe(src, dest) {
    ensureDirSync(path.dirname(dest));
    fs.copyFileSync(src, dest);
}
function writeLineSync(filePath, line) {
    fs.appendFileSync(filePath, line + "\n", { encoding: "utf8" });
}
function fileExists(p) {
    return fs.existsSync(p);
}
//# sourceMappingURL=fs.js.map