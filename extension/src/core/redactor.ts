// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\core\redactor.ts

export interface RedactionResult {
  text: string;
  redacted: boolean;
  hits: number;
}

/**
 * Redacts sensitive data from text while preserving context.
 * Targets common token patterns:
 * - hf_* tokens (Hugging Face)
 * - ghp_* tokens (GitHub personal access tokens)  
 * - sk-* style API keys
 * - Bearer <token> patterns
 * - Long base64-ish strings
 */
export function redactText(input: string): RedactionResult {
  let text = input;
  let totalHits = 0;

  // Pattern 1: Hugging Face tokens (hf_*)
  const hfPattern = /\bhf_[A-Za-z0-9]{20,}\b/g;
  const hfMatches = text.match(hfPattern);
  if (hfMatches) {
    totalHits += hfMatches.length;
    text = text.replace(hfPattern, '[REDACTED]');
  }

  // Pattern 2: GitHub personal access tokens (ghp_*)  
  const ghpPattern = /\bghp_[A-Za-z0-9_]{36,}\b/g;
  const ghpMatches = text.match(ghpPattern);
  if (ghpMatches) {
    totalHits += ghpMatches.length;
    text = text.replace(ghpPattern, '[REDACTED]');
  }

  // Pattern 3: sk- style API keys (OpenAI, Stripe, etc.)
  const skPattern = /\bsk-[A-Za-z0-9_-]{40,}\b/g;
  const skMatches = text.match(skPattern);
  if (skMatches) {
    totalHits += skMatches.length;
    text = text.replace(skPattern, '[REDACTED]');
  }

  // Pattern 4: Bearer tokens
  const bearerPattern = /\bBearer\s+[A-Za-z0-9_.-]{20,}\b/gi;
  const bearerMatches = text.match(bearerPattern);
  if (bearerMatches) {
    totalHits += bearerMatches.length;
    text = text.replace(bearerPattern, 'Bearer [REDACTED]');
  }

  // Pattern 5: Long base64-ish strings (reasonable heuristic)
  // Look for strings that are mostly alphanumeric with common base64 chars
  // Must be at least 32 chars and high ratio of valid base64 chars
  const base64Pattern = /\b[A-Za-z0-9+/=_-]{32,}\b/g;
  const potentialBase64 = text.match(base64Pattern);
  if (potentialBase64) {
    let base64Hits = 0;
    for (const match of potentialBase64) {
      // Check if it looks like base64 (high ratio of valid chars)
      const validChars = match.match(/[A-Za-z0-9+/=_-]/g)?.length || 0;
      const ratio = validChars / match.length;
      
      // If >90% valid base64 chars and longer than 32 chars, likely a token
      if (ratio > 0.9 && match.length >= 32) {
        base64Hits++;
        text = text.replace(match, '[REDACTED]');
      }
    }
    totalHits += base64Hits;
  }

  // Pattern 6: AWS-style access keys (AKIA*, ASIA*)
  const awsPattern = /\b(?:AKIA|ASIA)[A-Z0-9]{16,}\b/g;
  const awsMatches = text.match(awsPattern);
  if (awsMatches) {
    totalHits += awsMatches.length;
    text = text.replace(awsPattern, '[REDACTED]');
  }

  // Pattern 7: JWT tokens (roughly)
  const jwtPattern = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g;
  const jwtMatches = text.match(jwtPattern);
  if (jwtMatches) {
    totalHits += jwtMatches.length;
    text = text.replace(jwtPattern, '[REDACTED]');
  }

  return {
    text,
    redacted: totalHits > 0,
    hits: totalHits
  };
}