// Platform login: unit tests for lib/auth.js + checks against the real server.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createAuth } from "../lib/auth.js";
import { startServer, TEST_ADMIN } from "./helpers/server.js";

describe("lib/auth", () => {
  const base = { adminEmail: "Admin@Example.test", adminPassword: "correct horse", secret: "s3cret" };

  test("correct login returns a token that verifies", () => {
    const auth = createAuth(base);
    const r = auth.login("admin@example.test", "correct horse");
    assert.equal(r.ok, true);
    assert.equal(auth.verifyToken(r.token).email, "admin@example.test");
  });

  test("wrong email or password is rejected with 401", () => {
    const auth = createAuth(base);
    assert.equal(auth.login("admin@example.test", "wrong").status, 401);
    assert.equal(auth.login("someone@example.test", "correct horse").status, 401);
    assert.equal(auth.login(undefined, undefined).status, 401);
  });

  test("not configured -> 503, never a token", () => {
    const auth = createAuth({ secret: "x" });
    const r = auth.login("", "");
    assert.equal(r.status, 503);
    assert.equal(r.token, undefined);
  });

  test("tampered, foreign and malformed tokens are rejected", () => {
    const auth = createAuth(base);
    const { token } = auth.login("admin@example.test", "correct horse");
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "platform-admin", email: "x", iat: 0, exp: 9999999999 })).toString("base64url");
    assert.equal(auth.verifyToken(`${forged}.${sig}`), null);
    assert.equal(auth.verifyToken(`${payload}.${sig}x`), null);
    assert.equal(auth.verifyToken(`${payload}.${sig}.extra`), null);
    assert.equal(auth.verifyToken("garbage"), null);
    assert.equal(auth.verifyToken(undefined), null);
    const other = createAuth({ ...base, secret: "different" });
    assert.equal(other.verifyToken(token), null);
  });

  test("tokens expire", () => {
    let clock = Date.now();
    const auth = createAuth({ ...base, ttlSeconds: 60, now: () => clock });
    const { token } = auth.login("admin@example.test", "correct horse");
    assert.ok(auth.verifyToken(token));
    clock += 61 * 1000;
    assert.equal(auth.verifyToken(token), null);
  });
});

describe("server endpoints", () => {
  let server;
  before(async () => {
    server = await startServer();
  });
  after(async () => {
    await server?.stop();
  });

  const protectedCalls = [
    ["POST", "/api/generate", { templateId: "portal-admin", projectName: "x" }],
    ["POST", "/api/generate-config", { description: "x", templateId: "landing-modern" }],
    ["POST", "/api/validate-config", { config: {} }],
    ["POST", "/api/push", { projectName: "x" }],
    ["POST", "/api/deploy", { repoName: "x", owner: "y" }],
    ["POST", "/api/portal/provision", { templateId: "portal-admin", projectName: "x" }],
    ["POST", "/api/portal/create", {}],
    ["GET", "/api/portals"],
    ["GET", "/api/portal/demo-admin/config"],
    ["GET", "/api/portal/demo-admin/agents"],
    ["DELETE", "/api/portal/demo-admin/agents/some-id"],
    ["GET", "/api/auth/me"],
  ];

  test("every protected endpoint returns 401 without a token", async () => {
    server.token = "";
    for (const [method, path, body] of protectedCalls) {
      const res = await server.request(method, path, body);
      assert.equal(res.status, 401, `${method} ${path} should be protected`);
    }
  });

  test("a forged token is rejected", async () => {
    server.token = "eyJzdWIiOiJwbGF0Zm9ybS1hZG1pbiJ9.not-a-real-signature";
    const res = await server.request("GET", "/api/portals");
    assert.equal(res.status, 401);
  });

  test("health check stays public", async () => {
    server.token = "";
    const res = await server.request("GET", "/api/schema");
    assert.equal(res.status, 200);
  });

  test("wrong password is refused, right password works", async () => {
    const bad = await server.request("POST", "/api/auth/login", { email: TEST_ADMIN.email, password: "nope" }, { auth: false });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.token, undefined);

    assert.equal(await server.login(), true);
    const me = await server.request("GET", "/api/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, TEST_ADMIN.email);
    const portals = await server.request("GET", "/api/portals");
    assert.equal(portals.status, 200);
  });
});

describe("server without login configured", () => {
  let server;
  before(async () => {
    server = await startServer({ PLATFORM_ADMIN_EMAIL: "", PLATFORM_ADMIN_PASSWORD: "" });
  });
  after(async () => {
    await server?.stop();
  });

  test("login says 'not configured' and the API stays locked", async () => {
    const res = await server.request("POST", "/api/auth/login", { email: "a@b.c", password: "x" }, { auth: false });
    assert.equal(res.status, 503);
    assert.equal((await server.request("GET", "/api/portals")).status, 401);
    assert.match(server.log, /platform login: NOT CONFIGURED/);
  });
});
