// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\core\integrityVerifier.ts
import * as fs from 'fs';
import { chainHash } from './hashChain';

export interface IntegrityResult {
  ok: boolean;
  total: number;
  firstError?: {
    line: number;
    reason: string;
    seq?: number;
  };
}

export interface LogEvent {
  seq: number;
  prev_hash?: string;
  hash: string;
  [key: string]: any;
}

/**
 * Verifies the integrity of a JSONL log file by checking:
 * - Sequential numbering (seq: 1..N)
 * - Hash chain integrity (prev_hash/hash linkage)
 * - Required fields presence
 */
export function verifyLogIntegrity(filePath: string): IntegrityResult {
  let total = 0;
  let expectedSeq = 1;
  let previousHash: string | undefined = undefined;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex].trim();
      
      // Skip empty lines
      if (!line) {
        continue;
      }

      total++;

      try {
        // Parse JSON
        const event: LogEvent = JSON.parse(line);

        // Check required fields exist
        if (typeof event.seq !== 'number') {
          return {
            ok: false,
            total,
            firstError: {
              line: lineIndex + 1,
              reason: 'Missing or invalid seq field',
              seq: event.seq
            }
          };
        }

        if (!event.hash || typeof event.hash !== 'string') {
          return {
            ok: false,
            total,
            firstError: {
              line: lineIndex + 1,
              reason: 'Missing or invalid hash field',
              seq: event.seq
            }
          };
        }

        // Check sequence continuity
        if (event.seq !== expectedSeq) {
          return {
            ok: false,
            total,
            firstError: {
              line: lineIndex + 1,
              reason: `Sequence gap: expected ${expectedSeq}, got ${event.seq}`,
              seq: event.seq
            }
          };
        }

        // Check prev_hash linkage for seq > 1
        if (event.seq > 1) {
          if (!event.prev_hash) {
            return {
              ok: false,
              total,
              firstError: {
                line: lineIndex + 1,
                reason: 'Missing prev_hash for seq > 1',
                seq: event.seq
              }
            };
          }

          if (event.prev_hash !== previousHash) {
            return {
              ok: false,
              total,
              firstError: {
                line: lineIndex + 1,
                reason: `Hash chain broken: prev_hash ${event.prev_hash} != previous hash ${previousHash}`,
                seq: event.seq
              }
            };
          }
        } else if (event.seq === 1) {
          // First event should not have prev_hash
          if (event.prev_hash !== undefined) {
            return {
              ok: false,
              total,
              firstError: {
                line: lineIndex + 1,
                reason: 'First event (seq=1) should not have prev_hash',
                seq: event.seq
              }
            };
          }
        }

        // Verify hash computation
        const lineWithoutHash = JSON.stringify({
          ...event,
          hash: undefined
        });
        const computedChain = chainHash(previousHash, lineWithoutHash);
        
        if (event.hash !== computedChain.hash) {
          return {
            ok: false,
            total,
            firstError: {
              line: lineIndex + 1,
              reason: `Hash mismatch: stored ${event.hash} != computed ${computedChain.hash}`,
              seq: event.seq
            }
          };
        }

        // Update state for next iteration
        previousHash = event.hash;
        expectedSeq++;

      } catch (parseError) {
        return {
          ok: false,
          total,
          firstError: {
            line: lineIndex + 1,
            reason: `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`
          }
        };
      }
    }

    return {
      ok: true,
      total
    };

  } catch (fileError) {
    return {
      ok: false,
      total: 0,
      firstError: {
        line: 0,
        reason: `File read error: ${fileError instanceof Error ? fileError.message : String(fileError)}`
      }
    };
  }
}