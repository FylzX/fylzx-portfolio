import * as THREE from "three";
import { createViewerPipeline, resizeQuality } from "./quality-renderer";
import { qualityPresets } from "./render-quality";
import { studioLighting } from "./lighting";
import { damp, smooth, selectionWave, type Spring } from "./motion";
import { PhotoBoards } from "./photo-board";
import { GalleryNavigation } from "./navigation";
import { ColumnTracks } from "./column-tracks";
import type { Preferences } from "./types";

const PITCH = 0.9,
  LANE = 5.65;
type Cell = {
  lane: number;
  row: number;
  group: THREE.Group;
  lift: Spring;
  id: string;
};
export class GalleryScene {
  readonly renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.3, 150);
  readonly boards = new PhotoBoards();
  private pipeline = createViewerPipeline(
    this.renderer,
    this.scene,
    this.camera,
  );
  private lighting = studioLighting(this.renderer, this.scene);
  private cells = new Map<string, Cell>();
  private rowTracks: ColumnTracks;
  private lane: Spring;
  private detail = 0;
  private detailTarget = false;
  private angle = 0;
  private targetAngle = 0;
  private zoom = 1;
  private targetZoom = 1;
  private touches = new Map<number, THREE.Vector2>();
  private pinchDistance = 0;
  private waveTime = 0;
  private hover?: Cell;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private drag?: {
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    lane: number;
    row: number;
    time: number;
    vx: number;
    vy: number;
  };
  private momentum = { lane: 0, row: 0, vx: 0, vy: 0 };
  private wheelTime = 0;
  private observer: ResizeObserver;
  private floor: THREE.Mesh;
  private events = new AbortController();
  private prefs: Preferences;
  private lastFrame = 0;
  private frame = 0;
  private live = false;
  suspended = false;
  onSelect: () => void = () => {};
  onOpen: () => void = () => {};
  onSelectionHint: (x: number, y: number, visible: boolean) => void = () => {};
  onError: (message: string) => void = () => {};

  constructor(
    private host: HTMLElement,
    readonly navigation: GalleryNavigation,
    prefs: Preferences,
  ) {
    this.prefs = prefs;
    this.rowTracks = new ColumnTracks(
      navigation.rows,
      navigation.lane,
      navigation.row,
    );
    this.lane = { value: navigation.lane, velocity: 0 };
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "三维摄影作品展：拖动浏览照片",
    );
    this.lighting.key.castShadow = true;
    Object.assign(this.lighting.key.shadow.camera, {
      left: -18,
      right: 18,
      top: 18,
      bottom: -18,
      near: 0.5,
      far: 60,
    });
    this.lighting.key.shadow.bias = -0.0004;
    this.lighting.key.shadow.normalBias = 0.04;
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 150),
      new THREE.ShadowMaterial({ opacity: 0.13 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.35;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.boards.onError = () =>
      this.onError("有一张照片未能加载，请刷新后重试。");
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.settings(prefs);
    this.syncCells();
    this.bindInput();
  }
  private syncCells() {
    const keep = new Set<string>();
    for (let lane = 0; lane < this.navigation.columns.length; lane++) {
      if (Math.abs(lane - this.lane.value) > 3) continue;
      const center = Math.round(this.rowTracks.center(lane));
      for (let row = center - 10; row <= center + 12; row++) {
        const photo = this.navigation.at(lane, row);
        if (!photo) continue;
        const key = `${lane}:${row}`;
        keep.add(key);
        if (this.cells.has(key)) continue;
        const group = this.boards.create(photo);
        const cell: Cell = {
          lane,
          row,
          group,
          id: photo.id,
          lift: { value: 0, velocity: 0 },
        };
        group.userData.cell = cell;
        this.cells.set(key, cell);
        this.scene.add(group);
      }
    }
    for (const [key, cell] of this.cells)
      if (!keep.has(key)) {
        this.scene.remove(cell.group);
        this.cells.delete(key);
      }
  }
  selection() {
    this.rowTracks.select(this.navigation.lane, this.navigation.row);
    this.waveTime = performance.now() / 1000;
    this.targetAngle = 0;
    this.syncCells();
    const photo = this.navigation.current;
    if (photo) void this.boards.load(photo, true);
  }
  moveCollection(direction: number) {
    const next = this.navigation.lane + direction;
    if (next < 0 || next >= this.navigation.columns.length) return false;
    const row = this.rowTracks.adjacentRow(next);
    this.momentum.vx = this.momentum.vy = 0;
    this.navigation.select(next, row);
    this.selection();
    return true;
  }
  open(detail: boolean) {
    this.detailTarget = detail;
    this.targetZoom = 1;
    this.touches.clear();
    this.pinchDistance = 0;
    this.targetAngle = 0;
    this.momentum.vx = this.momentum.vy = 0;
    this.selection();
  }
  zoomBy(factor: number) {
    if (this.detailTarget)
      this.targetZoom = THREE.MathUtils.clamp(
        this.targetZoom * factor,
        0.65,
        2.2,
      );
  }
  resetView() {
    this.targetZoom = 1;
    this.targetAngle = 0;
  }
  settings(prefs: Preferences) {
    this.prefs = prefs;
    this.boards.theme(prefs.dark);
    this.scene.fog = new THREE.Fog(prefs.dark ? "#232621" : "#e8e5e1", 29, 58);
    const quality = qualityPresets[prefs.quality];
    this.boards.quality(
      Math.min(
        quality.anisotropy,
        this.renderer.capabilities.getMaxAnisotropy(),
      ),
      prefs.quality === "performance",
    );
    this.renderer.shadowMap.enabled = prefs.quality !== "performance";
    this.lighting.key.shadow.mapSize.set(quality.shadows, quality.shadows);
    this.lighting.key.shadow.map?.dispose();
    this.lighting.key.shadow.map = null;
    this.pipeline.smaa.enabled = quality.antialias === "smaa";
    this.resize();
  }
  resize() {
    if (!this.host.clientWidth || !this.host.clientHeight) return;
    this.camera.aspect = this.host.clientWidth / this.host.clientHeight;
    this.camera.updateProjectionMatrix();
    resizeQuality(
      this.renderer,
      this.pipeline.composer,
      this.host,
      qualityPresets[this.prefs.quality],
    );
  }
  start() {
    if (this.live) return;
    this.live = true;
    this.selection();
    const animate = (time: number) => {
      if (!this.live) return;
      this.frame = requestAnimationFrame(animate);
      const dt = Math.min(
        0.05,
        Math.max(0, (time - (this.lastFrame || time)) / 1000),
      );
      this.lastFrame = time;
      if (this.suspended || document.hidden) return;
      this.update(dt, time / 1000);
      this.pipeline.composer.render();
    };
    this.frame = requestAnimationFrame(animate);
  }
  private update(dt: number, time: number) {
    if (
      !this.detailTarget &&
      !this.drag &&
      (Math.abs(this.momentum.vx) > 0.08 || Math.abs(this.momentum.vy) > 0.08)
    ) {
      this.momentum.lane = THREE.MathUtils.clamp(
        this.momentum.lane + this.momentum.vx * dt,
        0,
        this.navigation.columns.length - 1,
      );
      this.momentum.row += this.momentum.vy * dt;
      this.momentum.vx *= Math.exp(-5 * dt);
      this.momentum.vy *= Math.exp(-5 * dt);
      this.selectDrag(this.momentum.lane, this.momentum.row);
    }
    const reduced = this.prefs.reduced;
    this.rowTracks.update(dt, reduced);
    damp(this.lane, this.navigation.lane, reduced ? 80 : 6, dt);
    const returning = !this.detailTarget && Math.abs(this.angle) > 0.004;
    this.angle = THREE.MathUtils.lerp(
      this.angle,
      this.targetAngle,
      1 - Math.exp(-10 * dt),
    );
    if (Math.abs(this.angle) < 0.004) this.angle = 0;
    this.zoom = reduced
      ? this.targetZoom
      : THREE.MathUtils.lerp(
          this.zoom,
          this.targetZoom,
          1 - Math.exp(-12 * dt),
        );
    this.detail = THREE.MathUtils.lerp(
      this.detail,
      this.detailTarget || returning ? 1 : 0,
      1 - Math.exp(-(reduced ? 80 : 5.5) * dt),
    );
    this.syncCells();
    for (const cell of this.cells.values()) {
      const selected =
        cell.lane === this.navigation.lane && cell.row === this.navigation.row;
      const center = this.rowTracks.center(cell.lane);
      const distance = Math.hypot(
        cell.row - this.navigation.row,
        (cell.lane - this.navigation.lane) * 3,
      );
      const wave = reduced
        ? 0
        : selectionWave(distance, time - this.waveTime) * 0.32;
      const lift = selected
        ? this.detailTarget || returning
          ? 4.2
          : 1.75
        : this.hover === cell && !this.detailTarget
          ? 0.55
          : 0;
      damp(cell.lift, lift, reduced ? 80 : 5.5, dt);
      cell.group.position.set(
        cell.lane * LANE,
        1.75 + cell.lift.value + wave,
        (cell.row - center) * PITCH,
      );
      cell.group.rotation.y = selected ? this.angle : 0;
    }
    const selectedX = this.lane.value * LANE;
    const portrait = this.camera.aspect < 1;
    const overviewAim = new THREE.Vector3(
      // Use the animated position, not the selected index: selecting lane 0
      // must never instantly add/remove the two-unit edge framing offset.
      selectedX - 2 * smooth(this.lane.value),
      1.45,
      0,
    );
    const detailAim = new THREE.Vector3(selectedX, 5.95, 0);
    const aim = overviewAim.lerp(detailAim, this.detail);
    const overviewOffset = new THREE.Vector3(-12.8, 11.8, 20.8).multiplyScalar(
      portrait ? 1.55 : 1,
    );
    const detailOffset = new THREE.Vector3(
      0.8,
      0.9,
      Math.max(11, 10 / this.camera.aspect),
    ).multiplyScalar(1 / this.zoom);
    this.camera.position
      .copy(aim)
      .add(overviewOffset.lerp(detailOffset, this.detail));
    this.camera.lookAt(aim);
    this.camera.updateMatrixWorld();
    const chosen = this.cells.get(
      `${this.navigation.lane}:${this.navigation.row}`,
    );
    if (chosen && !this.detailTarget && this.detail < 0.1) {
      const point = chosen.group.position
        .clone()
        .add(new THREE.Vector3(0, 1.92, 0))
        .project(this.camera);
      this.onSelectionHint(
        ((point.x + 1) * this.host.clientWidth) / 2,
        ((1 - point.y) * this.host.clientHeight) / 2,
        point.z > -1 &&
          point.z < 1 &&
          Math.abs(point.x) < 1 &&
          Math.abs(point.y) < 1,
      );
    } else this.onSelectionHint(0, 0, false);
    this.lighting.key.position.set(selectedX - 6, 14, 8);
    this.lighting.key.target.position.set(selectedX, 0, 0);
    this.lighting.key.target.updateMatrixWorld();
  }
  private hit(x: number, y: number) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((x - bounds.left) / bounds.width) * 2 - 1,
      (-(y - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(
      [...this.cells.values()].map((cell) => cell.group),
      true,
    )[0];
    return hit?.object.parent?.userData.cell as Cell | undefined;
  }
  private selectDrag(lane: number, row: number) {
    const nextLane = Math.max(
      0,
      Math.min(this.navigation.columns.length - 1, Math.round(lane)),
    );
    const nextRow = Math.round(row);
    if (nextLane !== this.navigation.lane || nextRow !== this.navigation.row) {
      this.navigation.select(nextLane, nextRow);
      this.selection();
      this.onSelect();
    }
  }
  private bindInput() {
    const canvas = this.renderer.domElement,
      signal = this.events.signal;
    canvas.addEventListener("contextmenu", (event) => event.preventDefault(), {
      signal,
    });
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || this.suspended || !this.live) return;
        if (this.detailTarget && event.pointerType === "touch") {
          this.touches.set(
            event.pointerId,
            new THREE.Vector2(event.clientX, event.clientY),
          );
          canvas.setPointerCapture(event.pointerId);
          if (this.touches.size >= 2) {
            const [a, b] = [...this.touches.values()];
            this.pinchDistance = a.distanceTo(b);
            this.drag = undefined;
            return;
          }
        }
        this.momentum.vx = this.momentum.vy = 0;
        this.drag = {
          x: event.clientX,
          y: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          moved: false,
          lane: this.navigation.lane,
          row: this.navigation.row,
          time: event.timeStamp,
          vx: 0,
          vy: 0,
        };
        canvas.setPointerCapture(event.pointerId);
      },
      { signal },
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (this.suspended || !this.live) return;
        if (this.detailTarget && this.touches.has(event.pointerId)) {
          this.touches.get(event.pointerId)!.set(event.clientX, event.clientY);
          if (this.touches.size >= 2) {
            const [a, b] = [...this.touches.values()];
            const distance = a.distanceTo(b);
            if (this.pinchDistance > 0 && distance > 0)
              this.zoomBy(distance / this.pinchDistance);
            this.pinchDistance = distance;
            return;
          }
        }
        const drag = this.drag;
        if (!drag) {
          this.hover = this.hit(event.clientX, event.clientY);
          canvas.style.cursor = this.hover ? "grab" : "default";
          return;
        }
        const dx = event.clientX - drag.lastX,
          dy = event.clientY - drag.lastY;
        const elapsed = Math.max(0.008, (event.timeStamp - drag.time) / 1000);
        drag.moved ||=
          Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6;
        if (this.detailTarget) {
          if (this.detail > 0.9)
            this.targetAngle = THREE.MathUtils.clamp(
              this.targetAngle + dx * 0.008,
              -0.9,
              0.9,
            );
        } else if (drag.moved) {
          const projected = (position: THREE.Vector3) => {
            position.project(this.camera);
            return new THREE.Vector2(
              (position.x * canvas.clientWidth) / 2,
              (-position.y * canvas.clientHeight) / 2,
            );
          };
          const origin = projected(
            new THREE.Vector3(this.lane.value * LANE, 1.75, 0),
          );
          const axisX = projected(
            new THREE.Vector3((this.lane.value + 1) * LANE, 1.75, 0),
          ).sub(origin);
          const axisY = projected(
            new THREE.Vector3(this.lane.value * LANE, 1.75, PITCH),
          ).sub(origin);
          const determinant = axisX.x * axisY.y - axisX.y * axisY.x;
          if (Math.abs(determinant) > 0.01) {
            const lx = -(dx * axisY.y - dy * axisY.x) / determinant;
            const ry = -(axisX.x * dy - axisX.y * dx) / determinant;
            drag.lane = THREE.MathUtils.clamp(
              drag.lane + lx,
              0,
              this.navigation.columns.length - 1,
            );
            drag.row += ry;
            drag.vx = THREE.MathUtils.clamp(lx / elapsed, -5, 5);
            drag.vy = THREE.MathUtils.clamp(ry / elapsed, -18, 18);
            this.selectDrag(drag.lane, drag.row);
          }
        }
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        drag.time = event.timeStamp;
      },
      { signal },
    );
    const end = (event: PointerEvent) => {
      this.touches.delete(event.pointerId);
      if (this.touches.size < 2) this.pinchDistance = 0;
      const drag = this.drag;
      this.drag = undefined;
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      if (!drag) return;
      if (event.type === "pointercancel") return;
      if (drag.moved && !this.detailTarget) {
        const fresh = event.timeStamp - drag.time < 100;
        this.momentum = {
          lane: drag.lane,
          row: drag.row,
          vx: fresh ? drag.vx : 0,
          vy: fresh ? drag.vy : 0,
        };
      } else if (!drag.moved && !this.detailTarget) {
        const cell = this.hit(event.clientX, event.clientY);
        if (cell) {
          if (
            cell.lane === this.navigation.lane &&
            cell.row === this.navigation.row
          )
            this.onOpen();
          else {
            this.navigation.select(cell.lane, cell.row);
            this.selection();
            this.onSelect();
          }
        }
      }
    };
    canvas.addEventListener("pointerup", end, { signal });
    canvas.addEventListener("pointercancel", end, { signal });
    canvas.addEventListener(
      "pointerleave",
      () => {
        this.hover = undefined;
      },
      { signal },
    );
    canvas.addEventListener(
      "wheel",
      (event) => {
        if (this.suspended || !this.live) return;
        event.preventDefault();
        if (this.detailTarget) {
          const delta =
            event.deltaY *
            (event.deltaMode === 1
              ? 16
              : event.deltaMode === 2
                ? canvas.clientHeight
                : 1);
          this.zoomBy(
            Math.exp(-THREE.MathUtils.clamp(delta, -240, 240) * 0.002),
          );
          return;
        }
        if (
          event.timeStamp - this.wheelTime < 170 ||
          Math.abs(event.deltaY) < 3
        )
          return;
        this.wheelTime = event.timeStamp;
        if (this.navigation.photo(Math.sign(event.deltaY))) {
          this.selection();
          this.onSelect();
        }
      },
      { passive: false, signal },
    );
    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        this.onError("三维画面暂时中断，请刷新页面重新进入。");
      },
      { signal },
    );
  }
  dispose() {
    this.live = false;
    cancelAnimationFrame(this.frame);
    this.events.abort();
    this.observer.disconnect();
    this.boards.dispose();
    this.lighting.environment.dispose();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.lighting.key.shadow.map?.dispose();
    for (const pass of this.pipeline.composer.passes) pass.dispose();
    this.pipeline.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
