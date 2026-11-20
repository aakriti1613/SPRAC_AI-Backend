// Template catalogue rules enforced by the backend.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startServer } from "./helpers/server.js";

let server;
before(async () => {
  server = await startServer();
  await server.login();
});
after(async () => {
  await server?.stop();
});

test("portal-admin-v2 (and its aliases) is refused with a clear reason and leaves no files", async () => {
  const config = {
    appName: "V2 Check",
    portalName: "v2-check",
    modules: [{ id: "items", singularName: "Item", pluralName: "Items", fields: [{ key: "name", label: "Name", type: "text" }] }],
  };
  for (const templateId of ["portal-admin-v2", "temp2", "Template 2"]) {
    const projectName = `v2-${templateId.replace(/\W+/g, "-").toLowerCase()}`;
    const gen = await server.request("POST", "/api/generate", { templateId, projectName, config });
    assert.equal(gen.status, 400, `${templateId} via /api/generate`);
    assert.match(gen.body.error, /disabled/);
    assert.equal(fs.existsSync(path.join(server.outputDir, projectName)), false, "no half-generated folder");

    const prov = await server.request("POST", "/api/portal/provision", { templateId, projectName, portalConfig: {} });
    assert.equal(prov.status, 400, `${templateId} via /api/portal/provision`);
    assert.match(prov.body.error, /disabled/);
  }
});
