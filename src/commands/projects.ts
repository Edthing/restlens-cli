import { getAccessToken } from "../config.js";

interface ProjectsOptions {
  org?: string;
  server?: string;
}

export async function projects(options: ProjectsOptions): Promise<void> {
  const { token, server } = await getAccessToken(options.server);

  let url = `${server}/api/projects`;
  if (options.org) {
    url += `?organization=${encodeURIComponent(options.org)}`;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 401) {
      console.error("Not authenticated. Run: restlens auth");
    } else {
      console.error(`Failed to fetch projects: ${response.statusText}`);
    }
    process.exit(1);
  }

  const result = await response.json();
  const projectList = result.projects || [];

  if (projectList.length === 0) {
    console.log("No projects found.");
    return;
  }

  console.log("Your projects:\n");

  // Group by organization
  const byOrg: Record<string, Array<{ name: string; description: string | null }>> = {};
  for (const p of projectList) {
    const org = p.organizationSlug || "personal";
    if (!byOrg[org]) byOrg[org] = [];
    byOrg[org].push({ name: p.name, description: p.description });
  }

  for (const [org, projects] of Object.entries(byOrg)) {
    console.log(`\x1b[1m${org}\x1b[0m`);
    for (const p of projects) {
      console.log(`  ${org}/${p.name}`);
      if (p.description) {
        console.log(`    ${p.description}`);
      }
    }
    console.log();
  }

  console.log(`Total: ${projectList.length} project(s)`);
}
