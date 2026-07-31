# AI-Enabled Playwright E2E Framework — Workshop

A Playwright + TypeScript E2E framework where AI agents (via [Claude Code](https://claude.com/product/claude-code)) read requirements, plan test coverage, generate and self-heal Playwright specs, review their own diffs, and open pull requests — tested live against two small demo apps included in this repo.

This README is the workshop handout: follow it top to bottom in your own GitHub Codespace. Nothing to install on your laptop — everything runs in the browser.

## What's in this repo

| Folder | What it is |
|---|---|
| [`playwright-e2e-framework/`](playwright-e2e-framework/) | The test framework: Playwright + TS, multi-app support, mTLS, custom reporting, and the AI agents/skills under `.claude/` |
| [`demo-loan-app/`](demo-loan-app/) | Two small apps under test — `loan-webapp` (borrowers request loans) and `lending-webapp` (lenders approve/reject them), synced in real time |
| [`.devcontainer/`](.devcontainer/) | Codespaces config — this is what makes "zero local setup" work |

---

## Prerequisites

- A free [GitHub account](https://github.com/join).
- **Optional, for the AI-agent part (Section 5):** an [Anthropic API key](https://console.anthropic.com/settings/keys). You can also just watch that part live if you'd rather not create one during the workshop.

Everything else — Node, Docker, Playwright browsers, the Claude Code CLI — gets installed automatically when your Codespace boots. Nothing to install locally.

---

## 1. Fork the repo

You'll want your own copy so you can push branches and open PRs later (the AI agents include one that opens PRs — it needs somewhere to push to).

1. Go to the repo on GitHub and click **Fork** (top right).
2. Keep the default settings and click **Create fork**.

You now have your own copy at `github.com/<your-username>/agentic-ai-playwright-e2e-framework`. Do the rest of this guide from **your fork**, not the original.

---

## 2. Open a Codespace

1. On your fork, click the green **Code** button → **Codespaces** tab → **Create codespace on main**.
2. A browser tab opens with a VS Code-like editor. Give it a few minutes on first launch — it's building a container with Docker-in-Docker, installing dependencies, building both demo apps, and running a smoke test. You'll see this happening live in the terminal at the bottom.
3. This uses your personal free Codespaces quota (120 core-hours/month on GitHub Free — this whole workshop uses a small fraction of that). Nothing is billed.

You'll know setup finished when the terminal prints:

```
Setup complete. Try:
  cd playwright-e2e-framework
  ...
```

If you don't see that yet, give it another minute — first boot does a real Docker image build, which takes longer than a resume.

---

## 3. Browse the demo apps

Open the **Ports** tab (bottom panel, next to Terminal). You'll see several forwarded ports. Open these two in your browser (click the globe icon on each row):

| Port | App |
|---|---|
| **3100** | loan-webapp — *open this one, not 3000* |
| **3101** | lending-webapp — *open this one, not 3001* |

> **Why 3100/3101 and not 3000/3001?** The real apps only speak HTTPS (self-signed certs), and Codespaces' port-forwarding proxy can't complete a TLS handshake with a self-signed backend — you'd get a 502. Ports 3100/3101 are a small local bridge (`.devcontainer/https-bridge.js`) that makes the apps reachable from your browser. The tests themselves still talk to the real apps directly on 3000/3001, unaffected.

Try the actual workflow across both tabs:

1. On **:3100** (loan-webapp), create a new loan → status `New`.
2. On **:3101** (lending-webapp), create an approver, open the loan, assign the approver → status `Pending`.
3. Approve or reject it → the loan-webapp tab updates **automatically**, no refresh (that's the SSE + webhook sync between the two apps).

---

## 4. Run the tests

Everything below runs from `playwright-e2e-framework/`:

```bash
cd playwright-e2e-framework
```

### Run the smoke test

```bash
./run_test.sh -env=dev -tags=@SmokeTest
```

This loads `.dev.env` (already written for you), converts the included demo mTLS cert, and runs a real cross-app test: create a loan, assign an approver, approve it — headless, since Codespaces has no display.

### Watch it run — Playwright UI mode

A headless run doesn't give you much to look at, so use Playwright's UI mode instead — a full time-travel debugger you can watch in a browser tab:

```bash
npm run test:ui
```

The **Ports** tab will pop up a notification for port **8080** — open it. You get the test list, a run/watch toggle, and a step-by-step visual trace of exactly what the browser did.

### See the HTML report

```bash
npm run report
```

This starts a local report server — open the forwarded port it announces (**9323**) to browse results, screenshots, and traces from your last run.

---

## 5. Use the AI agents

This is the part that makes this framework different: instead of hand-writing Playwright specs, you describe what you want in plain English and a pipeline of specialized agents (planner → generator → self-healer) does it.

Start the CLI from `playwright-e2e-framework/`:

```bash
claude
```

First time, it'll prompt you to log in (or it'll pick up an `ANTHROPIC_API_KEY` automatically if you set one as a Codespaces secret before creating the Codespace — see [Prerequisites](#prerequisites)).

### Try it: fill a real coverage gap

Run `npm run report` and open the coverage table — you'll see a few user stories with no test coverage yet (e.g. **Loan Rejection Workflow**, **Lending Approver Management**). Let's close one of those gaps live.

**Step 1 — explore the app and draft a plan** (no Jira needed):

```
explore the lending-webapp app and draft a test plan for the loan rejection workflow
```

The `test-orchestrator` agent routes this to `playwright-test-planner`, which inspects the running app and writes a structured plan under `specs/`. Read what it comes back with.

**Step 2 — turn the plan into a real Playwright spec:**

```
generate the playwright test from that plan
```

This invokes `playwright-test-generator`, which writes an actual `.spec.ts` file following this repo's page-object conventions.

**Step 3 — run what it just wrote:**

```bash
npx playwright test --grep "@LoanRejection"   # use whatever tag it generated
```

If it fails on the first try (selectors are never perfect on the first pass), tell Claude:

```
fix the failing test
```

`playwright-test-healer` will inspect the failure and repair the spec — then re-run it yourself to confirm.

> The full pipeline (`test-orchestrator`'s "NEW TESTS" route) also includes reading a Jira story first, then opening a PR and creating Xray test cases at the end — skip those in this workshop unless you've set up your own Jira/Xray sandbox (see `playwright-e2e-framework/CLAUDE.md` for the full agent list and what each one needs).

---

## Troubleshooting

**A demo app port shows a blank page or connection error**
Make sure you opened **3100**/**3101**, not 3000/3001 (see [Section 3](#3-browse-the-demo-apps)).

**Apps don't respond right after resuming a stopped Codespace**
Give it 15–20 seconds — the demo containers and the browsing bridge restart automatically on resume, but it's not instant. Refresh the tab.

**`claude: command not found`**
Open a *new* terminal (the install happened via a shell profile that only new terminals pick up).

**Cert warning in test output ("Certificate files not found, proceeding without cert")**
Only happens if you ran `npx playwright test` directly instead of `./run_test.sh` — the latter runs cert conversion first. Harmless either way; the demo apps don't enforce client certs.

**Codespace feels slow / setup seems stuck**
First boot builds a container image from scratch (a few minutes). A resumed Codespace is much faster since the image is cached.

---

## When you're done

Stop or delete your Codespace from [github.com/codespaces](https://github.com/codespaces) to free up your monthly quota — it doesn't happen automatically just by closing the tab (though GitHub will auto-stop it after a period of inactivity).

For the full technical reference (writing tests, config, CI/CD, project structure), see [`playwright-e2e-framework/README.md`](playwright-e2e-framework/README.md) and [`playwright-e2e-framework/CLAUDE.md`](playwright-e2e-framework/CLAUDE.md).
