import { mkdirSync, writeFileSync } from "node:fs";

const serverDirectory = new URL("../dist/server/", import.meta.url);
const serverEntry = new URL("../dist/server/index.js", import.meta.url);

mkdirSync(serverDirectory, { recursive: true });
writeFileSync(
  serverEntry,
  `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    const url = new URL(request.url);
    url.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
`,
);
