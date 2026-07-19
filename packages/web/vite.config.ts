import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function publicPathRewrite(basePath: string): Plugin {
  const base = basePath === "/" ? "/" : `${basePath.replace(/\/+$/, "")}/`;
  const rootPublicPath = /(["'`(=])\/(assets)(?=\/|["'`])/g;

  return {
    name: "rewrite-public-paths",
    generateBundle(_options, bundle) {
      if (base === "/") return;
      const rewrite = (source: string): string =>
        source.replace(
          rootPublicPath,
          (_match, prefix: string, path: string) => `${prefix}${base}${path}`,
        );
      for (const output of Object.values(bundle)) {
        if (output.type === "chunk") output.code = rewrite(output.code);
        else if (typeof output.source === "string")
          output.source = rewrite(output.source);
      }
    },
  };
}

const basePath = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [react(), publicPathRewrite(basePath)],
  server: {
    port: 5173,
  },
});
