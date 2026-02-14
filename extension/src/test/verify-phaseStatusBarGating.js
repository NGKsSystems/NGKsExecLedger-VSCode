const path = require('path');
const fs = require('fs');

console.log('=== PHASE 3 STATUS BAR GATING VERIFICATION ===');

try {
  // Test the tier engine gating function
  const { isProOrHigher, Tier, getTier } = require('../../dist/core/tierEngine');
  
  if (!isProOrHigher || !getTier) {
    console.log('STATUSBAR_GATING_OK=NO - Missing tier engine functions');
    process.exit(1);
  }
  
  // Test 1: FREE tier should not get status bar
  delete process.env.EXECLEDGER_TIER;
  const freeTier = getTier();
  const freeGetsPro = isProOrHigher();
  
  if (freeTier !== 'FREE' || freeGetsPro !== false) {
    console.log(`STATUSBAR_GATING_OK=NO - FREE tier logic failed: tier=${freeTier}, isProOrHigher=${freeGetsPro}`);
    process.exit(1);
  }
  
  // Test 2: PRO tier should get status bar  
  process.env.EXECLEDGER_TIER = 'PRO';
  const proTier = getTier();
  const proGetsPro = isProOrHigher();
  
  if (proTier !== 'PRO' || proGetsPro !== true) {
    console.log(`STATUSBAR_GATING_OK=NO - PRO tier logic failed: tier=${proTier}, isProOrHigher=${proGetsPro}`);
    process.exit(1);
  }
  
  // Test 3: PREMIUM tier should get status bar
  process.env.EXECLEDGER_TIER = 'PREMIUM'; 
  const premiumTier = getTier();
  const premiumGetsPro = isProOrHigher();
  
  if (premiumTier !== 'PREMIUM' || premiumGetsPro !== true) {
    console.log(`STATUSBAR_GATING_OK=NO - PREMIUM tier logic failed: tier=${premiumTier}, isProOrHigher=${premiumGetsPro}`);
    process.exit(1);
  }
  
  // Test 4: Verify QuickPick command exists in package.json
  const packageJsonPath = path.join(__dirname, '../../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const commands = packageJson.contributes?.commands || [];
  const hasQuickPickCommand = commands.some(cmd => cmd.command === 'execLedger.openQuickPick');
  
  if (!hasQuickPickCommand) {
    console.log('STATUSBAR_GATING_OK=NO - execLedger.openQuickPick command not found in package.json');
    process.exit(1);
  }
  
  // Test 5: Verify tier configuration exists
  const config = packageJson.contributes?.configuration?.properties?.['execLedger.tier'];
  if (!config || !config.enum || !config.enum.includes('PRO')) {
    console.log('STATUSBAR_GATING_OK=NO - execLedger.tier configuration not found or incomplete');
    process.exit(1);
  }
  
  // Clean up
  delete process.env.EXECLEDGER_TIER;
  
  console.log('STATUSBAR_GATING_OK=YES');
  
} catch (error) {
  console.log(`STATUSBAR_GATING_OK=NO - Error: ${error.message}`);
  process.exit(1);
}