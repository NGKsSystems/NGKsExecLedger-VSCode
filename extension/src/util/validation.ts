// File: extension/src/util/validation.ts
import * as fs from "fs";

/**
 * Schema for latest.json with Phase 15/16 fields
 */
export interface LatestJsonSchema {
  exec_id: string;
  session_id: string;
  mode: string;
  zip_path: string;
  manifest_path: string;
  created_at: string;
  // Phase 15 fields
  proof_dir?: string;
  summary_path?: string;
  report_path?: string;
  diff_name_only_path?: string;
  status_path?: string;
  compile_log_path?: string;
  // Phase 16 field
  integrity_path?: string;
}

/**
 * Schema for integrity.json (Phase 16)
 */
export interface IntegrityJsonSchema {
  exec_id: string;
  session_id: string;
  mode: string;
  created_at: string;
  hashes: {
    summary: string | null;
    report: string | null;
    manifest: string | null;
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate latest.json structure
 */
export function validateLatestJson(data: any): ValidationResult {
  const errors: string[] = [];
  
  // Required fields
  const required = ['exec_id', 'session_id', 'mode', 'zip_path', 'manifest_path', 'created_at'];
  for (const field of required) {
    if (!data[field] || typeof data[field] !== 'string') {
      errors.push(`Missing or invalid required field: ${field}`);
    }
  }
  
  // Optional fields from Phase 15/16 (if present, must be strings)
  const optional = ['proof_dir', 'summary_path', 'report_path', 'diff_name_only_path', 
                   'status_path', 'compile_log_path', 'integrity_path'];
  for (const field of optional) {
    if (data[field] !== undefined && typeof data[field] !== 'string') {
      errors.push(`Invalid type for optional field ${field}: expected string`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate integrity.json structure
 */
export function validateIntegrityJson(data: any): ValidationResult {
  const errors: string[] = [];
  
  // Required fields
  const required = ['exec_id', 'session_id', 'mode', 'created_at'];
  for (const field of required) {
    if (!data[field] || typeof data[field] !== 'string') {
      errors.push(`Missing or invalid required field: ${field}`);
    }
  }
  
  // Hashes object required
  if (!data.hashes || typeof data.hashes !== 'object') {
    errors.push('Missing or invalid hashes object');
    return { valid: false, errors };
  }
  
  // Hash fields (can be string or null)
  const hashFields = ['summary', 'report', 'manifest'];
  for (const field of hashFields) {
    if (data.hashes[field] !== null && typeof data.hashes[field] !== 'string') {
      errors.push(`Invalid type for hash field ${field}: expected string or null`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Detect drift by comparing current file hashes with integrity.json
 */
export function detectDrift(integrityPath: string, filePaths: { summary?: string, report?: string, manifest?: string }): ValidationResult {
  const errors: string[] = [];
  
  try {
    if (!fs.existsSync(integrityPath)) {
      return { valid: false, errors: ['Integrity file not found'] };
    }
    
    const content = fs.readFileSync(integrityPath, 'utf8');
    const integrity: IntegrityJsonSchema = JSON.parse(content);
    
    // Validate integrity.json schema first
    const schemaValidation = validateIntegrityJson(integrity);
    if (!schemaValidation.valid) {
      return schemaValidation;
    }
    
    // Check each file hash
    if (filePaths.summary && integrity.hashes.summary) {
      const currentHash = computeSHA256(filePaths.summary);
      if (currentHash !== integrity.hashes.summary) {
        errors.push(`Drift detected: summary.txt hash mismatch`);
      }
    }
    
    if (filePaths.report && integrity.hashes.report) {
      const currentHash = computeSHA256(filePaths.report);
      if (currentHash !== integrity.hashes.report) {
        errors.push(`Drift detected: report.txt hash mismatch`);
      }
    }
    
    if (filePaths.manifest && integrity.hashes.manifest) {
      const currentHash = computeSHA256(filePaths.manifest);
      if (currentHash !== integrity.hashes.manifest) {
        errors.push(`Drift detected: manifest.json hash mismatch`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  } catch (error) {
    return { valid: false, errors: [`Drift detection failed: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

/**
 * Compute SHA256 hash of a file (matches PowerShell Get-SHA256Hex)
 */
function computeSHA256(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const crypto = require('crypto');
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(content);
  return hash.digest('hex').toLowerCase();
}
