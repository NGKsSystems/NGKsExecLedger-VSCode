/**
 * Tier Engine - Determines user access tier for NGKs ExecLedger
 */

export enum Tier {
  FREE = "FREE",
  PRO = "PRO", 
  PREMIUM = "PREMIUM"
}

/**
 * Determine current user tier based on settings and environment
 * Priority order:
 * 1. VS Code setting: execLedger.tier
 * 2. Environment variable: EXECLEDGER_TIER
 * 3. Default: FREE
 */
export function getTier(): Tier {
  // Check VS Code workspace configuration
  try {
    const vscode = require('vscode');
    const config = vscode.workspace.getConfiguration('execLedger');
    const settingValue = config.get('tier') as string;
    if (settingValue && isValidTier(settingValue)) {
      return settingValue as Tier;
    }
  } catch (error) {
    // Fall through to environment variable check - vscode might not be available in tests
  }
  
  // Check environment variable
  const envTier = process.env.EXECLEDGER_TIER;
  if (envTier && isValidTier(envTier)) {
    return envTier as Tier;
  }
  
  // Default to FREE
  return Tier.FREE;
}

/**
 * Check if user is PRO tier or higher
 */
export function isProOrHigher(): boolean {
  const tier = getTier();
  return tier === Tier.PRO || tier === Tier.PREMIUM;
}

/**
 * Check if user is PREMIUM tier
 */
export function isPremium(): boolean {
  return getTier() === Tier.PREMIUM;
}

/**
 * Validate if a string is a valid tier value
 */
function isValidTier(value: string): boolean {
  return Object.values(Tier).includes(value as Tier);
}