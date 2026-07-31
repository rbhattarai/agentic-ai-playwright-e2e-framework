import fs from 'fs';
import path from 'path';

export type CertType = 'p12-to-pem' | 'custom-pem' | 'pfx-to-pem';
export type CertMatchType = 'exact' | 'glob' | 'regex';

export interface CertMatch {
  type: CertMatchType;
  value: string;
}

export interface CertProfileBase {
  certAlias?: string;
  passwordEnvVar?: string;
  metadata?: Record<string, string>;
}

export interface ConvertedCertProfile extends CertProfileBase {
  type: 'p12-to-pem' | 'pfx-to-pem';
  match: CertMatch;
}

export interface CustomPemCertProfile extends CertProfileBase {
  type: 'custom-pem';
  certPath: string;
  keyPath: string;
}

export type CertProfile = ConvertedCertProfile | CustomPemCertProfile;

export interface CertConfig {
  enabled: boolean;
  type?: CertType;
  role?: string;
  certFileName?: string;
  certPath?: string;
  keyPath?: string;
  passwordEnvVar?: string;
  profiles?: Record<string, CertProfile>;
}

export interface AppConfig {
  name: string;
  baseUrl: string;
  defaultCertProfile?: string;
  certConfig: CertConfig;
  description: string;
}

export interface AppRegistry {
  [appKey: string]: AppConfig;
}

interface ActiveAppEntry {
  config: AppConfig;
  selectedProfileName?: string;
}

export interface ResolvedCertProfile {
  profileName: string;
  certAlias: string;
  type: CertType;
  passwordEnvVar?: string;
  metadata: Record<string, string>;
  match?: CertMatch;
  certPath?: string;
  keyPath?: string;
}

export class AppManager {
  private static instance: AppManager;
  private appRegistry: AppRegistry;
  private activeApps: Map<string, ActiveAppEntry> = new Map();

  private constructor() {
    this.appRegistry = this.loadAppRegistry();
    this.initializeApps();
  }

  static getInstance(): AppManager {
    if (!AppManager.instance) {
      AppManager.instance = new AppManager();
    }
    return AppManager.instance;
  }

