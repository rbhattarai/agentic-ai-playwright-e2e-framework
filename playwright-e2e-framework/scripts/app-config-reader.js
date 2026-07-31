#!/usr/bin/env node

const fs = require('fs');

function readConfig(configPath) {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function print(key, value = '') {
  console.log(`${key}\t${value ?? ''}`);
}

function listApps(configPath) {
  const config = readConfig(configPath);
  console.log(Object.keys(config).join(','));
}

function resolveCertConfig(configPath, appKey, explicitProfile) {
  const config = readConfig(configPath);
  const app = config[appKey];

  if (!app) {
    console.error(`APP_NOT_FOUND\t${appKey}`);
    process.exit(2);
  }

  const certConfig = app.certConfig || { enabled: false };

  if (!certConfig.enabled) {
    print('enabled', 'false');
    return;
  }

  if (certConfig.profiles) {
    const profileName = explicitProfile || app.defaultCertProfile || Object.keys(certConfig.profiles)[0];
    const profile = certConfig.profiles[profileName];

    if (!profile) {
      console.error(`PROFILE_NOT_FOUND\t${profileName}`);
      process.exit(3);
    }

    print('enabled', 'true');
    print('profileName', profileName);
    print('type', profile.type);
    print('certAlias', profile.certAlias || profileName);
    if (profile.match) {
      print('matchType', profile.match.type);
      print('matchValue', profile.match.value);
    }
    if (profile.certPath) {
      print('certPath', profile.certPath);
    }
    if (profile.keyPath) {
      print('keyPath', profile.keyPath);
    }
    if (profile.passwordEnvVar) {
      print('passwordEnvVar', profile.passwordEnvVar);
    }
    return;
  }

  print('enabled', 'true');
  print('profileName', certConfig.role || 'default');
  print('type', certConfig.type || 'p12-to-pem');
  print('certAlias', certConfig.role || 'default');
  if (certConfig.certFileName) {
    print('matchType', 'glob');
    print('matchValue', certConfig.certFileName);
  }
  if (certConfig.certPath) {
    print('certPath', certConfig.certPath);
  }
  if (certConfig.keyPath) {
    print('keyPath', certConfig.keyPath);
  }
  if (certConfig.passwordEnvVar) {
    print('passwordEnvVar', certConfig.passwordEnvVar);
  }
}

function main() {
  const [command, configPath, appKey, explicitProfile] = process.argv.slice(2);

  switch (command) {
    case 'list-apps':
      listApps(configPath);
      break;
    case 'resolve-cert-config':
      resolveCertConfig(configPath, appKey, explicitProfile);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main();