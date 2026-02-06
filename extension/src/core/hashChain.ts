// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\core\hashChain.ts
import { createHash } from "crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Stable hashing: hash the line content + previous hash.
 * Keeps it simple and deterministic.
 */
export function chainHash(prevHash: string | undefined, jsonLine: string): { prev_hash?: string; hash: string } {
  const material = `${prevHash ?? ""}\n${jsonLine}`;
  return { prev_hash: prevHash, hash: sha256Hex(material) };
}
