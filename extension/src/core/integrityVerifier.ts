// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\core\integrityVerifier.ts
import * as fs from "fs";
import { chainHash } from "./hashChain";

export type IntegrityError = {
  line: number;
  reason: string;
  seq?: number;
  stored?: string;
  computed?: string;
};

export type IntegrityResult = {
  ok: boolean;
  total: number;
  firstError?: IntegrityError;
};

type AnyJson = Record<string, any>;

function reconstructWriterBaseJson(rawLine: string): { seq?: number; base_json: string; stored_hash?: string } {
  const obj = JSON.parse(rawLine) as AnyJson;

  const seq = typeof obj.seq === "number" ? obj.seq : undefined;
  const stored_hash = typeof obj.hash === "string" ? obj.hash : undefined;

  delete obj.prev_hash;
  delete obj.hash;

  const base_json = JSON.stringify(obj);
  return { seq, base_json, stored_hash };
}

export function verifyLogIntegrity(filePath: string): IntegrityResult {
  if (!fs.existsSync(filePath)) {
    return { ok: false, total: 0, firstError: { line: 0, reason: "File not found" } };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  let prevComputed: string | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    let parsed;
    try {
      parsed = reconstructWriterBaseJson(rawLine);
    } catch (e: any) {
      return {
        ok: false,
        total: i,
        firstError: {
          line: i + 1,
          reason: `Invalid JSON on line ${i + 1}: ${e?.message ?? String(e)}`
        }
      };
    }

    const { seq, base_json, stored_hash } = parsed;

    if (!stored_hash) {
      return {
        ok: false,
        total: i,
        firstError: { line: i + 1, seq, reason: "Missing stored hash on line" }
      };
    }

    const { hash: computed } = chainHash(prevComputed, base_json);

    if (computed !== stored_hash) {
      return {
        ok: false,
        total: i + 1,
        firstError: {
          line: i + 1,
          seq,
          reason: "Integrity verification failed: hash mismatch",
          stored: stored_hash,
          computed
        }
      };
    }

    prevComputed = computed;
  }

  return { ok: true, total: lines.length };
}
