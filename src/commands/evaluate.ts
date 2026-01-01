import { readFile } from "fs/promises";
import { resolve } from "path";
import { getAccessToken } from "../config.js";

interface EvaluateOptions {
  project: string;
  tag?: string;
  timeout: string;
  server?: string;
}

export async function evaluate(file: string, options: EvaluateOptions): Promise<void> {
  const { token, server } = await getAccessToken(options.server);
  const timeoutMs = parseInt(options.timeout, 10) * 1000;

  // Parse project
  const [orgSlug, projectName] = options.project.split("/");
  if (!orgSlug || !projectName) {
    console.error("Error: Project must be in org/name format (e.g., my-org/my-project)");
    process.exit(1);
  }

  // Read spec file
  const filePath = resolve(process.cwd(), file);
  let specContent: string;
  try {
    specContent = await readFile(filePath, "utf-8");
  } catch (error) {
    console.error(`Error reading file: ${filePath}`);
    process.exit(1);
  }

  console.log(`Uploading ${file} to ${options.project}...`);

  // Upload specification
  const uploadResponse = await fetch(
    `${server}/api/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(projectName)}/specifications`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        specification: specContent,
        tag: options.tag,
      }),
    }
  );

  if (!uploadResponse.ok) {
    const error = await uploadResponse.json().catch(() => ({ error: "Unknown error" }));
    console.error(`Upload failed: ${error.error || uploadResponse.statusText}`);
    process.exit(1);
  }

  const uploadResult = await uploadResponse.json();
  const specId = uploadResult.specification.id;
  console.log(`Uploaded. Specification ID: ${specId}`);

  // Wait for evaluation
  console.log(`\nWaiting for evaluation (timeout: ${options.timeout}s)...`);
  const startTime = Date.now();
  let status = "evaluating";
  let lastDots = 0;

  while (status === "evaluating" && Date.now() - startTime < timeoutMs) {
    await sleep(2000);

    const dots = Math.floor((Date.now() - startTime) / 2000) % 4;
    if (dots !== lastDots) {
      process.stdout.write(`\rEvaluating${".".repeat(dots + 1)}${" ".repeat(3 - dots)}`);
      lastDots = dots;
    }

    // Check status
    const statusResponse = await fetch(
      `${server}/api/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(projectName)}/specifications/${specId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (statusResponse.ok) {
      const statusResult = await statusResponse.json();
      status = statusResult.evaluationStatus || "evaluating";
    }
  }

  console.log("\n");

  if (status === "evaluating") {
    console.log("Evaluation still in progress. Check back with:");
    console.log(`  restlens violations -p ${options.project}`);
    return;
  }

  // Get violations
  const violationsResponse = await fetch(
    `${server}/api/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(projectName)}/specifications/${specId}/violations`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!violationsResponse.ok) {
    console.error("Failed to fetch violations");
    process.exit(1);
  }

  const violationsResult = await violationsResponse.json();
  printViolations(violationsResult);
}

function printViolations(result: {
  violations?: Array<{
    key: { path?: string; operation_id?: string; schema_path?: string };
    value: Array<{ message: string; severity: string; rule_id: number }>;
  }>;
  totalViolations?: number;
}): void {
  const violations = result.violations || [];
  const total = result.totalViolations || 0;

  if (total === 0) {
    console.log("No violations found!");
    return;
  }

  console.log(`Found ${total} violation(s):\n`);

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const group of violations) {
    const location = group.key.path || group.key.schema_path || "(global)";

    for (const v of group.value) {
      const severityIcon =
        v.severity === "error" ? "\x1b[31m\u2717\x1b[0m" :
        v.severity === "warning" ? "\x1b[33m\u26a0\x1b[0m" :
        "\x1b[34m\u2139\x1b[0m";

      if (v.severity === "error") errorCount++;
      else if (v.severity === "warning") warningCount++;
      else infoCount++;

      console.log(`${severityIcon} [Rule ${v.rule_id}] ${location}`);
      console.log(`  ${v.message}\n`);
    }
  }

  console.log("---");
  console.log(`Summary: ${errorCount} errors, ${warningCount} warnings, ${infoCount} info`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
