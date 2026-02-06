"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nowIso = nowIso;
exports.safeFileTimestamp = safeFileTimestamp;
// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\util\time.ts
function nowIso() {
    return new Date().toISOString();
}
function safeFileTimestamp(d = new Date()) {
    // yyyyMMdd_HHmmss
    const pad = (n) => n.toString().padStart(2, "0");
    const yyyy = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const HH = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${yyyy}${MM}${dd}_${HH}${mm}${ss}`;
}
//# sourceMappingURL=time.js.map