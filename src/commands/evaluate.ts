import { getAccessToken } from "../config.js";
import { readAndParseSpec, uploadSpec, parseProject } from "../api.js";

interface EvaluateOptions {
  project: string;
  tag?: string;
  timeout: string;
  server?: string;
}

export async function evaluate(file: string, options: EvaluateOptions): Promise<void> {
  const { token, server } = await getAccessToken(options.server);
  const timeoutMs = parseInt(options.timeout, 10) * 1000;

  let orgSlug: string, projectName: string;
  try {
    ({ orgSlug, projectName } = parseProject(options.project));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }

  let specData: object;
  try {
    specData = await readAndParseSpec(file);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }

  console.log(`Uploading ${file} to ${options.project}...`);

  let specId: string;
  try {
    const uploadResult = await uploadSpec(server, token, orgSlug, projectName, specData, options.tag);
    specId = uploadResult.specification.id;
    console.log(`Uploaded. Specification ID: ${specId}`);
  } catch (error) {
    console.error(`Upload failed: ${(error as Error).message}`);
    process.exit(1);
  }

  // Wait for evaluation using SSE stream
  console.log(`\nWaiting for evaluation (timeout: ${options.timeout}s)...`);

  const completed = await waitForEvaluation(
    server,
    token,
    orgSlug,
    projectName,
    specId,
    timeoutMs
  );

  if (!completed) {
    console.log("\nEvaluation still in progress. Check back with:");
    console.log(`  restlens violations -p ${options.project}`);
    return;
  }

  console.log("\nEvaluation complete!");

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
}): void {
  const violations = result.violations || [];

  // Count total violations
  let total = 0;
  for (const group of violations) {
    total += group.value.length;
  }

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

async function waitForEvaluation(
  server: string,
  token: string,
  orgSlug: string,
  projectName: string,
  specId: string,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, timeoutMs);

    let dotCount = 0;
    const dotInterval = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      process.stdout.write(`\rEvaluating${".".repeat(dotCount + 1)}${" ".repeat(3 - dotCount)}`);
    }, 500);

    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(dotInterval);
    };

    fetch(
      `${server}/api/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(projectName)}/specifications/${specId}/stream`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        if (!response.ok || !response.body) {
          cleanup();
          resolve(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === "status" && event.status === "done") {
                  cleanup();
                  resolve(true);
                  return;
                }
                if (event.status === "failed") {
                  cleanup();
                  resolve(true);
                  return;
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        cleanup();
        resolve(true);
      })
      .catch(() => {
        cleanup();
        resolve(false);
      });
  });
}
