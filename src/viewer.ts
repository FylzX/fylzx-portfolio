import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PhotoBoards } from "./photo-board";
import { ViewerCameraMotion } from "./viewer-camera";
import { createViewerPipeline, resizeQuality } from "./quality-renderer";
import { qualityPresets } from "./render-quality";
import { studioLighting } from "./lighting";
import type { Photo, Preferences } from "./types";

export class PhotoViewer {
  private renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  private goal = this.camera.clone();
  private motion = new ViewerCameraMotion(this.camera);
  private boards = new PhotoBoards();
  private controls: OrbitControls;
  private pipeline = createViewerPipeline(
    this.renderer,
    this.scene,
    this.camera,
  );
  private lighting = studioLighting(this.renderer, this.scene);
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private previous = 0;
  private events = new AbortController();
  constructor(
    private host: HTMLElement,
    photo: Photo,
    private prefs: Preferences,
  ) {
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.boards.theme(prefs.dark);
    const quality = qualityPresets[prefs.quality];
    this.boards.quality(
      Math.min(
        quality.anisotropy,
        this.renderer.capabilities.getMaxAnisotropy(),
      ),
      prefs.quality === "performance",
    );
    this.pipeline.smaa.enabled = quality.antialias === "smaa";
    host.append(this.renderer.domElement);
    const model = this.boards.create(photo);
    this.scene.add(model);
    void this.boards.load(photo, true);
    this.controls = new OrbitControls(this.goal, this.renderer.domElement);
    this.controls.minDistance = 5;
    this.controls.maxDistance = 24;
    this.controls.enableDamping = false;
    this.controls.addEventListener("start", () =>
      this.motion.interruptReset(this.goal, this.controls.target),
    );
    this.reset(true);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    window.addEventListener(
      "keydown",
      (event) => {
        const directions: Record<string, [number, number]> = {
          ArrowLeft: [-0.25, 0],
          ArrowRight: [0.25, 0],
          ArrowUp: [0, 0.25],
          ArrowDown: [0, -0.25],
        };
        if (event.key === "Home") {
          event.preventDefault();
          this.reset();
        } else if (directions[event.key]) {
          event.preventDefault();
          this.motion.interruptReset(this.goal, this.controls.target);
          const [x, y] = directions[event.key],
            movement = new THREE.Vector3(x, y, 0).applyQuaternion(
              this.goal.quaternion,
            );
          this.goal.position.add(movement);
          this.controls.target.add(movement);
          this.controls.update();
        } else if (["+", "=", "-"].includes(event.key)) {
          event.preventDefault();
          this.motion.interruptReset(this.goal, this.controls.target);
          const offset = this.goal.position
            .clone()
            .sub(this.controls.target)
            .multiplyScalar(event.key === "-" ? 1.1 : 0.9);
          offset.clampLength(5, 24);
          this.goal.position.copy(this.controls.target).add(offset);
          this.controls.update();
        }
      },
      { signal: this.events.signal },
    );
    const animate = (time: number) => {
      this.frame = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (time - (this.previous || time)) / 1000);
      this.previous = time;
      if (document.hidden) return;
      this.motion.update(this.goal, this.controls.target, dt, prefs.reduced);
      this.pipeline.composer.render();
    };
    this.frame = requestAnimationFrame(animate);
  }
  private resize() {
    this.camera.aspect =
      this.host.clientWidth / Math.max(1, this.host.clientHeight);
    this.camera.updateProjectionMatrix();
    resizeQuality(
      this.renderer,
      this.pipeline.composer,
      this.host,
      qualityPresets[this.prefs.quality],
    );
  }
  reset(immediate = false) {
    this.goal.position.set(1.6, 0.6, this.host.clientWidth < 600 ? 15 : 10.5);
    this.controls.target.set(0, 0, 0);
    this.goal.lookAt(0, 0, 0);
    this.controls.update();
    if (immediate) this.motion.snap(this.goal, this.controls.target);
    else this.motion.reset();
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.events.abort();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.boards.dispose();
    this.lighting.environment.dispose();
    for (const pass of this.pipeline.composer.passes) pass.dispose();
    this.pipeline.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
