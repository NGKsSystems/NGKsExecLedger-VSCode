const path = require('path');
const fs = require('fs');

console.log('=== PHASE 1 TIER ENGINE VERIFICATION ===');

let allPassed = true;

// Test the tier engine by requiring it
try {
  // Load the compiled TypeScript module
  const tierEngineModule = require('../../dist/core/tierEngine');
  
  if (!tierEngineModule) {
    console.log('TIER_ENGINE_OK=NO - Module not found');
    process.exit(1);
  }
  
  const { Tier, getTier, isProOrHigher, isPremium } = tierEngineModule;
  
  // Test 1: Default should be FREE
  delete process.env.EXECLEDGER_TIER;
  const defaultTier = getTier();
  if (defaultTier !== 'FREE') {
    console.log(`TIER_ENGINE_OK=NO - Default tier should be FREE, got ${defaultTier}`);
    process.exit(1);
  }
  
  // Test 2: Environment variable PRO should return PRO
  process.env.EXECLEDGER_TIER = 'PRO';
  const proTier = getTier();
  if (proTier !== 'PRO') {
    console.log(`TIER_ENGINE_OK=NO - PRO env should return PRO, got ${proTier}`);
    process.exit(1);
  }
  
  // Test 3: Environment variable garbage should return FREE
  process.env.EXECLEDGER_TIER = 'GARBAGE';
  const garbageTier = getTier();
  if (garbageTier !== 'FREE') {
    console.log(`TIER_ENGINE_OK=NO - Garbage env should return FREE, got ${garbageTier}`);
    process.exit(1);
  }
  
  // Test 4: isProOrHigher function
  process.env.EXECLEDGER_TIER = 'PRO';
  if (!isProOrHigher()) {
    console.log('TIER_ENGINE_OK=NO - isProOrHigher() should return true for PRO');
    process.exit(1);  
  }
  
  // Test 5: isPremium function
  process.env.EXECLEDGER_TIER = 'PREMIUM';
  if (!isPremium()) {
    console.log('TIER_ENGINE_OK=NO - isPremium() should return true for PREMIUM');
    process.exit(1);
  }
  
  // Clean up
  delete process.env.EXECLEDGER_TIER;
  
  console.log('TIER_ENGINE_OK=YES');
  
} catch (error) {
  console.log(`TIER_ENGINE_OK=NO - Error: ${error.message}`);
  process.exit(1);
}