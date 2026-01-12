import { readFile } from "fs/promises";
import { resolve } from "path";
import { parseSpec, parseProject } from "@restlens/lib";

// Re-export parseProject from lib
export { parseProject };

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
  } catch {
    throw new Error(`Error reading file: ${filePath}`);
  }

  return parseSpec(specContent);
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
