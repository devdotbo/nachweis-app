import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

// SharedArrayBuffer (bb.js multi-threading) needs a cross-origin isolated page.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// POST /__spike/result stores the browser's proof so native `bb verify -t evm` can check it.
function resultSink(): Plugin {
  const handler = (server: { middlewares: { use: (fn: any) => void } }) => {
    server.middlewares.use((req: any, res: any, next: () => void) => {
      if (req.method !== "POST" || req.url !== "/__spike/result") return next();
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const dir = join(process.cwd(), "results", `run-${body.startedAt}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "proof"), Buffer.from(body.proofHex, "hex"));
        writeFileSync(join(dir, "public_inputs"), Buffer.from(body.publicInputs.map((h: string) => h.replace(/^0x/, "")).join(""), "hex"));
        if (body.vkHex) writeFileSync(join(dir, "vk"), Buffer.from(body.vkHex, "hex"));
        writeFileSync(join(dir, "report.json"), JSON.stringify(body, null, 2));
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ dir }));
      });
    });
  };
  return { name: "spike-result-sink", configureServer: handler, configurePreviewServer: handler };
}

export default defineConfig({
  server: { headers: isolation, port: 5175, strictPort: true },
  preview: { headers: isolation, port: 5176, strictPort: true },
  optimizeDeps: { exclude: ["@noir-lang/noir_js", "@noir-lang/acvm_js", "@noir-lang/noirc_abi", "@aztec/bb.js"] },
  build: { target: "esnext" },
  plugins: [resultSink()],
});