  /**
   * Load app registry from apps.config.json
   */
  private loadAppRegistry(): AppRegistry {
    const configPath = path.resolve(process.cwd(), 'apps.config.json');
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`App configuration file not found at: ${configPath}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(configContent);
  }

  /**
   * Initialize apps based on ACTIVE_APPS environment variable
   */
  private initializeApps(): void {
    const activeAppsEnv = process.env.ACTIVE_APPS || '';
    
    if (!activeAppsEnv) {
      console.warn('⚠️  No ACTIVE_APPS specified. Use -apps argument in run_test.sh');
      return;
    }

    const appSelections = activeAppsEnv.split(',').map(key => key.trim()).filter(Boolean);
    
    for (const appSelection of appSelections) {
      const { appKey, profileName } = this.parseAppSelection(appSelection);

      if (!this.appRegistry[appKey]) {
        throw new Error(`App '${appKey}' not found in apps.config.json`);
      }

      const appConfig = this.resolveEnvVariables(this.appRegistry[appKey]);
      this.activeApps.set(appKey, { config: appConfig, selectedProfileName: profileName });

      const profileLabel = this.getSelectedCertProfileName(appKey);
      if (profileLabel) {
        console.log(`✅ Loaded app: ${appKey} (${appConfig.name}) [profile: ${profileLabel}]`);
      } else {
        console.log(`✅ Loaded app: ${appKey} (${appConfig.name})`);
      }
    }
  }

  /**
   * Resolve environment variables in the app configuration
   */
  private resolveEnvVariables(config: AppConfig): AppConfig {
    const resolvedConfig = JSON.parse(JSON.stringify(config)); // Deep clone

    // Resolve baseUrl
    resolvedConfig.baseUrl = this.interpolateEnvVars(config.baseUrl);

    // Resolve cert paths if they exist in legacy config
    if (config.certConfig.certPath) {
      resolvedConfig.certConfig.certPath = this.interpolateEnvVars(config.certConfig.certPath);
    }
    if (config.certConfig.keyPath) {
      resolvedConfig.certConfig.keyPath = this.interpolateEnvVars(config.certConfig.keyPath);
    }

    // Resolve cert paths for profile-based config
    if (config.certConfig.profiles) {
      for (const [profileName, profile] of Object.entries(config.certConfig.profiles)) {
        if (profile.type === 'custom-pem') {
          resolvedConfig.certConfig.profiles[profileName].certPath = this.interpolateEnvVars(profile.certPath);
          resolvedConfig.certConfig.profiles[profileName].keyPath = this.interpolateEnvVars(profile.keyPath);
        }
      }
    }

    return resolvedConfig;
  }

  private parseAppSelection(selection: string): { appKey: string; profileName?: string } {
    const separatorIndex = selection.indexOf(':');
    if (separatorIndex === -1) {
      return { appKey: selection };
    }

    return {
      appKey: selection.slice(0, separatorIndex).trim(),
      profileName: selection.slice(separatorIndex + 1).trim() || undefined,
    };
  }

  private getActiveAppEntry(appKey: string): ActiveAppEntry {
    const entry = this.activeApps.get(appKey);

    if (!entry) {
      throw new Error(
        `App '${appKey}' is not active. Active apps: ${Array.from(this.activeApps.keys()).join(', ')}`
      );
    }

    return entry;
  }

  private getDefaultProfileName(config: AppConfig): string | undefined {
    if (config.defaultCertProfile) {
      return config.defaultCertProfile;
    }

    const profileNames = Object.keys(config.certConfig.profiles || {});
    return profileNames.length > 0 ? profileNames[0] : undefined;
  }

  private resolveLegacyCertProfile(config: AppConfig): ResolvedCertProfile {
    const metadata: Record<string, string> = {};
    if (config.certConfig.role) {
      metadata.role = config.certConfig.role;
    }

    if (config.certConfig.type === 'custom-pem') {
      return {
        profileName: 'default',
        certAlias: 'default',
        type: 'custom-pem',
        passwordEnvVar: config.certConfig.passwordEnvVar,
        metadata,
        certPath: config.certConfig.certPath,
        keyPath: config.certConfig.keyPath,
      };
    }

    return {
      profileName: config.certConfig.role || 'default',
      certAlias: config.certConfig.role || 'default',
      type: config.certConfig.type || 'p12-to-pem',
      passwordEnvVar: config.certConfig.passwordEnvVar,
      metadata,
      match: config.certConfig.certFileName
        ? { type: 'glob', value: config.certConfig.certFileName }
        : undefined,
    };
  }

  private resolveSelectedCertProfile(config: AppConfig, selectedProfileName?: string): ResolvedCertProfile | null {
    if (!config.certConfig.enabled) {
      return null;
    }

    if (!config.certConfig.profiles) {
      return this.resolveLegacyCertProfile(config);
    }

    const profileName = selectedProfileName || this.getDefaultProfileName(config);
    if (!profileName) {
      throw new Error(`No certificate profile configured for app '${config.name}'`);
    }

    const profile = config.certConfig.profiles[profileName];
    if (!profile) {
      throw new Error(`Certificate profile '${profileName}' not found for app '${config.name}'`);
    }

    return {
      profileName,
      certAlias: profile.certAlias || profileName,
      type: profile.type,
      passwordEnvVar: profile.passwordEnvVar,
      metadata: profile.metadata || {},
      match: profile.type === 'custom-pem' ? undefined : profile.match,
      certPath: profile.type === 'custom-pem' ? profile.certPath : undefined,
      keyPath: profile.type === 'custom-pem' ? profile.keyPath : undefined,
    };
  }

  /**
   * Interpolate environment variables in a string (e.g., ${VAR_NAME})
   */
  private interpolateEnvVars(str: string): string {
    return str.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      const value = process.env[varName];
      if (!value) {
        throw new Error(`Environment variable ${varName} is not set`);
      }
      return value;
    });
  }

  /**
   * Get configuration for a specific app
   */
  getAppConfig(appKey: string): AppConfig {
    return this.getActiveAppEntry(appKey).config;
  }

  /**
   * Get all active apps
   */
  getActiveApps(): string[] {
    return Array.from(this.activeApps.keys());
  }

  /**
   * Check if an app is active
   */
  isAppActive(appKey: string): boolean {
    return this.activeApps.has(appKey);
  }

  /**
   * Get cert configuration for an app
   */
  getCertConfig(appKey: string): CertConfig {
    return this.getAppConfig(appKey).certConfig;
  }

  /**
   * Get the selected certificate profile for an app.
   */
  getSelectedCertProfile(appKey: string): ResolvedCertProfile | null {
    const entry = this.getActiveAppEntry(appKey);
    return this.resolveSelectedCertProfile(entry.config, entry.selectedProfileName);
  }

  /**
   * Get the selected certificate profile name for an app.
   */
  getSelectedCertProfileName(appKey: string): string | undefined {
    const entry = this.getActiveAppEntry(appKey);
    return this.resolveSelectedCertProfile(entry.config, entry.selectedProfileName)?.profileName;
  }

  /**
   * Get base URL for an app
   */
  getBaseUrl(appKey: string): string {
    return this.getAppConfig(appKey).baseUrl;
  }

  /**
   * Get all available app keys from registry
   */
  getAvailableApps(): string[] {
    return Object.keys(this.appRegistry);
  }

  /**
   * Load all apps from registry (for use when ACTIVE_APPS is not set)
   * Useful for VSCode Test Explorer or direct npx playwright test runs
   */
  loadAllApps(): void {
    console.log('📱 Auto-loading all apps from apps.config.json...');
    const allAppKeys = this.getAvailableApps();
    
    // Clear existing active apps
    this.activeApps.clear();
    
    // Load all apps
    for (const appKey of allAppKeys) {
      const appConfig = this.resolveEnvVariables(this.appRegistry[appKey]);
      this.activeApps.set(appKey, { config: appConfig });
    }
    
    console.log(`✅ Loaded ${allAppKeys.length} apps: ${allAppKeys.join(', ')}`);
  }

  /**
   * Get app config from registry (even if not active)
   * Useful for accessing any app configuration
   */
  getAppConfigFromRegistry(appKey: string): AppConfig {
    const config = this.appRegistry[appKey];
    
    if (!config) {
      throw new Error(`App '${appKey}' not found in apps.config.json`);
    }

    return this.resolveEnvVariables(config);
  }

  /**
   * Get cert paths for an app (generated by run_test.sh)
   */
  getCertPaths(appKey: string): { certPath: string; keyPath: string; password: string } {
    const config = this.getAppConfig(appKey);
    const certProfile = this.getSelectedCertProfile(appKey);
    
    if (!config.certConfig.enabled) {
      throw new Error(`App '${appKey}' does not use certificates`);
    }

    if (!certProfile) {
      throw new Error(`No certificate profile selected for app '${appKey}'`);
    }

    if (certProfile.type === 'custom-pem') {
      // Custom PEM certificates - paths are directly in config
      return {
        certPath: certProfile.certPath!,
        keyPath: certProfile.keyPath!,
        password: certProfile.passwordEnvVar ? process.env[certProfile.passwordEnvVar] || '' : ''
      };
    } else {
      // P12/PFX converted to PEM - alias-based naming
      return {
        certPath: path.resolve(process.cwd(), `certs/${appKey}_${certProfile.certAlias}_cert.pem`),
        keyPath: path.resolve(process.cwd(), `certs/${appKey}_${certProfile.certAlias}_key.pem`),
        password: certProfile.passwordEnvVar ? process.env[certProfile.passwordEnvVar] || '' : ''
      };
    }
  }
}

// Export singleton instance
export const appManager = AppManager.getInstance();
