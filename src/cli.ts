#!/usr/bin/env node

import { program } from "commander";
import { auth } from "./commands/auth.js";
import { upload } from "./commands/upload.js";
import { evaluate } from "./commands/evaluate.js";
import { violations } from "./commands/violations.js";
import { projects } from "./commands/projects.js";
import { getConfig } from "./config.js";

program
  .name("restlens")
  .description("CLI for REST Lens API evaluation")
  .version("0.1.0");

program
  .command("auth")
  .description("Authenticate with REST Lens (opens browser)")
  .option("--server <url>", "REST Lens server URL", "https://restlens.com")
  .action(auth);

program
  .command("upload <file>")
  .description("Upload an OpenAPI specification for evaluation")
  .requiredOption("-p, --project <org/name>", "Project in org/name format")
  .option("--tag <tag>", "Version tag (e.g., v1.0.0)")
  .option("--server <url>", "REST Lens server URL")
  .action(upload);

program
  .command("eval <file>")
  .alias("evaluate")
  .description("Upload spec, wait for evaluation, and show violations")
  .requiredOption("-p, --project <org/name>", "Project in org/name format")
  .option("--tag <tag>", "Version tag (e.g., v1.0.0)")
  .option("--timeout <seconds>", "Max wait time for evaluation", "60")
  .option("--server <url>", "REST Lens server URL")
  .action(evaluate);

program
  .command("violations")
  .description("Get violations for the latest specification")
  .requiredOption("-p, --project <org/name>", "Project in org/name format")
  .option("--severity <level>", "Filter by severity (error, warning, info)")
  .option("--limit <n>", "Max violations to show", "50")
  .option("--server <url>", "REST Lens server URL")
  .action(violations);

program
  .command("projects")
  .description("List accessible projects")
  .option("--org <slug>", "Filter by organization")
  .option("--server <url>", "REST Lens server URL")
  .action(projects);

program
  .command("status")
  .description("Show current authentication status")
  .action(async () => {
    const config = await getConfig();
    if (config.accessToken) {
      console.log(`Authenticated to: ${config.server}`);
      console.log(`Token expires: ${new Date(config.expiresAt || 0).toLocaleString()}`);
    } else {
      console.log("Not authenticated. Run: restlens auth");
    }
  });

program
  .command("logout")
  .description("Clear stored credentials")
  .action(async () => {
    const { clearConfig } = await import("./config.js");
    await clearConfig();
    console.log("Logged out successfully.");
  });

program.parse();
