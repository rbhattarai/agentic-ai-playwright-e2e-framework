import fs from 'fs';
import path from 'path';
import axios from 'axios';
import https from 'https';
import FormData from 'form-data';
import { execSync } from 'child_process';

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || '';
const XRAY_TOKEN = process.env.JIRA_XRAY_API_TOKEN || '';

if (!JIRA_BASE_URL || !XRAY_TOKEN) {
  console.error('❌ Missing JIRA_BASE_URL or JIRA_XRAY_API_TOKEN');
  process.exit(1);
}

const XRAY_JSON_ENDPOINT = `${JIRA_BASE_URL}/rest/raven/1.0/import/execution/cucumber`;
const JIRA_API_ENDPOINT = `${JIRA_BASE_URL}/rest/api/2`;

const httpsAgentOptions: any = { keepAlive: true };
if (process.env.XRAY_CA_CERT_PATH) {
  try {
    httpsAgentOptions.ca = fs.readFileSync(process.env.XRAY_CA_CERT_PATH);
  } catch (e: any) {
    console.warn('⚠️ Could not read XRAY_CA_CERT_PATH:', e.message || e);
  }
}
if (process.env.SKIP_TLS_VERIFY === 'true') httpsAgentOptions.rejectUnauthorized = false;
const httpsAgent = new https.Agent(httpsAgentOptions);

const axiosInstance = axios.create({
  httpsAgent,
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
  validateStatus: () => true,
});

async function getIssueType(issueKey: string): Promise<string | null> {
  try {
    const resp = await axiosInstance.get(`${JIRA_API_ENDPOINT}/issue/${issueKey}?fields=issuetype`, {
      headers: { Authorization: `Bearer ${XRAY_TOKEN}` },
    });
    return resp.data?.fields?.issuetype?.name || null;
  } catch {
    return null;
  }
}

function scanTestFiles(): string[] {
  // Scan .spec.ts files for Jira keys in test names and tags
  const allKeys = new Set<string>();
  const keyRegex = /\b[A-Z]+-\d+\b/g;
  
  function scanDirectory(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.spec.ts')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const matches = content.match(keyRegex);
        matches?.forEach(k => allKeys.add(k));
      }
    }
  }
  
  scanDirectory('tests');
  return Array.from(allKeys);
}

async function createTestExecution(linkedKeys: string[]): Promise<string | null> {
  console.log('🧩 Creating new Test Execution in Jira...');
  const info = {
    fields: {
      project: { key: process.env.JIRA_PROJECT_KEY },
      summary: `Automated Execution - ${new Date().toISOString()}`,
      description: `Created automatically by Playwright integration.\nLinked Tests: ${linkedKeys.join(', ') || 'N/A'}\n\nThis description is required by Jira configuration.`,
      issuetype: { name: 'Test Execution' },
    },
  };

  try {
    const resp = await axiosInstance.post(`${JIRA_API_ENDPOINT}/issue`, info, {
      headers: { Authorization: `Bearer ${XRAY_TOKEN}`, 'Content-Type': 'application/json' },
    });
    const execKey = resp.data?.key;
    console.log(`✅ Created new Test Execution: ${execKey}`);

    // Link related issues
    for (const key of linkedKeys) {
      try {
        await axiosInstance.post(`${JIRA_API_ENDPOINT}/issueLink`, {
          type: { name: 'Relates' },
          inwardIssue: { key: execKey },
          outwardIssue: { key },
        }, { headers: { Authorization: `Bearer ${XRAY_TOKEN}`, 'Content-Type': 'application/json' } });
        console.log(`🔗 Linked ${execKey} -> ${key}`);
      } catch (err: any) {
        console.warn(`⚠️ Could not link ${key}:`, err.response?.status || err.message);
      }
    }

    return execKey;
  } catch (err: any) {
    console.error('❌ Failed to create Test Execution:', err.response?.data || err.message);
    return null;
  }
}

