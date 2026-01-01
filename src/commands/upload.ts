import { readFile } from "fs/promises";
import { resolve } from "path";
import { getAccessToken } from "../config.js";

interface UploadOptions {
  project: string;
  tag?: string;
  server?: string;
}

export async function upload(file: string, options: UploadOptions): Promise<void> {
  const { token, server } = await getAccessToken(options.server);

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

  // Upload specification via API
  const response = await fetch(
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

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    console.error(`Upload failed: ${error.error || response.statusText}`);
    process.exit(1);
  }

  const result = await response.json();
  console.log(`\nUpload successful!`);
  console.log(`  Specification ID: ${result.specification.id}`);
  console.log(`  Version: ${result.specification.version}`);

  if (result.evaluation?.status === "evaluating") {
    console.log(`\nEvaluation started. Check status with:`);
    console.log(`  restlens violations -p ${options.project}`);
  }
}
