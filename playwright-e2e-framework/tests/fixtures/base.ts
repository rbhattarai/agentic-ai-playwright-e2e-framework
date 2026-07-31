import { test as base, APIRequestContext, Browser, BrowserContext, chromium, Page, request } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { appManager, AppConfig } from '../../utils/app-manager';

/**
 * Unified fixture supporting both single-app and multi-app modes
 * 
 * SINGLE-APP MODE (Legacy):
 *   test('my test', async ({ page, context, requestContext }) => {
 *     await page.goto(process.env.APP_URL);
 *   });
 * 
 * MULTI-APP MODE:
 *   test('my test', async ({ apps }) => {
 *     await apps['loan-app'].page.goto(apps['loan-app'].baseUrl);
 *   });
 */

export type AppContext = {
  page: Page;
  context: BrowserContext;
  apiContext: APIRequestContext;
  config: AppConfig;
  baseUrl: string;
};

export type AppContexts = {
  [appKey: string]: AppContext;
};

type UnifiedFixtures = {
  browser: Browser;
  // Single-app mode fixtures (legacy)
  page: Page;
  context: BrowserContext;
  requestContext: APIRequestContext;
  // Multi-app mode fixtures
  apps: AppContexts;
};

export const test = base.extend<UnifiedFixtures>({
  browser: async ({}, use) => {
    const headless = process.env.PLAYWRIGHT_HEADLESS === "true";
    console.log("🚀 Initializing Browser in PLAYWRIGHT_HEADLESS:", headless);
    
    const browser = await chromium.launch({ 
      headless: headless,
      slowMo: 500,
      args: ['--start-maximized'], 
    });
    
    await use(browser);
    await browser.close();
  },

  // ===========================================
  // MULTI-APP MODE FIXTURE
  // ===========================================
  apps: async ({ browser }, use) => {
    const activeAppsEnv = process.env.ACTIVE_APPS;
    
    // If ACTIVE_APPS not set, auto-load all apps from apps.config.json
    // This enables tests to run via VSCode Test Explorer or direct npx playwright test
    if (!activeAppsEnv) {
      console.log('⚙️  Auto-loading apps (ACTIVE_APPS not set)');
      try {
        appManager.loadAllApps();
      } catch (error) {
        console.warn('⚠️  Could not auto-load apps:', error);
        console.log('ℹ️  Running in single-app mode');
        await use({});
        return;
      }
    }

    const activeApps = appManager.getActiveApps();
    
    if (activeApps.length === 0) {
      console.log('ℹ️  No apps configured, using empty context');
      await use({});
      return;
    }

    console.log(`📱 Multi-app mode: ${activeApps.join(', ')}`);
    const appContexts: AppContexts = {};

    // Initialize context for each active app
    for (const appKey of activeApps) {
      const appConfig = appManager.getAppConfig(appKey);
      console.log(`  🔧 Setting up: ${appKey}`);

      // Create browser context with or without certificate
      let context: BrowserContext;
      
      if (appConfig.certConfig.enabled) {
        try {
          const certPaths = appManager.getCertPaths(appKey);
          
          // Check if certificate files exist
          const certExists = fs.existsSync(certPaths.certPath);
          const keyExists = fs.existsSync(certPaths.keyPath);
          
          if (certExists && keyExists) {
            console.log(`    🔐 Certificate enabled`);
            context = await browser.newContext({
              ignoreHTTPSErrors: true,
              clientCertificates: [{
                origin: new URL(appConfig.baseUrl).origin,
                certPath: path.resolve(certPaths.certPath),
                keyPath: path.resolve(certPaths.keyPath),
                passphrase: certPaths.password
              }],
              viewport: { width: 1920, height: 1080 },
            });
          } else {
            console.warn(`    ⚠️  Certificate files not found, proceeding without cert`);
            console.warn(`       Run './run_test.sh' to generate certificates`);
            context = await browser.newContext({
              ignoreHTTPSErrors: true,
              viewport: { width: 1920, height: 1080 },
            });
          }
        } catch (error) {
          console.warn(`    ⚠️  Certificate setup failed: ${error}`);
          console.warn(`       Proceeding without certificate`);
          context = await browser.newContext({
            ignoreHTTPSErrors: true,
            viewport: { width: 1920, height: 1080 },
          });
        }
      } else {
        console.log(`    🔓 No certificate`);
        context = await browser.newContext({
          ignoreHTTPSErrors: true,
          viewport: { width: 1920, height: 1080 },
        });
      }
      
      context.setDefaultTimeout(60 * 1000);

      // Create page for the context
      const page = await context.newPage();

      // Create API context
      let apiContext: APIRequestContext;
      
      if (appConfig.certConfig.enabled) {
        try {
          const certPaths = appManager.getCertPaths(appKey);
          
          // Check if certificate files exist
          const certExists = fs.existsSync(certPaths.certPath);
          const keyExists = fs.existsSync(certPaths.keyPath);
          
          if (certExists && keyExists) {
            apiContext = await request.newContext({
              baseURL: appConfig.baseUrl,
              ignoreHTTPSErrors: true,
              extraHTTPHeaders: {
                'Content-Type': 'application/json'
              },
              clientCertificates: [{
                origin: new URL(appConfig.baseUrl).origin,
                certPath: path.resolve(certPaths.certPath),
                keyPath: path.resolve(certPaths.keyPath),
                passphrase: certPaths.password
              }]
            });
          } else {
            // Fallback: create API context without certificate
            apiContext = await request.newContext({
              baseURL: appConfig.baseUrl,
              ignoreHTTPSErrors: true,
              extraHTTPHeaders: {
                'Content-Type': 'application/json'
              }
            });
          }
        } catch (error) {
          // Fallback: create API context without certificate
          apiContext = await request.newContext({
            baseURL: appConfig.baseUrl,
            ignoreHTTPSErrors: true,
            extraHTTPHeaders: {
              'Content-Type': 'application/json'
            }
          });
        }
      } else {
        apiContext = await request.newContext({
          baseURL: appConfig.baseUrl,
          ignoreHTTPSErrors: true,
          extraHTTPHeaders: {
            'Content-Type': 'application/json'
          }
        });
      }

      appContexts[appKey] = {
        page,
        context,
        apiContext,
        config: appConfig,
        baseUrl: appConfig.baseUrl
      };
    }

    console.log(`✅ All apps initialized`);
    
    await use(appContexts);

    // Cleanup all contexts
    console.log('🧹 Cleaning up app contexts...');
    for (const appKey of Object.keys(appContexts)) {
      await appContexts[appKey].apiContext.dispose();
      await appContexts[appKey].context.close();
    }
  },

  // ===========================================
  // SINGLE-APP MODE FIXTURES (Backward Compatibility)
  // ===========================================
  context: async ({ browser }, use) => {
    // Skip single-app setup if in multi-app mode
    if (process.env.ACTIVE_APPS) {
      // @ts-ignore - provide empty context for multi-app mode
      await use(null);
      return;
    }

    if (!process.env.APP_URL) {
      throw new Error('Missing APP_URL in .env or no apps configured in apps.config.json');
    }

    let context: BrowserContext;

    // Check if certificate paths are provided
    const hasCertificates = process.env.CERT_PATH && process.env.CERT_KEY;
    
    if (hasCertificates) {
      console.log('🔐 Single-app mode with certificate');
      context = await browser.newContext({
        ignoreHTTPSErrors: true,
        clientCertificates: [{
          origin: new URL(process.env.APP_URL!).origin,
          certPath: path.resolve(process.env.CERT_PATH!),
          keyPath: path.resolve(process.env.CERT_KEY!),
          passphrase: process.env.P12_CERT_PASSWORD || ''
        }],
        viewport: { width: 1920, height: 1080 },
      });
    } else {
      console.log('🔓 Single-app mode without certificate');
      context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1920, height: 1080 },
      });
    }
    
    context.setDefaultTimeout(60 * 1000);
    await use(context);
    await context.close();
  },

  page: async ({ context }, use) => {
    // Skip if in multi-app mode
    if (process.env.ACTIVE_APPS) {
      // @ts-ignore - provide empty page for multi-app mode
      await use(null);
      return;
    }

    const page = await context.newPage();
    await use(page);
  },

  requestContext: async ({}, use) => {
    // Skip if in multi-app mode
    if (process.env.ACTIVE_APPS) {
      // @ts-ignore - provide empty requestContext for multi-app mode
      await use(null);
      return;
    }

    if (!process.env.APP_URL) {
      throw new Error('Missing APP_URL in .env');
    }

    let apiContext: APIRequestContext;
    const hasCertificates = process.env.CERT_PATH && process.env.CERT_KEY;

    if (hasCertificates) {
      apiContext = await request.newContext({
        baseURL: process.env.APP_URL,
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: {
          'Content-Type': 'application/json'
        },
        clientCertificates: [{
          origin: new URL(process.env.APP_URL).origin,
          certPath: path.resolve(process.env.CERT_PATH!),
          keyPath: path.resolve(process.env.CERT_KEY!),
          passphrase: process.env.P12_CERT_PASSWORD || ''
        }]
      });
    } else {
      apiContext = await request.newContext({
        baseURL: process.env.APP_URL,
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: {
          'Content-Type': 'application/json'
        }
      });
    }
    
    await use(apiContext);
    await apiContext.dispose();
  }
});

export { expect } from '@playwright/test';
