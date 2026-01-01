import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, writeFile, unlink } from "fs/promises";

const CONFIG_DIR = join(homedir(), ".restlens");
const CONFIG_FILE = join(CONFIG_DIR, "auth.json");

export interface Config {
  server: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export async function getConfig(): Promise<Config> {
  try {
    const data = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { server: "https://restlens.com" };
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function clearConfig(): Promise<void> {
  try {
    await unlink(CONFIG_FILE);
  } catch {
    // File doesn't exist, that's fine
  }
}

export async function getAccessToken(serverOverride?: string): Promise<{ token: string; server: string }> {
  const config = await getConfig();
  const server = serverOverride || config.server;

  if (!config.accessToken) {
    throw new Error("Not authenticated. Run: restlens auth");
  }

  // Check if token is expired (with 5 min buffer)
  if (config.expiresAt && Date.now() > config.expiresAt - 5 * 60 * 1000) {
    // Try to refresh
    if (config.refreshToken) {
      try {
        const newTokens = await refreshTokens(server, config.refreshToken);
        config.accessToken = newTokens.accessToken;
        config.refreshToken = newTokens.refreshToken;
        config.expiresAt = Date.now() + newTokens.expiresIn * 1000;
        await saveConfig(config);
      } catch {
        throw new Error("Token expired. Run: restlens auth");
      }
    } else {
      throw new Error("Token expired. Run: restlens auth");
    }
  }

  return { token: config.accessToken, server };
}

async function refreshTokens(
  server: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch(`${server}/api/mcp/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh token");
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}
