import { getAccessToken } from "../config.js";
import { readAndParseSpec, uploadSpec, parseProject } from "../api.js";

interface UploadOptions {
  project: string;
  tag?: string;
  server?: string;
}

export async function upload(file: string, options: UploadOptions): Promise<void> {
  const { token, server } = await getAccessToken(options.server);

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

  try {
    const result = await uploadSpec(server, token, orgSlug, projectName, specData, options.tag);

    console.log(`\nUpload successful!`);
    console.log(`  Specification ID: ${result.specification.id}`);
    console.log(`  Version: ${result.specification.version}`);

    if (result.evaluation?.status === "evaluating") {
      console.log(`\nEvaluation started. Check status with:`);
      console.log(`  restlens violations -p ${options.project}`);
    }
  } catch (error) {
    console.error(`Upload failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
