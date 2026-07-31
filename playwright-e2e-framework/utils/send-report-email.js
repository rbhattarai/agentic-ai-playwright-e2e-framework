const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const dotenv = require('dotenv');
const ENV = process.env.ENV || 'dev';
const envFilePath = `./.${ENV}.env`;
dotenv.config({ path: envFilePath });

const to = process.env.REPORT_TO || 'rohan.bhattarai.dev@gmail.com';
const from = process.env.REPORT_FROM || process.env.SMTP_USER || 'no-reply@gmail.com';
const pipelineId = process.env.CI_PIPELINE_ID || process.env.CI_PIPELINE_IID || 'N/A';
const commitSha = process.env.CI_COMMIT_SHA || 'N/A';
const jobUrl = process.env.CI_JOB_URL || '';
const pipelineUrl = process.env.CI_PIPELINE_URL || '';
const projectUrl = process.env.CI_PROJECT_URL || '';
const subject = process.env.REPORT_SUBJECT || `CI Test Report - ${pipelineId} ${commitSha !== 'N/A' ? commitSha.slice(0,7) : ''}`;

const htmlReport = path.join('reports', 'index.html');
const coverageReport = path.join('reports', 'coverage-report.html');
const jsonReport = path.join('reports', 'results.json');

function parseCSV(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const parts = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h] = (parts[i] || '').trim());
    return obj;
  });
  return rows;
}

function extractFeatures(spec) {
  if (!spec || !Array.isArray(spec.tags)) {
    console.warn('Invalid spec or missing tags:', spec);
    return [];
  }
  return spec.tags.filter(tag => tag.startsWith('SCRUM-'));
}

function processSpec(spec, ranFeatures, testCounts) {
  if (!spec || typeof spec !== 'object') {
    console.warn('Invalid spec object:', spec);
    return;
  }

  const features = extractFeatures(spec);
  features.forEach(feature => ranFeatures.add(feature));

  if(Array.isArray(spec.tests)) {
    spec.tests.forEach(test => {
      if (Array.isArray(test.results)) {
        test.results.forEach(result => {
          const status = result.status;
          if (status === 'passed' || status === 'expected') testCounts.passed++;
          else if (status === 'failed' || status === 'unexpected') testCounts.failed++;
          else if (status === 'skipped') testCounts.skipped++;
          else if (status === 'timedOut') testCounts.timedOut++;
        });
      }
    });
  }
}

function traverseSuites(suites, ranFeatures, testCounts) {
  if (Array.isArray(suites)) {
    suites.forEach(suite => {
      if (Array.isArray(suite.specs)) {
        suite.specs.forEach(spec => processSpec(spec, ranFeatures, testCounts));
      }
      if (suite.suites) {
        traverseSuites(suite.suites, ranFeatures, testCounts);
      }
    });
  }
}

async function main() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('SMTP_HOST, SMTP_USER and SMTP_PASS must be set as env variables');
    process.exit(1);
  }

  const smtpPassBase64 = process.env.SMTP_PASS;
  const decodedSmtpPass = Buffer.from(smtpPassBase64, 'base64').toString('utf-8');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: decodedSmtpPass
    }
  });

  let contentHtml = '<p>CI test run finished. See attached reports and links below.</p>';
  // Add CI metadata and links
  contentHtml += '<ul>';
  contentHtml += `<li>Pipeline: ${pipelineId} ${pipelineUrl ? `(<a href="${pipelineUrl}">pipeline link</a>)` : ''}</li>`;
  contentHtml += `<li>Commit: ${commitSha !== 'N/A' ? commitSha : 'N/A'}</li>`;
  contentHtml += `<li>Job: ${jobUrl ? `<a href="${jobUrl}">job link</a>` : 'N/A'}</li>`;
  if (projectUrl) contentHtml += `<li>Project: <a href="${projectUrl}">${projectUrl}</a></li>`;
  contentHtml += '</ul>';

  // Parse Playwright results.json for a small summary (passed/failed/skipped)
  let summaryHtml = '<p>Summary: not available</p>';
  if (fs.existsSync(jsonReport)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
      const testCounts = { passed: 0, failed: 0, skipped: 0, timedOut: 0 };
      const ranFeatures = new Set();

      if(data && typeof data === 'object' && Array.isArray(data.suites)) {
        traverseSuites(data.suites, ranFeatures, testCounts);
      } else {
        console.warn('Unexpected structure in results.json: missing suites array');
      }

      const total = testCounts.passed + testCounts.failed + testCounts.skipped + testCounts.timedOut;
      summaryHtml = `
        <p><strong>Test Summary:</strong></p>
        <ul>
          <li>Total: ${total}</li>
          <li>✅ Passed: ${testCounts.passed}</li>
          <li>❌ Failed: ${testCounts.failed}</li>
          <li>⏭️ Skipped: ${testCounts.skipped}</li>
          ${testCounts.timedOut > 0 ? `<li>⏱️ Timed Out: ${testCounts.timedOut}</li>` : ''}
        </ul>
      `;

      //Coverage calculation
      let coverageSummary = '';
      if(fs.existsSync('feature_mapping.csv')) {
        try {
          const csv = fs.readFileSync('feature_mapping.csv', 'utf8');
          const featureMapping = parseCSV(csv);
          const epics = {};
          for (const row of featureMapping) {
            const epic = row.epic || 'UNKNOWN';
            const jira = row.jira_key || '';
            const feat = row.feature;
            if (!epics[epic]) {
              epics[epic] = { features: [], covered: false, jira: jira };
            }

            const ran = ranFeatures.has(jira);

            epics[epic].features.push({ feature: feat, jira: jira, ran: ran });
            if (jira && ran) {
              epics[epic].covered = true;
            }
          }

          const total = Object.keys(epics).length;
          const coveredCount = Object.values(epics).filter(e => e.covered).length;
          const percent = total === 0 ? 0 : Math.round((coveredCount / total) * 100);
          coverageSummary += `<p><strong>Test Coverage:</strong> ${percent}% (${coveredCount}/${total} epics covered)</p>`;
          coverageSummary += '<ul>';
          for (const [epic, data] of Object.entries(epics)) {
            const jiraKeys = Array.from(new Set(data.features.map(f => f.jira).filter(Boolean))).join(', ') || '-';
            coverageSummary += `<li><strong>${epic}</strong> [${jiraKeys}] - ${data.covered ? '✅ Covered' : '❌ Not Covered'}</li>`;
          }
          coverageSummary += '</ul>';
          } catch (err) {
            coverageSummary = `<p>Could not compute coverage: ${err.message}</p>`;
          }
        } else {
            coverageSummary = '<p>No feature mapping available; skipping coverage.</p>';
        }
        summaryHtml += coverageSummary;
      } catch (e) {
        console.error('Error parsing results.json:', e);
        summaryHtml = `<p>Could not parse Playwright results.json: ${e.message}</p>`;
      }
    }
    contentHtml += summaryHtml;

    let attachments = [];
    if (fs.existsSync(htmlReport)) {
      attachments.push({ filename: 'index.html', path: htmlReport });
    }
    if (fs.existsSync(coverageReport)) {
      attachments.push({ filename: 'coverage-report.html', path: coverageReport });
    }

    const mailOptions = {
      from: from,
      to: to,
      subject: subject,
      html: contentHtml,
      attachments: attachments
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Report email sent:', info.messageId);
    } catch (err) {
      console.error('Failed to send report email:', err);
    } 
}

main().catch(err => {
  console.error('Failed to send report email:', err);
  process.exit(1);
});
