#!/usr/bin/env bash
set -e

echo $JIRA_BASE_URL
JIRA_PROJECT_KEY="${JIRA_PROJECT_KEY:-SCRUM}"
TEST_EXECUTION_SUMMARY="${TEST_EXECUTION_SUMMARY:-Automated Test Execution}"
TEST_EXECUTION_DESCRIPTION="${TEST_EXECUTION_DESCRIPTION:-This is an automated test execution triggered by the Playwright Cucumber Framework GitLab CI/CD Pipeline}"

# 1. Create Test Execution in JIRA - XRay
TEST_EXECUTION_KEY=$(curl -s -X POST "$JIRA_BASE_URL/rest/raven/2.0/api/testexec" \
        -H "Authorization: Bearer $JIRA_XRAY_API_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
                "fields": {
                    "project": { "key": "'$JIRA_PROJECT_KEY'"},
                    "summary": "'$TEST_EXECUTION_SUMMARY'",
                    "description": "'$TEST_EXECUTION_DESCRIPTION'",
                    "issuetype": { "name": "Test Execution" }
                    }
                }' | jq -r '.key')

echo "Test Execution created: $TEST_EXECUTION_KEY"

# 2. Attach HTML report to the Test Execution
echo "Attaching HTML report to Test Execution..."
curl -s -X POST "$JIRA_BASE_URL/rest/api/2/issue/$TEST_EXECUTION_KEY/attachments" \
        -H "Authorization: Bearer $JIRA_XRAY_API_TOKEN" \
        -H "X-Atlassian-Token: no-check" \
        -F "file=@reports/html/cucumber_report.html"

# 3. Import cucumber.json in XRay Test Execution:
curl -s -X POST "$JIRA_BASE_URL/rest/raven/1.0/import/execution/cucumber" \
        -H "Authorization: Bearer $JIRA_XRAY_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "@reports/cucumber.json"