// Convert Playwright JSON to Cucumber-compatible format for Xray
function convertPlaywrightToCucumber(playwrightJson: any, execKey: string): any[] {
  const cucumberData: any[] = [];

  function extractTags(title: string): any[] {
    const tags = title.match(/@\w+-\d+|\b@\w+\b/g) || [];
    return tags.map(tag => ({ name: tag, line: 1 }));
  }
  function processSuite(suite: any, parentTitles: string[] = []) {
    const fullTitle = [...parentTitles, suite.title].filter(Boolean).join(' - ');
    const featureTags = extractTags(fullTitle);
    
    if (suite.specs && suite.specs.length > 0) {
      const feature: any = {
        id: fullTitle.toLowerCase().replace(/\s+/g, '-'),
        name: fullTitle,
        description: '',
        line: 1,
        keyword: 'Feature',
        tags: featureTags,
        elements: [] as any[],
        uri: suite.file
      };

      suite.specs.forEach((spec: any, index: number) => {
        const scenarioTags = extractTags(spec.title);
        const scenario: any = {
          id: `${feature.id};${spec.title.toLowerCase().replace(/\s+/g, '-')}`,
          name: spec.title,
          line: index + 1,
          keyword: 'Scenario',
          tags: [...featureTags, ...scenarioTags],
          steps: [] as any[],
          executionKey: execKey,
          type: "scenario"
        };
      
      if (spec.tests) {
         spec.tests.forEach((test: any) => {
          test.results.forEach((result: any, stepIndex: number) => {
            scenario.steps.push({
              name: test.title || `Step ${stepIndex + 1}`,
              line: stepIndex + 1,
              keyword: stepIndex === 0 ? 'Given' : 'And',
              result: {
                status: result.status, 
                duration: result.duration * 1000000 //Convert to nanoseconds
              }
            });
          });
        });
      }

      //Add execKey to the scenario
      scenario.executionKey = execKey;
      feature.elements.push(scenario);
    });

    cucumberData.push(feature);
  }

  if (suite.suites) {
    suite.suites.forEach((childSuite: any) => processSuite(childSuite, [...parentTitles, suite.title]));  
  }
}

processSuite(playwrightJson);

return cucumberData;
}

// Update the converted JSON with Test Execution key
async function updateCucumberJSONWithTestExecutionKey(jsonPath: string, execKey: string) {
  try {
    const rawData = fs.readFileSync(jsonPath, 'utf-8');
    const cucumberData = JSON.parse(rawData);

    cucumberData.forEach((feature: any) => {
      if (!feature.tags.some((tag: any) => tag.name === `@${execKey}`)) {
        feature.tags.unshift({ name: `@${execKey}`, line: 1 });
      }

      feature.elements.forEach((scenario: any) => {
        if (!scenario.tags.some((tag: any) => tag.name === `@${execKey}`)) {
          scenario.tags.unshift({ name: `@${execKey}`, line: 1 });
        }
      });
    });

    fs.writeFileSync(jsonPath, JSON.stringify(cucumberData, null, 2), 'utf-8');
    console.log(`✅ Successfully updated Cucumber JSON with Test Execution key ${execKey}`);
    return execKey;
  } catch (err) {
    console.error('❌ Failed to update Cucumber JSON:', err); 
  }
}

