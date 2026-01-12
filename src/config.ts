import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, writeFile, unlink } from "fs/promises";
import { DEFAULT_API_URL, type ServerAuth, type AuthConfig } from "@restlens/lib";

const CONFIG_DIR = join(homedir(), ".restlens");
const CONFIG_FILE = join(CONFIG_DIR, "auth.json");

// Re-export types
export type { ServerAuth };
export type Config = AuthConfig;

/**
 * Get the server URL from environment or default
 */
export function getServerUrl(override?: string): string {
  return override || process.env.RESTLENS_URL || process.env.RESTLENS_SERVER || DEFAULT_API_URL;
}

export async function getConfig(): Promise<Config> {
  try {
    const data = await readFile(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(data);
    // Migrate old format
    if (parsed.accessToken && !parsed.servers) {
      return {
        servers: {
          [parsed.server || DEFAULT_API_URL]: {
            accessToken: parsed.accessToken,
            refreshToken: parsed.refreshToken,
            expiresAt: parsed.expiresAt,
          },
        },
      };
    }
    return parsed.servers ? parsed : { servers: {} };
  } catch {
    return { servers: {} };
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function saveServerAuth(server: string, auth: ServerAuth): Promise<void> {
  const config = await getConfig();
  config.servers[server] = auth;
  await saveConfig(config);
}

export async function clearConfig(): Promise<void> {
  try {
    await unlink(CONFIG_FILE);
  } catch {
    // File doesn't exist, that's fine
  }
}

export async function clearServerAuth(server: string): Promise<void> {
  const config = await getConfig();
  delete config.servers[server];
  await saveConfig(config);
}

export async function getAccessToken(serverOverride?: string): Promise<{ token: string; server: string }> {
  const server = getServerUrl(serverOverride);
  const config = await getConfig();
  const auth = config.servers[server];

  if (!auth?.accessToken) {
    const serverHint = server !== DEFAULT_API_URL ? ` --server ${server}` : "";
    throw new Error(`Not authenticated for ${server}. Run: restlens auth${serverHint}`);
  }

  // Check if token is expired (with 5 min buffer)
  if (auth.expiresAt && Date.now() > auth.expiresAt - 5 * 60 * 1000) {
    // Try to refresh
    if (auth.refreshToken) {
      try {
        const newTokens = await refreshTokens(server, auth.refreshToken);
        auth.accessToken = newTokens.accessToken;
        auth.refreshToken = newTokens.refreshToken;
        auth.expiresAt = Date.now() + newTokens.expiresIn * 1000;
        await saveServerAuth(server, auth);
      } catch {
        const serverHint = server !== DEFAULT_API_URL ? ` --server ${server}` : "";
        throw new Error(`Token expired for ${server}. Run: restlens auth${serverHint}`);
      }
    } else {
      const serverHint = server !== DEFAULT_API_URL ? ` --server ${server}` : "";
      throw new Error(`Token expired for ${server}. Run: restlens auth${serverHint}`);
    }
  }

  return { token: auth.accessToken, server };
}

async function refreshTokens(
  server: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch(`${server}/api/oauth/token`, {
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
