import { getAccessToken } from "../config.js";
import { printViolations } from "../format.js";

interface ViolationsOptions {
  project: string;
  severity?: string;
  limit: string;
  server?: string;
}

export async function violations(options: ViolationsOptions): Promise<void> {
  const { token, server } = await getAccessToken(options.server);

  // Parse project
  const [orgSlug, projectName] = options.project.split("/");
  if (!orgSlug || !projectName) {
    console.error("Error: Project must be in org/name format (e.g., my-org/my-project)");
    process.exit(1);
  }

  console.log(`Fetching violations for ${options.project}...\n`);

  // Get latest specification
  const specsResponse = await fetch(
    `${server}/api/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(projectName)}/specifications`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!specsResponse.ok) {
    if (specsResponse.status === 404) {
      console.error("Project not found or no access");
    } else {
      console.error(`Failed to fetch specifications: ${specsResponse.statusText}`);
    }
    process.exit(1);
  }

  const specs = await specsResponse.json();
  if (!specs.specifications || specs.specifications.length === 0) {
    console.log("No specifications found for this project.");
    console.log("Upload one with: restlens upload <file> -p " + options.project);
    return;
  }

  const latestSpec = specs.specifications[0];
  console.log(`Latest specification: v${latestSpec.version} (${latestSpec.id})`);
  console.log(`Status: ${latestSpec.evaluationStatus || "unknown"}\n`);

  if (latestSpec.evaluationStatus === "evaluating") {
    console.log("Evaluation still in progress. Try again in a few seconds.");
    return;
  }

  // Get violations
  let url = `${server}/api/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(projectName)}/specifications/${latestSpec.id}/violations`;
  const params = new URLSearchParams();
  if (options.severity) params.set("severity", options.severity);
  if (options.limit) params.set("limit", options.limit);
  if (params.toString()) url += `?${params.toString()}`;

  const violationsResponse = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!violationsResponse.ok) {
    console.error("Failed to fetch violations");
    process.exit(1);
  }

  const result = await violationsResponse.json();
  printViolations(result);
}
