import { defineConfig } from "vite";
// @ts-ignore — Node-only photo pipeline.
import { buildGallery } from "./scripts/gallery.mjs";
import path from "node:path";

export default defineConfig({
  base: "./",
  optimizeDeps: { entries: ["index.html"] },
  server: {
    watch: {
      ignored: [
        "**/RhineLabUI-main/**",
        "**/.test-output/**",
        "**/public/gallery/**",
      ],
    },
  },
  plugins: [
    {
      name: "photography-collection",
      async buildStart() {
        await buildGallery();
      },
      configureServer(server) {
        const directory = path.resolve("photos");
        const collections = path.resolve("collections.json");
        server.watcher.add(directory);
        server.watcher.add(collections);
        let timer: ReturnType<typeof setTimeout>;
        let pending = Promise.resolve();
        server.watcher.on("all", (_event, file) => {
          if (
            path.dirname(path.resolve(file)) !== directory &&
            path.resolve(file) !== collections
          )
            return;
          clearTimeout(timer);
          timer = setTimeout(() => {
            pending = pending.then(async () => {
              try {
                await buildGallery();
                server.ws.send({ type: "full-reload" });
              } catch (error) {
                server.config.logger.error(String(error));
                server.ws.send({
                  type: "error",
                  err: { message: String(error), stack: "" },
                });
              }
            });
          }, 350);
        });
        server.httpServer?.on("close", () => clearTimeout(timer));
      },
    },
  ],
});
