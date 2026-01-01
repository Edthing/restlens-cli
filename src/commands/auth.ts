import { createServer } from "http";
import { randomBytes, createHash } from "crypto";
import { saveConfig } from "../config.js";

interface AuthOptions {
  server: string;
}

export async function auth(options: AuthOptions): Promise<void> {
  const server = options.server;

  console.log("Starting authentication...");

  // Generate PKCE challenge
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const state = randomBytes(16).toString("hex");

  // Start local callback server
  const { port, waitForCallback, closeServer } = await startCallbackServer();

  const redirectUri = `http://localhost:${port}/callback`;

  // Build authorization URL
  const authUrl = new URL(`${server}/api/mcp/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", "restlens-cli");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  console.log("\nOpening browser for authentication...");
  console.log(`If browser doesn't open, visit:\n${authUrl.toString()}\n`);

  // Open browser
  const open = (await import("open")).default;
  await open(authUrl.toString());

  // Wait for callback
  console.log("Waiting for authentication...");
  const result = await waitForCallback();
  closeServer();

  if (result.error) {
    console.error(`\nAuthentication failed: ${result.error}`);
    if (result.errorDescription) {
      console.error(result.errorDescription);
    }
    process.exit(1);
  }

  if (result.state !== state) {
    console.error("\nAuthentication failed: State mismatch");
    process.exit(1);
  }

  // Exchange code for tokens
  console.log("Exchanging code for tokens...");
  const tokenResponse = await fetch(`${server}/api/mcp/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: result.code!,
      redirect_uri: redirectUri,
      client_id: "restlens-cli",
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.json();
    console.error(`\nToken exchange failed: ${error.error_description || error.error}`);
    process.exit(1);
  }

  const tokens = await tokenResponse.json();

  // Save config
  await saveConfig({
    server,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  });

  console.log("\nAuthentication successful!");
  console.log(`Logged in to: ${server}`);
}

interface CallbackResult {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

function startCallbackServer(): Promise<{
  port: number;
  waitForCallback: () => Promise<CallbackResult>;
  closeServer: () => void;
}> {
  return new Promise((resolve) => {
    let resolveCallback: (result: CallbackResult) => void;
    const callbackPromise = new Promise<CallbackResult>((res) => {
      resolveCallback = res;
    });

    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        // Send response to browser
        res.writeHead(200, { "Content-Type": "text/html" });
        if (error) {
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Authentication Failed</title></head>
              <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center;">
                  <h1 style="color: #dc2626;">Authentication Failed</h1>
                  <p>${errorDescription || error}</p>
                  <p>You can close this window.</p>
                </div>
              </body>
            </html>
          `);
        } else {
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Authentication Successful</title></head>
              <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center;">
                  <h1 style="color: #16a34a;">Authentication Successful</h1>
                  <p>You can close this window and return to the terminal.</p>
                </div>
              </body>
            </html>
          `);
        }

        resolveCallback({
          code: code || undefined,
          state: state || undefined,
          error: error || undefined,
          errorDescription: errorDescription || undefined,
        });
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    // Listen on random available port
    server.listen(0, "localhost", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        port,
        waitForCallback: () => callbackPromise,
        closeServer: () => server.close(),
      });
    });
  });
}
