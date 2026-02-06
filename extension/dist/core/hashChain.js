"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256Hex = sha256Hex;
exports.chainHash = chainHash;
// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\core\hashChain.ts
const crypto_1 = require("crypto");
function sha256Hex(input) {
    return (0, crypto_1.createHash)("sha256").update(input, "utf8").digest("hex");
}
/**
 * Stable hashing: hash the line content + previous hash.
 * Keeps it simple and deterministic.
 */
function chainHash(prevHash, jsonLine) {
    const material = `${prevHash ?? ""}\n${jsonLine}`;
    return { prev_hash: prevHash, hash: sha256Hex(material) };
}
//# sourceMappingURL=hashChain.js.map