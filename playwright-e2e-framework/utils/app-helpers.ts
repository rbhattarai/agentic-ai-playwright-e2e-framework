import { appManager } from './app-manager';
import fs from 'fs';
import path from 'path';

/**
 * Helper utilities for multi-app testing
 */

/**
 * Print information about configured apps
 */
export function printAppInfo(): void {
  console.log('\n📱 Multi-App Configuration Summary\n');
  console.log('═'.repeat(60));
  
  const availableApps = appManager.getAvailableApps();
  const activeApps = appManager.getActiveApps();
  
  console.log(`\n🔧 Available Apps (${availableApps.length}):`);
  availableApps.forEach(appKey => {
    const isActive = activeApps.includes(appKey);
    const icon = isActive ? '✓' : '○';
    console.log(`  ${icon} ${appKey}`);
  });
  
  if (activeApps.length > 0) {
    console.log(`\n✅ Active Apps (${activeApps.length}):`);
    activeApps.forEach(appKey => {
      const config = appManager.getAppConfig(appKey);
      console.log(`\n  📌 ${appKey}:`);
      console.log(`     Name: ${config.name}`);
      console.log(`     URL: ${config.baseUrl}`);
      console.log(`     Certificate: ${config.certConfig.enabled ? '🔐 Yes' : '🔓 No'}`);
      if (config.certConfig.enabled) {
        const certProfile = appManager.getSelectedCertProfile(appKey);
        if (certProfile) {
          console.log(`     Profile: ${certProfile.profileName}`);
          console.log(`     Alias: ${certProfile.certAlias}`);
          console.log(`     Type: ${certProfile.type}`);
          if (certProfile.metadata.role) {
            console.log(`     Role: ${certProfile.metadata.role}`);
          }
        }
      }
    });
  } else {
    console.log('\n⚠️  No active apps configured');
    console.log('   Use: ./run_test.sh -apps=app1,app2,... -env=dev');
  }
  
  console.log('\n' + '═'.repeat(60) + '\n');
}

/**
 * Validate app configuration
 */
