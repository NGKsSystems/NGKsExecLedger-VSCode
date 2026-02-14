#!/usr/bin/env node

/**
 * NGKs ExecLedger Desktop Engine
 * Premium tier CLI for artifacts session artifact access
 * 
 * Pure Node.js - no VS Code dependencies
 */

const fs = require('fs');
const path = require('path');

class DesktopEngine {
  constructor(outputRoot) {
    this.outputRoot = outputRoot;
  }

  /**
   * List all exec directories in newest-first order
   */
  listExecDirs(root) {
    if (!fs.existsSync(root)) {
      return [];
    }

    return fs.readdirSync(root)
      .filter(name => name.startsWith('exec_'))
      .map(name => path.join(root, name))
      .filter(dir => fs.statSync(dir).isDirectory())
      .sort((a, b) => {
        // Sort by exec folder name (contains timestamp) descending
        const aName = path.basename(a);
        const bName = path.basename(b);
        return bName.localeCompare(aName);
      });
  }

  /**
   * Resolve session within exec directory using priority layout detection
   * @returns { sessionDir, mode } or null
   * mode: "MILESTONE" | "DIRECT_SESSION" | "FLAT_EXEC"
   */
  resolveSessionInExec(execDir) {
    // A) Canonical milestone layout (preferred)
    const milestoneDir = path.join(execDir, 'milestone');
    if (fs.existsSync(milestoneDir)) {
      const sessionDirs = fs.readdirSync(milestoneDir)
        .map(name => path.join(milestoneDir, name))
        .filter(dir => {
          return fs.statSync(dir).isDirectory() && this.hasSessionFiles(dir);
        })
        .sort((a, b) => {
          const aStat = fs.statSync(a);
          const bStat = fs.statSync(b);
          return bStat.mtime.getTime() - aStat.mtime.getTime();
        });

      if (sessionDirs.length > 0) {
        return { sessionDir: sessionDirs[0], mode: "MILESTONE" };
      }
    }

    // B) Direct-session layout (legacy)
    const directSessions = fs.readdirSync(execDir)
      .filter(name => name !== 'milestone') // Exclude milestone dir
      .map(name => path.join(execDir, name))
      .filter(dir => {
        return fs.statSync(dir).isDirectory() && this.hasSessionFiles(dir);
      })
      .sort((a, b) => {
        const aStat = fs.statSync(a);
        const bStat = fs.statSync(b);
        return bStat.mtime.getTime() - aStat.mtime.getTime();
      });

    if (directSessions.length > 0) {
      return { sessionDir: directSessions[0], mode: "DIRECT_SESSION" };
    }

    // C) Flat exec layout (fallback)
    if (this.hasSessionFiles(execDir)) {
      return { sessionDir: execDir, mode: "FLAT_EXEC" };
    }

    return null; // No usable session found in this exec
  }

  /**
   * Find latest session using hardened layout detection
   * Supports: A) milestone/<session>, B) direct <session>, C) flat exec layout
   */
  findLatestSession() {
    if (!fs.existsSync(this.outputRoot)) {
      throw new Error(`artifacts root directory not found: ${this.outputRoot}`);
    }

    const execDirs = this.listExecDirs(this.outputRoot);
    
    if (execDirs.length === 0) {
      throw new Error('No exec_ directories found. Run milestone artifacts gates first.');
    }

    // Try each exec directory until we find a usable session
    for (const execDir of execDirs) {
      const result = this.resolveSessionInExec(execDir);
      if (result) {
        return result.sessionDir;
      }
    }

    throw new Error(`No usable sessions found in artifacts root: ${this.outputRoot}`);
  }

  /**
   * DEPRECATED: Use resolveSessionInExec instead
   */
  findBestSessionInExec(execDir) {
    const result = this.resolveSessionInExec(execDir);
    return result ? result.sessionDir : null;
  }

  /**
   * Check if a directory contains the required session files
   */
  hasSessionFiles(dir) {
    const summaryFile = path.join(dir, 'summary.txt');
    const reportFile = path.join(dir, 'report.txt');
    return fs.existsSync(summaryFile) || fs.existsSync(reportFile);
  }

  /**
   * Find specific session by exec and session IDs with layout detection
   */
  findSpecificSession(execId, sessionId) {
    const execDir = path.join(this.outputRoot, execId);
    if (!fs.existsSync(execDir)) {
      throw new Error(`Exec directory not found: ${execId}`);
    }

    // A) Try canonical milestone layout first
    const milestoneSessionDir = path.join(execDir, 'milestone', sessionId);
    if (fs.existsSync(milestoneSessionDir)) {
      return milestoneSessionDir;
    }

    // B) Try direct-session layout
    const directSessionDir = path.join(execDir, sessionId);
    if (fs.existsSync(directSessionDir)) {
      return directSessionDir;
    }

    // C) Check if sessionId matches execId (flat layout)
    if (sessionId === execId && fs.existsSync(execDir)) {
      return execDir;
    }

    throw new Error(`Session directory not found: ${sessionId} in exec ${execId}`);
  }

