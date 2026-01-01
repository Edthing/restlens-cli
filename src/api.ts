import { readFile } from "fs/promises";
import { resolve } from "path";
import { parse as parseYaml } from "yaml";

export interface UploadResult {
  specification: {
    id: string;
    version: number;
  };
  evaluation?: {
    status: string;
  };
}

export async function readAndParseSpec(file: string): Promise<object> {
  const filePath = resolve(process.cwd(), file);

  let specContent: string;
  try {
    specContent = await readFile(filePath, "utf-8");
  } catch (error) {
    throw new Error(`Error reading file: ${filePath}`);
  }

  // Parse the spec (try JSON first, then YAML)
  try {
    return JSON.parse(specContent);
  } catch {
    try {
      return parseYaml(specContent);
    } catch (e) {
      throw new Error("Invalid specification format. Must be valid JSON or YAML.");
    }
  }
}

export async function uploadSpec(
  server: string,
  token: string,
  orgSlug: string,
  projectName: string,
  specData: object,
  tag?: string
): Promise<UploadResult> {
  const response = await fetch(
    `${server}/api/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(projectName)}/specifications`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        spec: specData,
        tag,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || response.statusText);
  }

  return response.json();
}

export function parseProject(project: string): { orgSlug: string; projectName: string } {
  const [orgSlug, projectName] = project.split("/");
  if (!orgSlug || !projectName) {
    throw new Error("Project must be in org/name format (e.g., my-org/my-project)");
  }
  return { orgSlug, projectName };
}
