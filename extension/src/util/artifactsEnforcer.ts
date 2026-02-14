import { execSync } from 'child_process';

/**
 * artifacts Enforcement & Anti-Lie Guards
 * Phase 3.6: Machine-enforced verification truth
 */

export interface artifactsContract {
  hasartifactsMarkers: boolean;
  fileScopeValid: boolean;
  noTruncation: boolean;
}

/**
 * Check if output contains required artifacts markers
 */
export function validateartifactsMarkers(output: string): boolean {
  const lines = output.split('\n');
  const hasBegin = lines.some(line => line.trim() === 'artifacts_BEGIN');
  const hasEnd = lines.some(line => line.trim() === 'artifacts_END');
  
  return hasBegin && hasEnd;
}

/**
 * Check file scope against allowed list
 */
export function validateFileScope(allowedFiles: string[]): { valid: boolean; violations: string[] } {
  try {
    const gitOutput = execSync('git diff --name-status', { encoding: 'utf-8', cwd: process.cwd() });
    const changedFiles = gitOutput.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('D'))
      .map(line => line.split(/\s+/).slice(1).join(' '));
    
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
 * Enforce artifacts contract for verification
 */
export function enforceartifactsContract(
  output: string, 
  allowedFiles: string[], 
  checkPaths: string[] = []
): artifactsContract {
  return {
    hasartifactsMarkers: validateartifactsMarkers(output),
    fileScopeValid: validateFileScope(allowedFiles).valid,
    noTruncation: !detectTruncation(checkPaths)
  };
}

/**
 * Auto-fail with clear message
 */
export function autoFailIfViolations(contract: artifactsContract): void {
  if (!contract.hasartifactsMarkers) {
    console.log('FILE_SCOPE_OK=NO');
    console.log('REASON: Missing artifacts_BEGIN/artifacts_END markers');
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