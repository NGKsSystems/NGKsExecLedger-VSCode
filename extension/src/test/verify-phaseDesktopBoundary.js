const path = require('path');
const fs = require('fs');

console.log('=== PHASE 4 DESKTOP BOUNDARY VERIFICATION ===');

try {
  // Check if desktop-companion folder exists
  const desktopDir = path.join(__dirname, '../../../desktop-companion');
  if (!fs.existsSync(desktopDir)) {
    console.log('DESKTOP_BOUNDARY_OK=NO - desktop-companion directory not found');
    process.exit(1);
  }
  
  // Check if interfaceSpec.json exists and is valid JSON
  const interfaceSpecPath = path.join(desktopDir, 'interfaceSpec.json');
  if (!fs.existsSync(interfaceSpecPath)) {
    console.log('DESKTOP_BOUNDARY_OK=NO - interfaceSpec.json not found');
    process.exit(1);
  }
  
  let interfaceSpec;
  try {
    const content = fs.readFileSync(interfaceSpecPath, 'utf8');
    interfaceSpec = JSON.parse(content);
  } catch (error) {
    console.log(`DESKTOP_BOUNDARY_OK=NO - interfaceSpec.json is not valid JSON: ${error.message}`);
    process.exit(1);
  }
  
  // Verify required keys exist in the interface spec
  const requiredKeys = ['sessionRoot', 'summaryFile', 'reportFile', 'artifactsFolder', 'sessionId', 'createdAt'];
  const contract = interfaceSpec.contract || {};
  
  for (const key of requiredKeys) {
    if (!contract[key]) {
      console.log(`DESKTOP_BOUNDARY_OK=NO - Missing required key in contract: ${key}`);
      process.exit(1);
    }
  }
  
  // Check if README.md exists
  const readmePath = path.join(desktopDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    console.log('DESKTOP_BOUNDARY_OK=NO - README.md not found');
    process.exit(1);
  }
  
  // Verify the contract has proper structure with types
  if (!contract.sessionRoot.type || contract.sessionRoot.type !== 'string') {
    console.log('DESKTOP_BOUNDARY_OK=NO - sessionRoot type not properly defined');
    process.exit(1);
  }
  
  if (!contract.sessionId.type || contract.sessionId.type !== 'string') {
    console.log('DESKTOP_BOUNDARY_OK=NO - sessionId type not properly defined');
    process.exit(1);
  }
  
  console.log('DESKTOP_BOUNDARY_OK=YES');
  
} catch (error) {
  console.log(`DESKTOP_BOUNDARY_OK=NO - Error: ${error.message}`);
  process.exit(1);
}