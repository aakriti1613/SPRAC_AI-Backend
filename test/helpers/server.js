// Test helper: start the real backend (index.js) in a child process with
// throw-away output/portal folders, and talk to it over HTTP.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = path.resolve(here, "..", "..");

export const TEST_ADMIN = {
  email: "platform-admin@example.test",
  password: "test-password-123456",
};

let nextPort = 5400 + Math.floor(Math.random() * 400);

export async function startServer(extraEnv = {}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "platform-test-"));
  const outputDir = path.join(workDir, "output");
  const portalsDir = path.join(workDir, "portals");
  const port = nextPort++;

  const env = {
    ...process.env,
    PORT: String(port),
    OUTPUT_DIR: outputDir,
    SPARC_EVIDENCE_DIR: path.join(workDir, "evidence"), // feedback from tests never touches the real evidence
    PORTALS_DIR: portalsDir,
    PLATFORM_ADMIN_EMAIL: TEST_ADMIN.email,
    PLATFORM_ADMIN_PASSWORD: TEST_ADMIN.password,
    AUTH_SECRET: "test-secret-please-change-0123456789",
    // Never let tests reach real services.
    GITHUB_TOKEN: "",
    VERCEL_TOKEN: "",
    GEMINI_API_KEY: "",
    SUPABASE_ACCESS_TOKEN: "",
    ...extraEnv,
  };

  const child = spawn(process.execPath, ["index.js"], { cwd: BACKEND_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${log}`)), 20000);
    const check = setInterval(() => {
      if (log.includes("listening on")) {
        clearInterval(check);
        clearTimeout(timer);
        resolve();
      }
    }, 50);
    child.on("exit", (code) => {
      clearInterval(check);
      clearTimeout(timer);
      reject(new Error(`server exited early (${code}):\n${log}`));
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const server = {
    baseUrl,
    outputDir,
    portalsDir,
    token: "",
    get log() {
      return log;
    },
    async request(method, urlPath, body, { auth = true } = {}) {
      const headers = { "Content-Type": "application/json" };
      if (auth && server.token) headers.Authorization = `Bearer ${server.token}`;
      const res = await fetch(baseUrl + urlPath, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text.slice(0, 200) };
      }
      return { status: res.status, body: json };
    },
    async login() {
      const res = await server.request("POST", "/api/auth/login", TEST_ADMIN, { auth: false });
      if (res.status === 404) return false; // backend without auth (older version)
      if (!res.body?.token) throw new Error(`login failed: ${JSON.stringify(res)}`);
      server.token = res.body.token;
      return true;
    },
    async stop() {
      child.kill();
      await new Promise((r) => setTimeout(r, 200));
      fs.rmSync(workDir, { recursive: true, force: true });
    },
  };
  return server;
}

// Replace values that change on every run (ids, timestamps, temp paths).
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g;

export function stable(value, tempDirs = []) {
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (typeof v !== "string") return v;
      let s = v;
      for (const dir of tempDirs) s = s.split(dir).join("<tmp>");
      if (s.startsWith("<tmp>")) s = s.replace(/\\/g, "/"); // same result on Windows and Linux
      return s.replace(UUID_RE, "<uuid>").replace(ISO_RE, "<iso>");
    })
  );
}

export function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}