export function validateAppConfig(appKey: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    const config = appManager.getAppConfig(appKey);
    
    // Validate URL
    try {
      new URL(config.baseUrl);
    } catch {
      errors.push(`Invalid base URL: ${config.baseUrl}`);
    }
    
    // Validate certificate configuration
    if (config.certConfig.enabled) {
      const certProfile = appManager.getSelectedCertProfile(appKey);

      if (!certProfile) {
        errors.push('No certificate profile selected');
      } else if (certProfile.type === 'p12-to-pem' || certProfile.type === 'pfx-to-pem') {
        // Check if certificate file exists
        const certMatch = certProfile.match;
        const certsDir = path.resolve(process.cwd(), 'certs');

        if (!certMatch) {
          errors.push('No certificate match rule configured for converted certificate profile');
        }
        
        if (!fs.existsSync(certsDir)) {
          errors.push('certs/ directory not found');
        } else if (certMatch) {
          const files = fs.readdirSync(certsDir);
          const matches = files.filter(file => matchesCertificate(file, certMatch.type, certMatch.value));
          
          if (matches.length === 0) {
            errors.push(`No certificate file found matching rule: ${certMatch.type}=${certMatch.value}`);
          } else if (matches.length > 1) {
            warnings.push(`Multiple certificates match rule: ${certMatch.type}=${certMatch.value}`);
          }
        }
        
        // Check password environment variable
        const passwordVar = certProfile.passwordEnvVar;
        if (passwordVar && !process.env[passwordVar]) {
          warnings.push(`Environment variable ${passwordVar} not set`);
        }
      } else if (certProfile.type === 'custom-pem') {
        // Validate custom PEM paths
        if (!certProfile.certPath) {
          errors.push('certPath not specified for custom-pem type');
        }
        if (!certProfile.keyPath) {
          errors.push('keyPath not specified for custom-pem type');
        }
      }
    }
    
  } catch (error) {
    errors.push(`App '${appKey}' is not active or configured`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate all active apps
 */
export function validateAllApps(): void {
  console.log('\n🔍 Validating App Configurations\n');
  console.log('═'.repeat(60));
  
  const activeApps = appManager.getActiveApps();
  
  if (activeApps.length === 0) {
    console.log('\n⚠️  No active apps to validate');
    console.log('   Use: ./run_test.sh -apps=app1,app2,... -env=dev\n');
    return;
  }
  
  let allValid = true;
  
  for (const appKey of activeApps) {
    const result = validateAppConfig(appKey);
    
    console.log(`\n📌 ${appKey}:`);
    
    if (result.valid) {
      console.log('   ✅ Configuration valid');
    } else {
      console.log('   ❌ Configuration invalid');
      allValid = false;
    }
    
    if (result.errors.length > 0) {
      console.log('   Errors:');
      result.errors.forEach(error => console.log(`     ❌ ${error}`));
    }
    
    if (result.warnings.length > 0) {
      console.log('   Warnings:');
      result.warnings.forEach(warning => console.log(`     ⚠️  ${warning}`));
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  
  if (allValid) {
    console.log('\n✅ All app configurations are valid!\n');
  } else {
    console.log('\n❌ Some app configurations have errors. Please fix them before running tests.\n');
  }
}

/**
 * Get app by role (for backward compatibility scenarios)
 */
export function getAppByRole(role: string): string | null {
  const activeApps = appManager.getActiveApps();
  
  for (const appKey of activeApps) {
    const certProfile = appManager.getSelectedCertProfile(appKey);
    if (certProfile?.metadata.role === role) {
      return appKey;
    }
  }
  
  return null;
}

/**
 * Wait for all app pages to be ready
 */
export async function waitForAppsReady(
  apps: any,
  timeout: number = 30000
): Promise<void> {
  const startTime = Date.now();
  const appKeys = Object.keys(apps);
  
  console.log(`⏳ Waiting for ${appKeys.length} apps to be ready...`);
  
  const promises = appKeys.map(async (appKey) => {
    const app = apps[appKey];
    try {
      await app.page.waitForLoadState('networkidle', { timeout });
      console.log(`✅ ${appKey} ready`);
    } catch (error) {
      console.log(`⚠️  ${appKey} timed out`);
      throw error;
    }
  });
  
  await Promise.all(promises);
  
  const elapsed = Date.now() - startTime;
  console.log(`✅ All apps ready in ${elapsed}ms`);
}

/**
 * Close all app contexts
 */
export async function closeAllApps(apps: any): Promise<void> {
  const appKeys = Object.keys(apps);
  console.log(`🧹 Closing ${appKeys.length} app contexts...`);
  
  for (const appKey of appKeys) {
    try {
      await apps[appKey].apiContext.dispose();
      await apps[appKey].context.close();
      console.log(`✅ Closed ${appKey}`);
    } catch (error) {
      console.log(`⚠️  Error closing ${appKey}:`, error);
    }
  }
}

function matchesCertificate(fileName: string, matchType: 'exact' | 'glob' | 'regex', matchValue: string): boolean {
  if (matchType === 'exact') {
    return fileName === matchValue;
  }

  if (matchType === 'regex') {
    return new RegExp(matchValue).test(fileName);
  }

  const pattern = matchValue
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${pattern}$`).test(fileName);
}

/**
 * Take screenshots of all apps
 */
export async function screenshotAllApps(
  apps: any,
  prefix: string = 'app'
): Promise<void> {
  const appKeys = Object.keys(apps);
  const screenshotDir = path.resolve(process.cwd(), 'test-results', 'screenshots');
  
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  
  for (const appKey of appKeys) {
    const filename = `${prefix}_${appKey}_${Date.now()}.png`;
    const filepath = path.join(screenshotDir, filename);
    
    try {
      await apps[appKey].page.screenshot({ path: filepath });
      console.log(`📸 Screenshot saved: ${filename}`);
    } catch (error) {
      console.log(`⚠️  Failed to screenshot ${appKey}`);
    }
  }
}

/**
 * Get environment info
 */
export function getEnvironmentInfo(): {
  env: string;
  activeApps: string[];
  headless: boolean;
  timestamp: string;
} {
  return {
    env: process.env.ENV || 'unknown',
    activeApps: appManager.getActiveApps(),
    headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
    timestamp: new Date().toISOString()
  };
}
