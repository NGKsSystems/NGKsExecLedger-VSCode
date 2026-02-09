import { execSync } from 'child_process';

/**
 * Proof Enforcement & Anti-Lie Guards
 * Phase 3.6: Machine-enforced verification truth
 */

export interface ProofContract {
  hasProofMarkers: boolean;
  fileScopeValid: boolean;
  noTruncation: boolean;
}

/**
 * Check if output contains required proof markers
 */
export function validateProofMarkers(output: string): boolean {
  const lines = output.split('\n');
  const hasBegin = lines.some(line => line.trim() === 'PROOF_BEGIN');
  const hasEnd = lines.some(line => line.trim() === 'PROOF_END');
  
  return hasBegin && hasEnd;
}

/**
 * Check file scope against allowed list
 */
export function validateFileScope(allowedFiles: string[]): { valid: boolean; violations: string[] } {
  try {
    const gitOutput = execSync('git diff --name-only', { encoding: 'utf-8', cwd: process.cwd() });
    const changedFiles = gitOutput.split('\n').filter(f => f.trim());
    
    const violations = changedFiles.filter(file => !allowedFiles.includes(file));
    
    return {
      valid: violations.length === 0,
      violations
    };
  } catch (error) {
    return { valid: false, violations: ['git-command-failed'] };
  }
}

/**
 * Detect path truncation (e.g. "ext..." patterns)
 */
export function detectTruncation(paths: string[]): boolean {
  return paths.some(path => {
    return path.includes('...') || 
           path.includes('…') ||
           path.length > 0 && path.endsWith('..') ||
           /\w+\.{3,}/.test(path);
  });
}

/**
 * Enforce proof contract for verification
 */
export function enforceProofContract(
  output: string, 
  allowedFiles: string[], 
  checkPaths: string[] = []
): ProofContract {
  return {
    hasProofMarkers: validateProofMarkers(output),
    fileScopeValid: validateFileScope(allowedFiles).valid,
    noTruncation: !detectTruncation(checkPaths)
  };
}

/**
 * Auto-fail with clear message
 */
export function autoFailIfViolations(contract: ProofContract): void {
  if (!contract.hasProofMarkers) {
    console.log('FILE_SCOPE_OK=NO');
    console.log('REASON: Missing PROOF_BEGIN/PROOF_END markers');
    process.exit(1);
  }
  
  if (!contract.fileScopeValid) {
    console.log('FILE_SCOPE_OK=NO');
    console.log('REASON: Files outside allowed scope detected');
    process.exit(1);
  }
  
  if (!contract.noTruncation) {
    console.log('WINDOW_FREE=INVALID');
    console.log('REASON: Path truncation detected');
    process.exit(1);
  }
}