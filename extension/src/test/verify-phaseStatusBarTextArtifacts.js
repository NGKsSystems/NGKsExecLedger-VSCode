#!/usr/bin/env node
/**
 * Phase Status Bar Text Artifacts Verification
 * 
 * This script verifies that no status bar labels or tooltips contain "artifacts" (case-insensitive).
 * All user-facing text should use "artifacts" terminology instead.
 */

const fs = require('fs');
const path = require('path');

const EXTENSION_ROOT = path.resolve(__dirname, '..');
let hasErrors = false;
const errors = [];

// Files to check for status bar text
const STATUS_BAR_FILES = [
  'src/status/statusBarartifacts.ts',
  'src/core/execLedgerStatusBar.ts',
  'src/command/execLedgerQuickPick.ts',
  'src/ui/statusBarToggle.ts'
];

// Patterns to search for artifacts references in UI text
const artifacts_PATTERNS = [
  /statusBarItem\.text\s*=\s*["`'][^"`']*\bartifacts\b[^"`']*["`']/gi,
  /statusBarItem\.tooltip\s*=\s*["`'][^"`']*\bartifacts\b[^"`']*["`']/gi,
  /tooltip:\s*["`'][^"`']*\bartifacts\b[^"`']*["`']/gi,
  /label:\s*["`'][^"`']*\bartifacts\b[^"`']*["`']/gi,
  /description:\s*["`'][^"`']*\bartifacts\b[^"`']*["`']/gi,
  /detail:\s*["`'][^"`']*\bartifacts\b[^"`']*["`']/gi,
  /placeHolder:\s*["`'][^"`']*\bartifacts\b[^"`']*["`']/gi,
  /showInformationMessage\(["`'][^"`']*\bartifacts\b[^"`']*["`']/gi,
  /showErrorMessage\(["`'][^"`']*\bartifacts\b[^"`']*["`']/gi
];

function checkFile(filePath) {
  const fullPath = path.join(EXTENSION_ROOT, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  let fileHasErrors = false;
  
  artifacts_PATTERNS.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // Find line number
        const lineIndex = lines.findIndex(line => line.includes(match));
        const lineNumber = lineIndex + 1;
        
        errors.push({
          file: filePath,
          line: lineNumber,
          match: match.trim(),
          pattern: pattern.toString()
        });
        fileHasErrors = true;
      });
    }
  });
  
  if (fileHasErrors) {
    hasErrors = true;
    console.log(`❌ ${filePath}: Contains 'artifacts' in UI text`);
  } else {
    console.log(`✅ ${filePath}: Clean (no 'artifacts' in UI text)`);
  }
}

// Main verification
console.log('=== NGKs ExecLedger Status Bar Text Verification ===');
console.log('Checking for "artifacts" references in user-facing text...\n');

STATUS_BAR_FILES.forEach(checkFile);

// Results
console.log('\n=== VERIFICATION RESULTS ===');
if (hasErrors) {
  console.log('❌ VERIFICATION FAILED: Found "artifacts" in UI text');
  console.log('\nERRORS:');
  errors.forEach(error => {
    console.log(`  ${error.file}:${error.line}`);
    console.log(`    ${error.match}`);
    console.log(`    (Pattern: ${error.pattern})`);
    console.log('');
  });
  process.exit(1);
} else {
  console.log('✅ VERIFICATION PASSED: All UI text uses "artifacts" terminology');
  console.log(`Checked ${STATUS_BAR_FILES.length} files - no "artifacts" references found in user-facing text`);
  process.exit(0);
}