// Function to upload cucumber.json to test execution key
async function tryJsonUpload(jsonPath: string, execKey: string | null) {
  const buf = fs.readFileSync(jsonPath);
  const url = execKey
    ? `${XRAY_JSON_ENDPOINT}?testExecutionKey=${encodeURIComponent(execKey)}`
    : XRAY_JSON_ENDPOINT;

  console.log(`📤 Posting buffered JSON to ${url} (${buf.length} bytes)`);

  const resp = await axiosInstance.post(url, buf, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${XRAY_TOKEN}`,
      'Content-Length': String(buf.length),
    },
    responseType: 'text',
  });

  const raw = resp.data;
  let parsed: any = null;
  try { 
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; 
  } catch(e) { 
    console.warn('Error with TryJsonUpload: ', e); 
  }

  return { status: resp.status, parsed, raw };
}

async function tryCurlFallback(jsonPath: string, execKey: string | null) {
  console.log('⚙️ Running curl fallback upload...');
  const execFlag = execKey ? `?testExecutionKey=${execKey}` : '';
  const cmd = `curl -H "Content-Type: application/json" -X POST --data @${jsonPath} "${XRAY_JSON_ENDPOINT}${execFlag}" -H "Authorization: Bearer ${XRAY_TOKEN}"`;
  console.log(`🐚 ${cmd}`);

  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    let parsed: any = null;
    try {
      parsed = JSON.parse(output);
    } catch (e) {
      console.warn('⚠️ curl response was not valid JSON:', e);
    }

    if (parsed?.error?.includes('Description is required')) {
      console.error('❌ Jira configuration requires a Description field. Ensure Test Execution creation includes a description.');
    }

    return parsed;
  } catch (err: any) {
    console.error('❌ curl fallback failed:', err?.stderr?.toString() || err?.message || err);
    return null;
  }
}

async function attachHtmlToExecution(execKey: string | null, htmlPath: string, coveragePath?: string) {
  if (!execKey || !fs.existsSync(htmlPath)) return;
  
  console.log(`📎 Attaching HTML reports to ${execKey}`);
  
  // Attach main HTML report
  const form1 = new FormData();
  form1.append('file', fs.createReadStream(htmlPath));
  await axiosInstance.post(`${JIRA_API_ENDPOINT}/issue/${execKey}/attachments`, form1, {
    headers: {
      ...form1.getHeaders(),
      Authorization: `Bearer ${XRAY_TOKEN}`,
      'X-Atlassian-Token': 'no-check',
    },
  });
  console.log(`✅ Main HTML report attached to ${execKey}`);
  
  // Attach coverage report if it exists
  if (coveragePath && fs.existsSync(coveragePath)) {
    const form2 = new FormData();
    form2.append('file', fs.createReadStream(coveragePath));
    await axiosInstance.post(`${JIRA_API_ENDPOINT}/issue/${execKey}/attachments`, form2, {
      headers: {
        ...form2.getHeaders(),
        Authorization: `Bearer ${XRAY_TOKEN}`,
        'X-Atlassian-Token': 'no-check',
      },
    });
    console.log(`✅ Coverage report attached to ${execKey}`);
  }
}

function extractExecKey(parsed: any) {
  return parsed?.testExecIssue?.key || parsed?.testExecIssueKey || parsed?.key || null;
}

(async function main() {
  const playwrightJsonPath = path.join('reports', 'results.json');
  const cucumberJsonPath = path.join('reports', 'xray-cucumber.json');
  const htmlPath = path.join('reports', 'index.html');
  const coveragePath = path.join('reports', 'coverage-report.html');
  
  if (!fs.existsSync(playwrightJsonPath)) {
    console.error('❌ Playwright results.json not found at', playwrightJsonPath);
    console.log('ℹ️  Run tests first to generate the report: npm test');
    process.exit(1);
  }

  console.log('🔍 Scanning test files for Jira keys...');
  const keys = scanTestFiles();
  console.log('Found keys:', keys.length > 0 ? keys.join(', ') : 'None');

  const issueTypeMap: Record<string, string> = {};
  for (const k of keys) issueTypeMap[k] = (await getIssueType(k)) || 'Unknown';
  console.log('Issue Type Map:', issueTypeMap);

  let execKey = Object.entries(issueTypeMap).find(([, v]) => v === 'Test Execution')?.[0] || null;
  
  if (!execKey) {
     execKey = await createTestExecution(keys.filter(k => issueTypeMap[k] !== 'Unknown'));
     console.log("New Test Execution created: " + execKey);
  }
  
  if (!execKey) {
    console.error('❌ Could not determine or create Test Execution.');
    console.log('ℹ️  Make sure to tag your tests with Jira keys (e.g., @SCRUM-123) or set JIRA_PROJECT_KEY in environment');
    process.exit(1);
  }

  // Convert Playwright JSON to Cucumber format for Xray
  console.log('🔄 Converting Playwright results to Cucumber format for Xray...');
  const playwrightData = JSON.parse(fs.readFileSync(playwrightJsonPath, 'utf-8'));
  const cucumberData = convertPlaywrightToCucumber(playwrightData, execKey);
  fs.writeFileSync(cucumberJsonPath, JSON.stringify(cucumberData, null, 2), 'utf-8');
  console.log(`✅ Converted results saved to ${cucumberJsonPath}`);

  // Update with Test Execution key
  await updateCucumberJSONWithTestExecutionKey(cucumberJsonPath, execKey);

  console.log(`📤 Uploading results to Test Execution ${execKey}...`);
  let parsed = null;
  try {
    const jres = await tryJsonUpload(cucumberJsonPath, execKey);
    if (jres.status !== 200 || !jres.parsed?.testIssues) {
      console.warn(`⚠️ JSON upload failed or missing testIssues (HTTP ${jres.status}), retrying via curl...`);
      parsed = await tryCurlFallback(cucumberJsonPath, execKey);
    } else {
      parsed = jres.parsed;
    }
  } catch (err) {
    console.warn('⚠️ JSON upload threw error, trying curl fallback...');
    parsed = await tryCurlFallback(cucumberJsonPath, execKey);
  }

  // Attach HTML reports
  await attachHtmlToExecution(execKey, htmlPath, coveragePath);

  console.log('🏁 Xray upload completed for', execKey);
  console.log(`📊 View test execution in Jira: ${JIRA_BASE_URL}/browse/${execKey}`);
})();

