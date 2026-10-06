import { defineConfig } from "vite";
// @ts-ignore — Node-only photo pipeline.
import { buildGallery } from "./scripts/gallery.mjs";
import path from "node:path";
import { copyFile, mkdir } from "node:fs/promises";

let originals: string[] = [];

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
        const gallery = await buildGallery();
        originals = gallery.photos.map((photo: { filename: string }) => photo.filename);
      },
      async writeBundle(options) {
        const directory = path.resolve(options.dir ?? "dist", "photos");
        await mkdir(directory, { recursive: true });
        for (const filename of originals)
          await copyFile(path.resolve("photos", filename), path.join(directory, filename));
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