  /**
   * Generate contract JSON for a session directory with layout-aware sessionId
   * @param {string} sessionDir - The session directory path
   * @param {string} mode - Layout mode: "MILESTONE" | "DIRECT_SESSION" | "FLAT_EXEC"
   */
  generateContract(sessionDir, mode = null) {
    let sessionId;
    
    if (!mode) {
      // Auto-detect mode if not provided (for backward compatibility)
      const sessionDirName = path.basename(sessionDir);
      const parentDirName = path.basename(path.dirname(sessionDir));
      
      if (parentDirName === 'milestone') {
        mode = "MILESTONE";
      } else if (sessionDirName.startsWith('exec_')) {
        mode = "FLAT_EXEC";
      } else {
        mode = "DIRECT_SESSION";
      }
    }

    // Determine sessionId based on layout mode
    switch (mode) {
      case "MILESTONE":
      case "DIRECT_SESSION":
        sessionId = path.basename(sessionDir);
        break;
      case "FLAT_EXEC":
        // For flat exec layout: use the exec folder name as sessionId
        sessionId = path.basename(sessionDir);
        break;
      default:
        sessionId = path.basename(sessionDir);
    }

    const summaryFile = path.join(sessionDir, 'summary.txt');
    const reportFile = path.join(sessionDir, 'report.txt');
    
    // Get session creation time from directory stats
    const sessionStat = fs.statSync(sessionDir);
    const createdAt = sessionStat.birthtime.toISOString();

    const warnings = [];
    if (!fs.existsSync(summaryFile)) {
      warnings.push('summary.txt missing');
    }
    if (!fs.existsSync(reportFile)) {
      warnings.push('report.txt missing');
    }

    const contract = {
      sessionRoot: sessionDir,
      summaryFile: summaryFile,
      reportFile: reportFile,
      artifactsFolder: sessionDir,
      sessionId: sessionId,
      createdAt: createdAt,
      hashes: {} // Optional for now
    };

    if (warnings.length > 0) {
      contract.warnings = warnings;
    }

    return contract;
  }
}

// CLI Arguments parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    root: null,
    latest: true,
    exec: null,
    session: null,
    out: null
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--root':
        parsed.root = args[++i];
        break;
      case '--latest':
        parsed.latest = true;
        break;
      case '--exec':
        parsed.exec = args[++i];
        parsed.latest = false;
        break;
      case '--session':
        parsed.session = args[++i];
        break;
      case '--out':
        parsed.out = args[++i];
        break;
      case '--help':
        console.log(`NGKs ExecLedger Desktop Engine

Usage: node src/index.js [options]

Options:
  --root <path>       artifacts root directory (default: cwd/execledger)
  --latest           Use latest exec and session (default)
  --exec <id>        Specify exec folder ID
  --session <id>     Specify session ID (requires --exec)
  --out <path>       Output to file instead of stdout
  --help             Show this help

Exit codes:
  0 - Success
  2 - Contract violation
  3 - No sessions found
  4 - Invalid arguments`);
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(4);
    }
  }

  return parsed;
}

// Main execution
function main() {
  try {
    const args = parseArgs();
    
    // Validate arguments
    if (args.session && !args.exec) {
      console.error('Error: --session requires --exec');
      process.exit(4);
    }

    // Determine artifacts root
    const artifactsRoot = args.root || path.join(process.cwd(), 'execledger');
    
    // Create engine instance
    const engine = new DesktopEngine(artifactsRoot);
    
    // Find session directory
    let sessionDir;
    if (args.latest || (!args.exec && !args.session)) {
      sessionDir = engine.findLatestSession();
    } else {
      sessionDir = engine.findSpecificSession(args.exec, args.session);
    }

    // Generate contract
    const contract = engine.generateContract(sessionDir);
    const contractJson = JSON.stringify(contract, null, 2);

    // Output
    if (args.out) {
      fs.writeFileSync(args.out, contractJson, 'utf8');
      console.log(`Contract written to: ${args.out}`);
    } else {
      console.log(contractJson);
    }

    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    
    if (error.message.includes('No usable sessions found') || error.message.includes('No exec_')) {
      process.exit(3); // No sessions found
    } else if (error.message.includes('not found') || error.message.includes('Session directory not found')) {
      process.exit(3); // No sessions found
    } else {
      process.exit(1); // General error
    }
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { DesktopEngine };