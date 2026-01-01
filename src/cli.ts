#!/usr/bin/env node

import { program } from "commander";
import { auth } from "./commands/auth.js";
import { upload } from "./commands/upload.js";
import { evaluate } from "./commands/evaluate.js";
import { violations } from "./commands/violations.js";
import { projects } from "./commands/projects.js";
import { getConfig, getServerUrl, clearServerAuth } from "./config.js";

program
  .name("restlens")
  .description("CLI for REST Lens API evaluation. Set RESTLENS_URL env var for non-production servers.")
  .version("0.1.0");

program
  .command("auth")
  .description("Authenticate with REST Lens (opens browser)")
  .option("--server <url>", "REST Lens server URL (or set RESTLENS_URL)")
  .action(auth);

program
  .command("upload <file>")
  .description("Upload an OpenAPI specification for evaluation")
  .requiredOption("-p, --project <org/name>", "Project in org/name format")
  .option("--tag <tag>", "Version tag (e.g., v1.0.0)")
  .option("--server <url>", "REST Lens server URL (or set RESTLENS_URL)")
  .action(upload);

program
  .command("eval <file>")
  .alias("evaluate")
  .description("Upload spec, wait for evaluation, and show violations")
  .requiredOption("-p, --project <org/name>", "Project in org/name format")
  .option("--tag <tag>", "Version tag (e.g., v1.0.0)")
  .option("--timeout <seconds>", "Max wait time for evaluation", "60")
  .option("--server <url>", "REST Lens server URL (or set RESTLENS_URL)")
  .action(evaluate);

program
  .command("violations")
  .description("Get violations for the latest specification")
  .requiredOption("-p, --project <org/name>", "Project in org/name format")
  .option("--severity <level>", "Filter by severity (error, warning, info)")
  .option("--limit <n>", "Max violations to show", "50")
  .option("--server <url>", "REST Lens server URL (or set RESTLENS_URL)")
  .action(violations);

program
  .command("projects")
  .description("List accessible projects")
  .option("--org <slug>", "Filter by organization")
  .option("--server <url>", "REST Lens server URL (or set RESTLENS_URL)")
  .action(projects);

program
  .command("status")
  .description("Show current authentication status")
  .option("--server <url>", "Check status for specific server")
  .action(async (options: { server?: string }) => {
    const config = await getConfig();
    const servers = Object.keys(config.servers);

    if (servers.length === 0) {
      console.log("Not authenticated to any servers.");
      console.log("Run: restlens auth");
      return;
    }

    if (options.server) {
      const server = getServerUrl(options.server);
      const auth = config.servers[server];
      if (auth) {
        console.log(`Server: ${server}`);
        console.log(`Expires: ${new Date(auth.expiresAt || 0).toLocaleString()}`);
      } else {
        console.log(`Not authenticated to ${server}`);
      }
    } else {
      console.log("Authenticated servers:\n");
      for (const server of servers) {
        const auth = config.servers[server];
        const expires = new Date(auth.expiresAt || 0);
        const expired = expires < new Date();
        console.log(`  ${server}`);
        console.log(`    Expires: ${expires.toLocaleString()}${expired ? " (expired)" : ""}`);
      }
    }
  });

program
  .command("logout")
  .description("Clear stored credentials")
  .option("--server <url>", "Logout from specific server (default: all)")
  .action(async (options: { server?: string }) => {
    if (options.server) {
      const server = getServerUrl(options.server);
      await clearServerAuth(server);
      console.log(`Logged out from: ${server}`);
    } else {
      const { clearConfig } = await import("./config.js");
      await clearConfig();
      console.log("Logged out from all servers.");
    }
  });

program.parse();
