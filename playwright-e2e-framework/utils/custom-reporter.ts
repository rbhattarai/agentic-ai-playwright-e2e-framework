import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

// One row of feature_mapping.csv: user_story_key,issue_summary,test_case_keys
interface StoryMapping {
  user_story_key: string; // Jira user story key, e.g. SCRUM-5
  issue_summary: string; // Jira issue summary
  test_case_keys: string[]; // Xray test case keys automating the story
}

interface StoryCoverage {
  summary: string;
  testCases: string[];
  testCasesRun: string[]; // test case keys whose tests ran in this run
  covered: boolean; // a test tagged with the story key or one of its test case keys ran
}

class CoverageReporter implements Reporter {
  private testResults: Map<string, { status: string; error?: string }> = new Map();
  private featureMapping: StoryMapping[] = [];
  private totalTests = 0;
  private passedTests = 0;
  private failedTests = 0;
  private skippedTests = 0;
  private ranStories: Set<string> = new Set(); // user story keys covered by this run
  private ranKeys: Set<string> = new Set(); // every Jira key seen on a test that ran

  onBegin(config: FullConfig, suite: Suite) {
    console.log(`Starting test run with ${suite.allTests().length} tests`);
    this.totalTests = suite.allTests().length;
    this.loadFeatureMapping();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const testName = test.title;
    const status = result.status;

    this.testResults.set(testName, {
      status,
      error: result.error?.message,
    });

    // Extract feature name from test tags/annotations
    this.extractFeatureFromTest(test);

    if (status === 'passed') {
      this.passedTests++;
    } else if (status === 'failed') {
      this.failedTests++;
    } else if (status === 'skipped') {
      this.skippedTests++;
    }
  }

  async onEnd(result: FullResult) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 Test Execution Summary');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${this.totalTests}`);
    console.log(`✅ Passed: ${this.passedTests}`);
    console.log(`❌ Failed: ${this.failedTests}`);
    console.log(`⏭️  Skipped: ${this.skippedTests}`);
    console.log(`Status: ${result.status}`);
    console.log('='.repeat(80));

