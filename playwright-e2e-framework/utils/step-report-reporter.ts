import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

type SerializedAttachment = {
  name: string;
  contentType: string;
  relativePath?: string;
  inlineBody?: string;
};

type SerializedStep = {
  title: string;
  category: string;
  duration: number;
  status: 'passed' | 'failed';
  error?: string;
  attachments: SerializedAttachment[];
  steps: SerializedStep[];
};

type SerializedTest = {
  file: string;
  title: string;
  fullTitle: string;
  status: TestResult['status'];
  duration: number;
  error?: string;
  video?: SerializedAttachment;
  trace?: SerializedAttachment;
  attachments: SerializedAttachment[];
  steps: SerializedStep[];
};

class StepReportReporter implements Reporter {
  private readonly reportDir = path.join(process.cwd(), 'reports', 'step-report');
  private readonly assetsDir = path.join(this.reportDir, 'assets');
  private tests: SerializedTest[] = [];
  private totalTests = 0;
  // Assets are buffered in memory during onTestEnd so they survive the HTML
  // reporter wiping reports/ in its own onEnd, then flushed to disk in our onEnd.
  private pendingAssets: Array<{ target: string; data: Buffer }> = [];

  onBegin(_config: FullConfig, suite: Suite): void {
    this.totalTests = suite.allTests().length;
    fs.rmSync(this.reportDir, { recursive: true, force: true });
    fs.mkdirSync(this.assetsDir, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const testKey = `${this.tests.length + 1}-${slug(test.title)}`;
    const persistedAttachments = result.attachments.map((a, i) =>
      this.persistAttachment(a.name, a.contentType, a.path, a.body, testKey, i, 'tests')
    );

    const video = persistedAttachments.find(a => a.contentType.startsWith('video/'));
    const trace = persistedAttachments.find(a => a.name.toLowerCase().includes('trace'));
    const extraAttachments = persistedAttachments.filter(a => a !== video && a !== trace);

    this.tests.push({
      file: test.location.file.replace(/\\/g, '/'),
      title: test.title,
      fullTitle: test.titlePath().slice(1).join(' › '),
      status: result.status,
      duration: result.duration,
      error: result.error?.message,
      video,
      trace,
      attachments: extraAttachments,
      steps: this.serializeVisibleSteps(result.steps, testKey),
    });
  }

  onEnd(_result: FullResult): void {
    // Recreate directory tree — the Playwright HTML reporter wipes reports/ in its
    // own onEnd, which runs before ours and deletes anything we wrote in onTestEnd.
    fs.mkdirSync(this.assetsDir, { recursive: true });

    // Flush all assets that were buffered in memory during onTestEnd.
    for (const { target, data } of this.pendingAssets) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
    }

    fs.writeFileSync(path.join(this.reportDir, 'index.html'), this.renderHtml(), 'utf8');
    fs.writeFileSync(
      path.join(this.reportDir, 'report-data.json'),
      JSON.stringify({ tests: this.tests }, null, 2),
      'utf8'
    );
    console.log(`\n📋 Step report → ${path.join(this.reportDir, 'index.html')}`);
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  private serializeVisibleSteps(steps: TestStep[], testKey: string, parentKey = ''): SerializedStep[] {
    const result: SerializedStep[] = [];
    steps.forEach((step, i) => {
      const stepKey = `${testKey}${parentKey ? `-${parentKey}` : ''}-step-${i + 1}`;
      const childSteps = this.serializeVisibleSteps(step.steps, testKey, `${parentKey}${i + 1}`);
      const attachments = step.attachments.map((a, ai) =>
        this.persistAttachment(a.name, a.contentType, a.path, a.body, stepKey, ai, 'steps')
      );

      const isUserStep = step.category === 'test.step';
      if (!isUserStep && childSteps.length === 0 && attachments.length === 0) return;

      const serialized: SerializedStep = {
        title: step.title,
        category: step.category,
        duration: step.duration,
        status: step.error ? 'failed' : 'passed',
        error: step.error?.message,
        attachments,
        steps: childSteps,
      };

      isUserStep ? result.push(serialized) : result.push(...childSteps);
    });
    return result;
  }

  private persistAttachment(
    name: string,
    contentType: string,
    filePath: string | undefined,
    body: Buffer | undefined,
    entityKey: string,
    index: number,
    bucket: 'tests' | 'steps'
  ): SerializedAttachment {
    const attachment: SerializedAttachment = { name, contentType };
    const dir = path.join(this.assetsDir, bucket);
    const ext = inferExtension(name, contentType, filePath);
    const target = path.join(dir, `${entityKey}-${index + 1}-${slug(name)}${ext}`);

    // Read content into memory now (temp files are available during onTestEnd)
    // and defer disk writes to onEnd so they survive the HTML reporter's cleanup.
    if (filePath && fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      this.pendingAssets.push({ target, data });
      attachment.relativePath = relativeToReport(this.reportDir, target);
      return attachment;
    }
    if (body) {
      this.pendingAssets.push({ target, data: body });
      attachment.relativePath = relativeToReport(this.reportDir, target);
      if (contentType.startsWith('text/') || contentType === 'application/json') {
        attachment.inlineBody = body.toString('utf8');
      }
    }
    return attachment;
  }

  // ─── HTML rendering ───────────────────────────────────────────────────────

  private renderHtml(): string {
    const passed  = this.tests.filter(t => t.status === 'passed').length;
    const failed  = this.tests.filter(t => t.status === 'failed').length;
    const skipped = this.tests.filter(t => !['passed', 'failed'].includes(t.status)).length;
    const passPct = this.totalTests > 0 ? Math.round((passed / this.totalTests) * 100) : 0;
    const generatedAt = new Date().toLocaleString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Playwright Step Report</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f1f5f9;--card:#fff;
  --hdr:#0f172a;--hdr2:#1e293b;
  --indigo:#6366f1;--indigo-lt:#ede9fe;
  --pass:#10b981;--pass-bg:#d1fae5;--pass-txt:#065f46;
  --fail:#ef4444;--fail-bg:#fee2e2;--fail-txt:#991b1b;
  --warn:#f59e0b;--warn-bg:#fef3c7;--warn-txt:#92400e;
  --txt:#0f172a;--muted:#64748b;--border:#e2e8f0;
  --sh:0 1px 3px rgba(0,0,0,.1),0 1px 2px rgba(0,0,0,.06);
  --sh-lg:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -2px rgba(0,0,0,.05);
  --r:12px;--r-sm:6px;
  --font:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;
  --mono:'SF Mono','Cascadia Code','Consolas','Fira Code',monospace
}
body{font-family:var(--font);background:var(--bg);color:var(--txt);line-height:1.5;min-height:100vh}

/* ── Header ── */
.hdr{background:#fff;border-bottom:1px solid var(--border);color:var(--txt);
  padding:0 28px;height:60px;display:flex;align-items:center;
  justify-content:space-between;position:sticky;top:0;z-index:100;
  box-shadow:var(--sh)}
.hdr-brand{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:800;letter-spacing:-.01em;color:var(--txt)}
.hdr-brand svg{width:26px;height:26px;color:var(--indigo)}
.hdr-meta{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px}
.hdr-meta svg{width:14px;height:14px}

/* ── Main ── */
.main{max-width:1200px;margin:0 auto;padding:28px 24px}

/* ── Stat cards ── */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px}
.stat{background:var(--card);border-radius:var(--r);padding:20px 22px;box-shadow:var(--sh);
  display:flex;align-items:center;gap:16px;transition:transform .15s,box-shadow .15s;
  border:1.5px solid var(--border)}
.stat:hover{transform:translateY(-2px);box-shadow:var(--sh-lg)}
.stat-icon{width:50px;height:50px;border-radius:14px;display:flex;align-items:center;
  justify-content:center;flex-shrink:0;font-size:22px}
.stat-icon.total{background:var(--indigo-lt);color:#4f46e5}
.stat-icon.pass{background:var(--pass-bg);color:#059669}
.stat-icon.fail{background:var(--fail-bg);color:#dc2626}
.stat-icon.skip{background:var(--warn-bg);color:#d97706}
.stat-num{font-size:34px;font-weight:900;line-height:1}
.stat-lbl{font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;
  letter-spacing:.05em;margin-top:2px}

/* ── Progress ── */
.progress-wrap{margin-bottom:22px}
.progress-info{display:flex;justify-content:space-between;font-size:12px;
  color:var(--muted);margin-bottom:6px;font-weight:500}
.progress-track{height:8px;background:var(--border);border-radius:999px;overflow:hidden}
.progress-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--pass),#34d399);
  transition:width .6s ease}

/* ── Filters ── */
.filters{display:flex;align-items:center;gap:8px;margin-bottom:20px;flex-wrap:wrap}
.filter-lbl{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;
  letter-spacing:.07em;margin-right:4px}
.filter-btn{padding:6px 15px;border-radius:999px;border:1.5px solid var(--border);
  background:var(--card);color:var(--muted);font-size:12px;font-weight:600;
  cursor:pointer;transition:all .15s}
.filter-btn:hover{border-color:var(--indigo);color:var(--indigo)}
.filter-btn.active{background:var(--indigo);border-color:var(--indigo);color:#fff;
  box-shadow:0 2px 8px rgba(99,102,241,.35)}

/* ── Test items ── */
.tests{display:grid;gap:10px}
.test-item{background:var(--card);border-radius:var(--r);box-shadow:var(--sh);
  overflow:hidden;border:1.5px solid var(--border);transition:box-shadow .15s}
.test-item:hover{box-shadow:var(--sh-lg)}
.test-item.passed {border-left:4px solid var(--pass)}
.test-item.failed {border-left:4px solid var(--fail)}
.test-item.skipped,.test-item.timedOut,.test-item.interrupted{border-left:4px solid var(--warn)}

.test-summary{display:flex;align-items:center;gap:12px;padding:14px 18px;
  cursor:pointer;user-select:none}
.test-summary::-webkit-details-marker,.test-summary::marker{display:none}
.chevron{width:16px;height:16px;flex-shrink:0;color:var(--muted);transition:transform .2s}
details[open] > .test-summary .chevron{transform:rotate(90deg)}
.dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.dot.passed{background:var(--pass);box-shadow:0 0 0 3px var(--pass-bg)}
.dot.failed{background:var(--fail);box-shadow:0 0 0 3px var(--fail-bg)}
.dot.skipped,.dot.timedOut,.dot.interrupted{background:var(--warn);box-shadow:0 0 0 3px var(--warn-bg)}
.test-info{flex:1;min-width:0}
.test-title{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.test-path{font-size:11px;color:var(--muted);margin-top:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.test-meta{display:flex;align-items:center;gap:8px;flex-shrink:0}
.dur{font-size:11px;font-family:var(--mono);color:var(--muted);
  background:#f1f5f9;padding:2px 7px;border-radius:4px}
.badge{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;
  padding:3px 10px;border-radius:999px;white-space:nowrap}
.badge.passed{background:var(--pass-bg);color:var(--pass-txt)}
.badge.failed{background:var(--fail-bg);color:var(--fail-txt)}
.badge.skipped,.badge.timedOut,.badge.interrupted{background:var(--warn-bg);color:var(--warn-txt)}

/* ── Test body ── */
.test-body{padding:0 18px 18px;border-top:1px solid var(--border)}
.err-block{background:#fef2f2;color:#991b1b;font-family:var(--mono);font-size:12px;
  padding:14px 16px;border-radius:var(--r-sm);margin:14px 0 0;
  overflow-x:auto;white-space:pre-wrap;word-break:break-all;
  border-left:3px solid var(--fail);border:1px solid #fecaca;border-left:3px solid var(--fail)}
.section-hdr{font-size:10px;font-weight:800;text-transform:uppercase;
  letter-spacing:.08em;color:var(--muted);padding:14px 0 8px;
  display:flex;align-items:center;gap:6px}
.section-hdr svg{width:13px;height:13px}

/* ── Steps ── */
.steps{display:grid;gap:6px}
.step-wrap{border-radius:var(--r-sm);border:1.5px solid var(--border);overflow:hidden}
.step-wrap.failed{border-color:#fca5a5}
.step-hdr{display:flex;align-items:center;gap:10px;padding:10px 14px;
  background:#f8fafc;cursor:pointer}
.step-hdr::-webkit-details-marker,.step-hdr::marker{display:none}
details.step-wrap[open] > .step-hdr{background:#f0f4f8;border-bottom:1px solid var(--border)}
.step-n{width:22px;height:22px;border-radius:50%;background:#e2e8f0;color:var(--muted);
  font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.step-wrap.failed .step-n{background:var(--fail-bg);color:var(--fail-txt)}
.step-title-text{flex:1;font-size:13px;font-weight:600}
.step-dur{font-size:11px;font-family:var(--mono);color:var(--muted);flex-shrink:0}
.step-si{font-size:14px;flex-shrink:0}
.step-body{padding:12px 14px;background:#fff}
.step-err{background:#fef2f2;color:#991b1b;font-family:var(--mono);font-size:11px;
  padding:10px 12px;border-radius:var(--r-sm);margin-bottom:10px;
  overflow-x:auto;white-space:pre-wrap;word-break:break-all;
  border:1px solid #fecaca;border-left:3px solid var(--fail)}

/* ── Screenshots ── */
.shots{display:flex;flex-wrap:wrap;gap:10px}
.shot{width:220px;border-radius:var(--r-sm);overflow:hidden;border:1.5px solid var(--border);
  cursor:pointer;transition:transform .15s,box-shadow .15s}
.shot:hover{transform:scale(1.02);box-shadow:var(--sh-lg)}
.shot img{width:100%;display:block}
.shot-lbl{font-size:10px;color:var(--muted);padding:4px 8px;background:#f8fafc;
  text-align:center;border-top:1px solid var(--border);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* ── Artifacts ── */
.artifacts{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.art-link{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;
  border-radius:var(--r-sm);border:1.5px solid var(--border);font-size:12px;
  color:var(--indigo);text-decoration:none;font-weight:600;transition:background .15s}
.art-link:hover{background:var(--indigo-lt)}
.art-link svg{width:14px;height:14px}
.video-wrap{margin-top:8px}
.video-wrap video{max-width:100%;border-radius:var(--r-sm);border:1.5px solid var(--border)}

/* ── Lightbox ── */
#lb{display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);
  align-items:center;justify-content:center;padding:24px}
#lb.open{display:flex}
#lb img{max-width:95vw;max-height:90vh;border-radius:var(--r-sm);object-fit:contain;
  box-shadow:0 25px 50px rgba(0,0,0,.5)}
#lb-close{position:fixed;top:18px;right:22px;width:40px;height:40px;
  border-radius:50%;background:rgba(255,255,255,.12);color:#fff;
  font-size:20px;display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:background .15s;border:none}
#lb-close:hover{background:rgba(255,255,255,.22)}

/* ── Empty ── */
.empty{text-align:center;padding:60px;color:var(--muted)}
.empty svg{width:56px;height:56px;margin-bottom:12px;opacity:.4}

@media(max-width:700px){
  .stats{grid-template-columns:repeat(2,1fr)}
  .test-path{display:none}
  .shot{width:calc(50% - 5px)}
}
</style>
</head>
<body>

<header class="hdr">
  <div class="hdr-brand">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
    Playwright Step Report
  </div>
  <div class="hdr-meta">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    ${generatedAt}
  </div>
</header>

<main class="main">

  <div class="stats">
    <div class="stat">
      <div class="stat-icon total">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      </div>
      <div><div class="stat-num">${this.totalTests}</div><div class="stat-lbl">Total Tests</div></div>
    </div>
    <div class="stat">
      <div class="stat-icon pass">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div><div class="stat-num" style="color:var(--pass)">${passed}</div><div class="stat-lbl">Passed</div></div>
    </div>
    <div class="stat">
      <div class="stat-icon fail">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </div>
      <div><div class="stat-num" style="color:var(--fail)">${failed}</div><div class="stat-lbl">Failed</div></div>
    </div>
    <div class="stat">
      <div class="stat-icon skip">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      </div>
      <div><div class="stat-num" style="color:var(--warn)">${skipped}</div><div class="stat-lbl">Skipped</div></div>
    </div>
  </div>

  <div class="progress-wrap">
    <div class="progress-info">
      <span>${passPct}% passed</span>
      <span>${passed} / ${this.totalTests} tests</span>
    </div>
    <div class="progress-track">
      <div class="progress-fill" style="width:${passPct}%"></div>
    </div>
  </div>

  <div class="filters">
    <span class="filter-lbl">Filter:</span>
    <button class="filter-btn active" data-filter="all">All (${this.totalTests})</button>
    <button class="filter-btn" data-filter="passed">Passed (${passed})</button>
    <button class="filter-btn" data-filter="failed">Failed (${failed})</button>
    ${skipped > 0 ? `<button class="filter-btn" data-filter="skipped">Skipped (${skipped})</button>` : ''}
  </div>

  <div class="tests" id="tests">
    ${this.tests.length === 0
      ? `<div class="empty">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
             <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
           </svg>
           <div>No test results found.</div>
         </div>`
      : this.tests.map((t, i) => this.renderTest(t, i + 1)).join('\n')
    }
  </div>

</main>

<!-- Lightbox -->
<div id="lb" onclick="closeLb()">
  <button id="lb-close" onclick="closeLb()">&#x2715;</button>
  <img id="lb-img" src="" alt="">
</div>

<script>
function openLb(src){document.getElementById('lb-img').src=src;document.getElementById('lb').classList.add('open')}
function closeLb(){document.getElementById('lb').classList.remove('open')}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLb()});

document.querySelectorAll('.filter-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const f=btn.dataset.filter;
    document.querySelectorAll('.test-item').forEach(item=>{
      item.style.display=(f==='all'||item.dataset.status===f)?'':'none';
    });
  });
});

// Auto-expand failed tests
document.querySelectorAll('details[data-status="failed"]').forEach(d=>d.open=true);
</script>
</body>
</html>`;
  }

  private renderTest(test: SerializedTest, num: number): string {
    const statusLabel = test.status === 'timedOut' ? 'Timed Out'
      : test.status === 'interrupted' ? 'Interrupted'
      : test.status.charAt(0).toUpperCase() + test.status.slice(1);

    const hasBody = test.error || test.video || test.trace
      || test.attachments.length > 0 || test.steps.length > 0;

    return `<details class="test-item ${test.status}" data-status="${test.status}" ${test.status === 'failed' ? 'open' : ''}>
  <summary class="test-summary">
    <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <div class="dot ${test.status}"></div>
    <div class="test-info">
      <div class="test-title" title="${escapeHtml(test.title)}">${num}. ${escapeHtml(test.title)}</div>
      <div class="test-path">${escapeHtml(test.fullTitle)} &nbsp;·&nbsp; ${escapeHtml(test.file)}</div>
    </div>
    <div class="test-meta">
      <span class="dur">${formatDur(test.duration)}</span>
      <span class="badge ${test.status}">${escapeHtml(statusLabel)}</span>
    </div>
  </summary>
  ${hasBody ? `<div class="test-body">
    ${test.error ? `<pre class="err-block">${escapeHtml(test.error)}</pre>` : ''}
    ${test.video || test.trace || test.attachments.length ? this.renderTestArtifacts(test) : ''}
    ${test.steps.length ? this.renderSteps(test.steps) : ''}
  </div>` : ''}
</details>`;
  }

  private renderTestArtifacts(test: SerializedTest): string {
    const parts: string[] = [];

    if (test.video?.relativePath) {
      parts.push(`<div class="section-hdr">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        Video
      </div>
      <div class="video-wrap"><video controls preload="metadata"><source src="${test.video.relativePath}" type="${test.video.contentType}"></video></div>`);
    }

    if (test.trace?.relativePath) {
      parts.push(`<div class="artifacts"><a class="art-link" href="${test.trace.relativePath}" target="_blank">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download Trace
      </a></div>`);
    }

    const imgAttachments = test.attachments.filter(a => a.contentType.startsWith('image/') && a.relativePath);
    const otherAttachments = test.attachments.filter(a => !a.contentType.startsWith('image/') || !a.relativePath);

    if (imgAttachments.length) {
      parts.push(`<div class="section-hdr">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        Screenshots
      </div>
      <div class="shots">${imgAttachments.map(a =>
        `<div class="shot" onclick="openLb('${a.relativePath}')">
           <img src="${a.relativePath}" alt="${escapeHtml(a.name)}" loading="lazy">
           <div class="shot-lbl">${escapeHtml(a.name)}</div>
         </div>`
      ).join('')}</div>`);
    }

    if (otherAttachments.length) {
      parts.push(`<div class="artifacts">${otherAttachments.map(a =>
        a.relativePath
          ? `<a class="art-link" href="${a.relativePath}" target="_blank">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              ${escapeHtml(a.name)}
            </a>`
          : `<span class="art-link">${escapeHtml(a.name)}</span>`
      ).join('')}</div>`);
    }

    return parts.join('\n');
  }

  private renderSteps(steps: SerializedStep[]): string {
    return `<div class="section-hdr">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      Steps (${steps.length})
    </div>
    <div class="steps">${steps.map((s, i) => this.renderStep(s, i + 1)).join('')}</div>`;
  }

  private renderStep(step: SerializedStep, num: number): string {
    const icon = step.status === 'failed' ? '✗' : '✓';
    const iconColor = step.status === 'failed' ? 'var(--fail)' : 'var(--pass)';
    const hasBody = step.error || step.attachments.length > 0 || step.steps.length > 0;

    const imgAttachments = step.attachments.filter(a => a.contentType.startsWith('image/') && a.relativePath);
    const otherAttachments = step.attachments.filter(a => !a.contentType.startsWith('image/') && a.relativePath);

    return `<details class="step-wrap ${step.status}" ${step.status === 'failed' ? 'open' : ''}>
  <summary class="step-hdr">
    <span class="step-n">${num}</span>
    <span class="step-title-text">${escapeHtml(step.title)}</span>
    <span class="step-dur">${formatDur(step.duration)}</span>
    <span class="step-si" style="color:${iconColor}">${icon}</span>
  </summary>
  ${hasBody ? `<div class="step-body">
    ${step.error ? `<pre class="step-err">${escapeHtml(step.error)}</pre>` : ''}
    ${imgAttachments.length ? `<div class="shots">${imgAttachments.map(a =>
      `<div class="shot" onclick="openLb('${a.relativePath}')">
         <img src="${a.relativePath}" alt="${escapeHtml(a.name)}" loading="lazy">
         <div class="shot-lbl">${escapeHtml(a.name)}</div>
       </div>`
    ).join('')}</div>` : ''}
    ${otherAttachments.length ? `<div class="artifacts">${otherAttachments.map(a =>
      `<a class="art-link" href="${a.relativePath}" target="_blank">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
         ${escapeHtml(a.name)}
       </a>`
    ).join('')}</div>` : ''}
    ${step.steps.length ? `<div style="margin-top:10px">${this.renderSteps(step.steps)}</div>` : ''}
  </div>` : ''}
</details>`;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(v: string): string {
  return v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
           .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function slug(v: string): string {
  return v.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'item';
}

function inferExtension(name: string, contentType: string, filePath?: string): string {
  if (filePath) { const e = path.extname(filePath); if (e) return e; }
  if (contentType === 'image/png')        return '.png';
  if (contentType === 'image/jpeg')       return '.jpg';
  if (contentType === 'video/webm')       return '.webm';
  if (contentType === 'application/zip')  return '.zip';
  if (contentType === 'application/json') return '.json';
  if (contentType.startsWith('text/'))    return '.txt';
  return path.extname(name) || '.bin';
}

function relativeToReport(reportDir: string, targetPath: string): string {
  return path.relative(reportDir, targetPath).replace(/\\/g, '/');
}

function formatDur(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export default StepReportReporter;
