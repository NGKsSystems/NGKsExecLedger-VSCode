"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonlWriter = void 0;
const hashChain_1 = require("./hashChain");
const fs_1 = require("../util/fs");
class JsonlWriter {
    filePath;
    seq = 0;
    lastHash;
    constructor(filePath) {
        this.filePath = filePath;
    }
    write(event) {
        const seq = ++this.seq;
        // Create a minimal line first (no hashes yet), then compute chain hash on that line.
        const base = {
            ...event,
            seq
        };
        const lineWithoutHashes = JSON.stringify(base);
        const { prev_hash, hash } = (0, hashChain_1.chainHash)(this.lastHash, lineWithoutHashes);
        const finalEvent = {
            ...base,
            prev_hash,
            hash
        };
        (0, fs_1.writeLineSync)(this.filePath, JSON.stringify(finalEvent));
        this.lastHash = hash;
        return finalEvent;
    }
    getLastHash() {
        return this.lastHash;
    }
    getSeq() {
        return this.seq;
    }
}
exports.JsonlWriter = JsonlWriter;
//# sourceMappingURL=jsonlWriter.js.map