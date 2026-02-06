// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\core\jsonlWriter.ts
import { AnyEvent } from "../types/events";
import { chainHash } from "./hashChain";
import { writeLineSync } from "../util/fs";

export class JsonlWriter {
  private readonly filePath: string;
  private seq: number = 0;
  private lastHash: string | undefined;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  public write(event: Omit<AnyEvent, "seq" | "prev_hash" | "hash">): AnyEvent {
    const seq = ++this.seq;

    // Create a minimal line first (no hashes yet), then compute chain hash on that line.
    const base: AnyEvent = {
      ...(event as AnyEvent),
      seq
    };

    const lineWithoutHashes = JSON.stringify(base);
    const { prev_hash, hash } = chainHash(this.lastHash, lineWithoutHashes);

    const finalEvent: AnyEvent = {
      ...(base as AnyEvent),
      prev_hash,
      hash
    };

    writeLineSync(this.filePath, JSON.stringify(finalEvent));
    this.lastHash = hash;

    return finalEvent;
  }

  public getLastHash(): string | undefined {
    return this.lastHash;
  }

  public getSeq(): number {
    return this.seq;
  }
}
