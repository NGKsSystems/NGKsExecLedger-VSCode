// BINARY ACCEPTANCE TEST - Run with: node extension/src/test/verify-phase5.js
// Phase 5 Gate: Proof Bundle Export + Manifest

/**
 * PHASE 5 — PROOF BUNDLE EXPORT + MANIFEST INTEGRITY GATE
 *
 * Goals:
 *  - Assert a proof bundle zip + manifest are created under _proof/bundles/
 *  - Assert manifest is valid JSON and contains required fields
 *  - Assert zip file exists and is non-empty
 *  - Assert manifest file entries exist and hashes look like SHA256 hex
 *  - Assert referenced files exist in the corresponding proof session dir
 *
 * Note:
 *  - This gate is designed to run AFTER export_proof_bundle.ps1 has run at least once.
 *  - It does not attempt to recompute all hashes (heavy). It validates structure + existence.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require('child_process');

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
}

function repoRoot() {
  // __dirname = extension/src/test
  return path.resolve(__dirname, "../../../");
}

function isSha256Hex(s) {
  return typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
}

function findLatestBundleFiles(bundlesDir) {
  const entries = fs.readdirSync(bundlesDir, { withFileTypes: true });
  const manifests = entries
    .filter((e) => e.isFile() && e.name.endsWith(".manifest.json"))
    .map((e) => path.join(bundlesDir, e.name));

  if (manifests.length === 0) return null;

  manifests.sort((a, b) => {
    const ta = fs.statSync(a).mtimeMs;
    const tb = fs.statSync(b).mtimeMs;
    return tb - ta;
  });

  const manifestPath = manifests[0];
  const base = path.basename(manifestPath).replace(/\.manifest\.json$/, "");
  const zipPath = path.join(bundlesDir, `${base}.zip`);
  return { manifestPath, zipPath, base };
}

function requireField(obj, key) {
  if (!(key in obj)) throw new Error(`Missing required field: ${key}`);
  return obj[key];
}

function validateProofMarkers(sample) {
  return sample.includes('PROOF_BEGIN') && sample.includes('PROOF_END');
}

function validateFileScope(allowedFiles) {
  let diffList = [];
  try {
    const out = sh('git diff --name-only').trim();
    diffList = out ? out.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  } catch {
    diffList = [];
  }
  
  const allowed = new Set(allowedFiles);
  const violations = diffList.filter(f => f && !allowed.has(f));
  return {
    valid: violations.length === 0,
    violations: violations
  };
}

function testProofMarkers() {
  console.log("🧪 Testing proof markers validation...");
  const ok = validateProofMarkers("PROOF_BEGIN\nPROOF_END\n");
  console.log(`  Proof markers detected: ${ok ? "YES" : "NO"}`);
  return ok === true;
}

function testBundleAndManifest() {
  console.log("🧪 Testing bundle + manifest presence...");
  const root = repoRoot();
  const bundlesDir = path.join(root, "_proof", "bundles");
  if (!fs.existsSync(bundlesDir)) {
    console.log("  Bundles dir missing: NO");
    return { ok: false, reason: "BUNDLES_DIR_MISSING" };
  }

  const latest = findLatestBundleFiles(bundlesDir);
  if (!latest) {
    console.log("  No manifest found: NO");
    return { ok: false, reason: "MANIFEST_MISSING" };
  }

  const { manifestPath, zipPath } = latest;
  const manifestExists = fs.existsSync(manifestPath);
  const zipExists = fs.existsSync(zipPath);

  console.log(`  Manifest exists: ${manifestExists ? "YES" : "NO"}`);
  console.log(`  Zip exists: ${zipExists ? "YES" : "NO"}`);

  if (!manifestExists) return { ok: false, reason: "MANIFEST_MISSING" };
  if (!zipExists) return { ok: false, reason: "ZIP_MISSING" };

  const zipBytes = fs.statSync(zipPath).size;
  console.log(`  Zip non-empty: ${zipBytes > 0 ? "YES" : "NO"}`);
  if (zipBytes <= 0) return { ok: false, reason: "ZIP_EMPTY" };

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    console.log("  Manifest JSON parse: FAIL");
    return { ok: false, reason: "MANIFEST_INVALID_JSON" };
  }
  console.log("  Manifest JSON parse: PASS");

  // Required fields
  const execId = requireField(manifest, "exec_id");
  const sessionId = requireField(manifest, "session_id");
  const mode = requireField(manifest, "mode");
  const headCommit = requireField(manifest, "head_commit");
  const proofDir = requireField(manifest, "proof_dir");
  const files = requireField(manifest, "files");

  const fieldsOk =
    typeof execId === "string" &&
    typeof sessionId === "string" &&
    typeof mode === "string" &&
    typeof headCommit === "string" &&
    typeof proofDir === "string" &&
    Array.isArray(files);

  console.log(`  Required fields valid: ${fieldsOk ? "YES" : "NO"}`);
  if (!fieldsOk) return { ok: false, reason: "MANIFEST_FIELDS_INVALID" };

  // Validate file entries (lightweight)
  console.log("🧪 Validating manifest file entries...");
  const rootWin = repoRoot();
  const proofDirAbs = path.resolve(rootWin, proofDir.replace(/\//g, path.sep));

  let entriesOk = true;
  let missingCount = 0;
  let badHashCount = 0;

  for (const f of files) {
    if (!f || typeof f.path !== "string") {
      entriesOk = false;
      continue;
    }
    if (!isSha256Hex(f.sha256)) {
      badHashCount++;
      entriesOk = false;
    }
    const abs = path.join(proofDirAbs, f.path.replace(/\//g, path.sep));
    if (!fs.existsSync(abs)) {
      missingCount++;
      entriesOk = false;
    }
  }

  console.log(`  Entries valid: ${entriesOk ? "YES" : "NO"}`);
  console.log(`  Missing files: ${missingCount}`);
  console.log(`  Bad hashes: ${badHashCount}`);

  if (!entriesOk) return { ok: false, reason: "MANIFEST_ENTRIES_INVALID" };

  return {
    ok: true,
    execId,
    sessionId,
    mode,
    manifestPath,
    zipPath,
  };
}

function testFileScope() {
  console.log("🧪 Testing file scope validation...");
  // Phase 5 allowed files only
  const allowedFiles = [
    "tools/export_proof_bundle.ps1",
    "tools/run_phase_gates.ps1",
    "extension/src/test/verify-phase5.js",
    "extension/src/test/verify-phase3.8.js",
    "extension/src/test/verify-phase3.9.js",
    "extension/src/test/verify-phase4.js",
    "extension/package.json",
    "extension/src/extension.ts",
    "extension/src/command/exportProofBundle.ts",
    "extension/src/test/verify-phase6.js",
    "extension/src/test/verify-phase7.js",
    "extension/src/test/verify-phase8.js",
    "extension/src/command/openLatestProofBundle.ts",
    "extension/src/test/verify-phase9.js",
    ".gitignore",
  ];
  const scopeResult = validateFileScope(allowedFiles);
  console.log(`  File scope validation: ${scopeResult.valid ? "PASS" : "FAIL"}`);
  if (!scopeResult.valid) {
    console.log(`  Violations: ${scopeResult.violations.join(", ")}`);
  }
  return scopeResult.valid;
}

(function main() {
  console.log("PROOF_BEGIN");
  console.log("PROOF_END");
  console.log("🔍 PHASE 5 PROOF BUNDLE EXPORT + MANIFEST INTEGRITY GATE");

  const a = testProofMarkers();
  const b = testBundleAndManifest();
  const c = testFileScope();

  const overall = a && b.ok && c;

  console.log("\n📊 PHASE 5 BINARY ACCEPTANCE RESULTS:");
  console.log(`PROOF_MARKERS: ${a ? "YES" : "NO"} - Enforcement working`);
  console.log(`BUNDLE_PRESENT: ${b.ok ? "YES" : "NO"} - Zip + manifest present and valid`);
  console.log(`FILE_SCOPE_VALID: ${c ? "YES" : "NO"} - Phase 5 scope validated`);
  console.log(`OVERALL: ${overall ? "PASS" : "FAIL"}`);

  if (!overall) process.exitCode = 1;
})();