    // Generate coverage report
    await this.generateCoverageReport();
  }

  private loadFeatureMapping() {
    const csvPath = path.join(process.cwd(), 'feature_mapping.csv');
    if (!fs.existsSync(csvPath)) {
      console.warn('⚠️  feature_mapping.csv not found; skipping coverage calculation');
      return;
    }

    const csv = fs.readFileSync(csvPath, 'utf8');
    this.featureMapping = this.parseCSV(csv);
  }

  private parseCSV(csv: string): StoryMapping[] {
    const lines = csv.split(/\r?\n/).filter(Boolean);
    const headers = lines[0].split(',').map((h) => h.trim());
    return lines
      .slice(1)
      .map((l) => {
        const parts = l.split(',');
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => (obj[h] = (parts[i] || '').trim()));
        return {
          user_story_key: (obj.user_story_key || '').toUpperCase(),
          issue_summary: obj.issue_summary || '',
          test_case_keys: (obj.test_case_keys || '').split(';').map((k) => k.trim().toUpperCase()).filter(Boolean),
        };
      })
      .filter((r) => r.user_story_key);
  }

  private extractFeatureFromTest(test: TestCase) {
    // Jira keys from the test's tags (includes tags inherited from test.describe titles and
    // { tag } options) plus its full title path, as a fallback for older Playwright versions.
    const fromTags = (test.tags || []).map((t) => t.replace(/^@/, ''));
    const fromTitles = test.titlePath().join(' ').match(/\b[A-Z][A-Z0-9]+-\d+\b/g) || [];
    const jiraKeys = Array.from(new Set([...fromTags, ...fromTitles].map((k) => k.toUpperCase())))
      .filter((k) => /^[A-Z][A-Z0-9]+-\d+$/.test(k));

    jiraKeys.forEach((k) => this.ranKeys.add(k));

    let matched = false;
    for (const jiraKey of jiraKeys) {
      // A key matches a row as its user story key or as one of its Xray test case keys
      const story = this.featureMapping.find(
        (r) => r.user_story_key === jiraKey || r.test_case_keys.includes(jiraKey)
      );
      if (story) {
        this.ranStories.add(story.user_story_key);
        matched = true;
      }
    }

    // If no Jira key matched for this test, fall back to matching its describe title
    // against the stories' issue summaries.
    if (!matched) {
      const suiteTitle = (test.parent?.title || test.title).replace(/@\S+/g, '').trim().toLowerCase();
      const story = suiteTitle
        ? this.featureMapping.find((r) => {
            const summary = r.issue_summary.toLowerCase();
            return summary && (summary.includes(suiteTitle) || suiteTitle.includes(summary));
          })
        : undefined;
      if (story) this.ranStories.add(story.user_story_key);
    }
  }

  private async generateCoverageReport() {
    if (this.featureMapping.length === 0) {
      console.log('⚠️  No feature mapping available for coverage calculation');
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log('📈 Test Automation Coverage Report');
    console.log('='.repeat(80));

    // Build user story coverage data (one row per user story)
    const userStories: Record<string, StoryCoverage> = {};
    for (const row of this.featureMapping) {
      userStories[row.user_story_key] = {
        summary: row.issue_summary,
        testCases: row.test_case_keys,
        testCasesRun: row.test_case_keys.filter((k) => this.ranKeys.has(k)),
        covered: this.ranStories.has(row.user_story_key),
      };
    }

    // Calculate coverage percentage
    const total = Object.keys(userStories).length;
    const coveredCount = Object.values(userStories).filter((u) => u.covered).length;
    const percent = total === 0 ? 0 : Math.round((coveredCount / total) * 100);

    console.log(`\n📊 Overall Coverage: ${percent}% (${coveredCount}/${total} user stories)\n`);

    // Print user story-wise coverage
    console.log('User Story Coverage:');
    console.log('-'.repeat(80));
    console.table(
      Object.entries(userStories).map(([key, data]) => ({
        'User Story': key,
        Summary: data.summary,
        'Test Cases': data.testCases.join(', ') || '-',
        'Test Cases Run': `${data.testCasesRun.length} / ${data.testCases.length}`,
        Covered: data.covered ? '✅' : '❌',
      }))
    );

    // Generate HTML coverage report
    await this.generateHTMLCoverageReport(userStories, percent, coveredCount, total);
  }

  private async generateHTMLCoverageReport(
    userStories: Record<string, StoryCoverage>,
    percent: number,
    coveredCount: number,
    total: number
  ) {
    const htmlDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(htmlDir)) {
      fs.mkdirSync(htmlDir, { recursive: true });
    }

    const coverageHtmlPath = path.join(htmlDir, 'coverage-report.html');
    const uncoveredCount = total - coveredCount;
    const totalTestCases = Object.values(userStories).reduce((s, u) => s + u.testCases.length, 0);
    const ranTestCases   = Object.values(userStories).reduce((s, u) => s + u.testCasesRun.length, 0);
    const barColor = percent >= 80 ? '#10b981' : percent >= 50 ? '#f59e0b' : '#ef4444';
    const env = process.env.ENV || process.env.NODE_ENV || 'dev';
    const timestamp = new Date().toLocaleString();

    const usRows = Object.entries(userStories).map(([key, data]) => {
      const summaryBadge = `<span class="feat-badge ${data.covered ? 'feat-ran' : 'feat-not-ran'}">${data.covered ? '✓' : '○'} ${data.summary || '—'}</span>`;
      const tcBadges = data.testCases
        .map((k) => {
          const ran = data.testCasesRun.includes(k);
          return `<span class="feat-badge ${ran ? 'feat-ran' : 'feat-not-ran'}" title="Xray test case${ran ? ' — ran' : ' — not run'}">${ran ? '✓' : '○'} ${k}</span>`;
        })
        .join('') || '<span class="text-muted">—</span>';
      const statusCls  = data.covered ? 'status-covered' : 'status-missing';
      const statusTxt  = data.covered ? '✔ Covered' : '✘ Not covered';

      return `
        <tr>
          <td><span class="us-name">${key}</span></td>
          <td><div class="feat-list">${summaryBadge}</div></td>
          <td class="text-center"><strong>${data.testCasesRun.length}</strong> / ${data.testCases.length}</td>
          <td><div class="feat-list">${tcBadges}</div></td>
          <td><span class="status-badge ${statusCls}">${statusTxt}</span></td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Coverage Report</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;background:#f1f5f9;color:#0f172a;min-height:100vh}
    header{background:#fff;border-bottom:1px solid #e2e8f0;padding:0 32px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;box-shadow:0 1px 3px rgba(0,0,0,.06)}
    header h1{font-size:1.1rem;font-weight:800;color:#0f172a}
    header h1 span{color:#6366f1}
    .meta-pills{display:flex;gap:8px;flex-wrap:wrap}
    .meta-pill{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:20px;padding:3px 11px;font-size:.75rem;color:#64748b}
    .meta-pill strong{color:#334155}
    main{max-width:1300px;margin:0 auto;padding:28px 24px 64px}
    .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:24px}
    .stat-card{background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;padding:18px 22px;display:flex;align-items:center;gap:14px;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:box-shadow .15s,transform .15s}
    .stat-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.1);transform:translateY(-1px)}
    .stat-icon{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.25rem;flex-shrink:0}
    .stat-icon.purple{background:#ede9fe}.stat-icon.green{background:#d1fae5}.stat-icon.red{background:#fee2e2}.stat-icon.amber{background:#fef3c7}.stat-icon.sky{background:#e0f2fe}
    .stat-label{font-size:.72rem;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
    .stat-value{font-size:1.75rem;font-weight:900;color:#0f172a;line-height:1.1}
    .coverage-bar-wrap{background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;padding:22px 26px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
    .coverage-bar-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px}
    .coverage-bar-header h2{font-size:.95rem;font-weight:700;color:#334155}
    .coverage-pct{font-size:2rem;font-weight:900;color:${barColor}}
    .bar-track{background:#f1f5f9;border-radius:99px;height:10px;overflow:hidden;border:1px solid #e2e8f0}
    .bar-fill{height:100%;border-radius:99px;background:${barColor};width:0%;transition:width 1s cubic-bezier(.4,0,.2,1)}
    .bar-legend{display:flex;gap:20px;margin-top:10px;font-size:.78rem;color:#64748b}
    .table-card{background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}
    .table-card-header{padding:14px 22px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;background:#f8fafc}
    .table-card-header h2{font-size:.9rem;font-weight:700;color:#0f172a}
    .badge-count{background:#e2e8f0;color:#64748b;border-radius:99px;padding:2px 10px;font-size:.75rem;font-weight:600}
    table{width:100%;border-collapse:collapse}
    thead th{background:#f8fafc;padding:10px 16px;text-align:left;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;border-bottom:1.5px solid #e2e8f0}
    thead th.tc{text-align:center}
    tbody tr{border-bottom:1px solid #f1f5f9;transition:background .12s}
    tbody tr:last-child{border-bottom:none}
    tbody tr:hover{background:#f8fafc}
    tbody td{padding:14px 16px;font-size:.87rem;vertical-align:top;color:#1e293b}
    tbody td.tc{text-align:center}
    .text-muted{color:#94a3b8}
    .us-name{font-weight:700;color:#4f46e5;font-size:.88rem}
    .feat-list{display:flex;flex-wrap:wrap;gap:6px}
    .feat-badge{display:inline-flex;align-items:center;gap:4px;border-radius:6px;padding:3px 9px;font-size:.76rem;font-weight:500}
    .feat-ran{background:#d1fae5;color:#065f46;border:1px solid #a7f3d0}
    .feat-not-ran{background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0}
    .jira-key{background:#ede9fe;color:#5b21b6;border-radius:4px;padding:1px 5px;font-size:.7rem}
    .jira-pill{background:#ede9fe;color:#4f46e5;border:1px solid #c4b5fd;border-radius:99px;padding:2px 9px;font-size:.75rem;font-weight:600}
    .status-badge{display:inline-flex;align-items:center;border-radius:99px;padding:4px 12px;font-size:.75rem;font-weight:700;white-space:nowrap}
    .status-covered{background:#d1fae5;color:#065f46;border:1px solid #a7f3d0}
    .status-missing{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
    footer{text-align:center;color:#94a3b8;font-size:.75rem;padding:32px 0 0}
  </style>
</head>
<body>
  <header>
    <h1>📈 Coverage <span>Report</span></h1>
    <div class="meta-pills">
      <span class="meta-pill"><strong>App:</strong> ${process.env.APP_NAME || 'Playwright E2E'}</span>
      <span class="meta-pill"><strong>Env:</strong> ${env.toUpperCase()}</span>
      <span class="meta-pill"><strong>Platform:</strong> ${process.platform}</span>
      <span class="meta-pill">${timestamp}</span>
    </div>
  </header>
  <main>
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-icon purple">📋</div><div><div class="stat-value">${this.totalTests}</div><div class="stat-label">Total Tests</div></div></div>
      <div class="stat-card"><div class="stat-icon green">✅</div><div><div class="stat-value" style="color:#059669">${this.passedTests}</div><div class="stat-label">Passed</div></div></div>
      <div class="stat-card"><div class="stat-icon red">❌</div><div><div class="stat-value" style="color:#dc2626">${this.failedTests}</div><div class="stat-label">Failed</div></div></div>
      <div class="stat-card"><div class="stat-icon amber">⏭</div><div><div class="stat-value" style="color:#d97706">${this.skippedTests}</div><div class="stat-label">Skipped</div></div></div>
      <div class="stat-card"><div class="stat-icon sky">🎯</div><div><div class="stat-value" style="color:#0284c7">${ranTestCases} / ${totalTestCases}</div><div class="stat-label">Test Cases Run</div></div></div>
    </div>
    <div class="coverage-bar-wrap">
      <div class="coverage-bar-header">
        <h2>User Story Coverage</h2>
        <span class="coverage-pct">${percent}%</span>
      </div>
      <div class="bar-track"><div class="bar-fill" id="coverageBar" data-width="${percent}"></div></div>
      <div class="bar-legend">
        <span>✔ ${coveredCount} user stories covered</span>
        <span>✘ ${uncoveredCount} not covered</span>
        <span>Total: ${total} user stories</span>
      </div>
    </div>
    <div class="table-card">
      <div class="table-card-header">
        <h2>User Story Coverage Details</h2>
        <span class="badge-count">${total} user stories</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:140px">User Story</th>
            <th>Issue Summary</th>
            <th class="tc" style="width:110px">Test Cases Run</th>
            <th style="width:220px">Test Cases</th>
            <th style="width:140px">Status</th>
          </tr>
        </thead>
        <tbody>${usRows}</tbody>
      </table>
    </div>
  </main>
  <footer>Report generated by Playwright E2E Framework · ${timestamp}</footer>
  <script>
    const bar = document.getElementById('coverageBar');
    if (bar) requestAnimationFrame(() => setTimeout(() => { bar.style.width = bar.dataset.width + '%'; }, 100));
  </script>
</body>
</html>`;

    fs.writeFileSync(coverageHtmlPath, html, 'utf8');
    console.log(`\n✅ Coverage HTML report generated at: ${coverageHtmlPath}`);
  }
}

export default CoverageReporter;
