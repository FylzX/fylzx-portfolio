import "./style.css";
import type { Gallery, Photo, Preferences } from "./types";
import { GalleryNavigation } from "./navigation";
import { GalleryScene } from "./scene";
import { PhotoViewer } from "./viewer";

const DEFAULT_PREFS: Preferences = {
  dark: false,
  quality: "original",
  reduced: false,
};
const readPrefs = (): Preferences => {
  try {
    const value = JSON.parse(
      localStorage.getItem("fylzx-portfolio-settings") ?? "null",
    );
    return {
      dark: value?.dark === true,
      reduced: value?.reduced === true,
      quality: ["performance", "original", "high", "ultra"].includes(
        value?.quality,
      )
        ? value.quality
        : "original",
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};
const savePrefs = (prefs: Preferences) => {
  try {
    localStorage.setItem("fylzx-portfolio-settings", JSON.stringify(prefs));
  } catch {
    /* Preferences remain usable without persistent storage. */
  }
};
const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const app = document.querySelector<HTMLDivElement>("#app")!;

async function loadGallery(): Promise<Gallery> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}gallery/manifest.json`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("作品清单暂时无法读取。");
  const gallery = (await response.json()) as Gallery;
  gallery.photos.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.sequence - b.sequence ||
      a.filename.localeCompare(b.filename),
  );
  return gallery;
}
function exifMarkup(photo: Photo) {
  if (!photo.exif.length && !photo.description) return "";
  return `${photo.exif.map((item) => `<div class="meta-row"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></div>`).join("")}${photo.description ? `<p class="photo-note">${esc(photo.description)}</p>` : ""}`;
}

async function boot() {
  let gallery: Gallery;
  try {
    gallery = await loadGallery();
  } catch (error) {
    app.innerHTML = `<main class="error-screen"><b>FylzX's Portfolio</b><p>${esc(error instanceof Error ? error.message : error)}</p><button onclick="location.reload()">重新连接</button></main>`;
    return;
  }
  const prefs = readPrefs();
  app.innerHTML = `
    <main class="portfolio-shell ${prefs.dark ? "theme-dark" : ""} ${prefs.reduced ? "reduced-motion" : ""}">
      <section class="welcome-screen" aria-label="作品展入口">
        <div class="welcome-brand"><span>FylzX</span><small>PHOTOGRAPHY / COLLECTION</small></div>
        <div class="welcome-center"><p class="eyebrow">A PERSONAL COLLECTION OF LIGHT</p><h1>FylzX's<br><em>Portfolio</em></h1><button class="enter-button" data-action="enter">进入作品展 <span>↗</span></button></div>
        <p class="welcome-foot">${gallery.photos[0]?.date.slice(0, 7) ?? "—"} — ${gallery.photos.at(-1)?.date.slice(0, 7) ?? "—"} <i></i> PHOTOGRAPHS, PLACES &amp; FRAGMENTS</p>
      </section>
      <section class="gallery-screen" hidden>
        <header class="topbar"><div class="brand"><b>FylzX</b><span>PHOTOGRAPHY / COLLECTION</span></div><div class="top-actions"><button data-action="about">ABOUT</button><button data-action="settings">◷ <span class="settings-word">设置</span></button></div></header>
        <div class="scene-host" aria-label="摄影作品三维展板"></div>
        <div class="gallery-overlay"><button class="selection-hint" data-action="open" hidden><span class="hint-icon" aria-hidden="true">↗</span><span>点击查看详情</span></button><div class="collection-title"><span class="eyebrow">FylzX'S PORTFOLIO</span><h2>Photographs<br><em>in time</em></h2><p>光线、空间与被保存下来的片刻。</p></div><div class="collection-nav" role="tablist">${gallery.collections.map((collection, index) => `<button data-collection="${index}" role="tab">${esc(collection.label)}</button>`).join("")}</div><div class="photo-info"><span class="eyebrow" id="photo-counter"></span><h3 id="photo-title"></h3><p id="photo-date"></p><button class="open-photo" data-action="open">查看照片 <span>↗</span></button></div><nav class="direction-pad" aria-label="作品导航"><button data-action="nav-up" aria-label="上一张照片" title="上一张照片"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l7-7 7 7"/></svg></button><button data-action="nav-left" aria-label="上一分类" title="上一分类"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5l-7 7 7 7"/></svg></button><button data-action="nav-down" aria-label="下一张照片" title="下一张照片"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10l7 7 7-7"/></svg></button><button data-action="nav-right" aria-label="下一分类" title="下一分类"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5l7 7-7 7"/></svg></button></nav><div class="bottom-hint">DRAG TO EXPLORE <i></i> ↑ ↓ 切换照片 <i></i> ← → 切换分类</div></div>
        <footer class="portfolio-footer"><span>FylzX / PERSONAL WORKS</span><span id="footer-year"></span><button data-action="settings">SETTINGS ↗</button></footer>
      </section>
      <section class="detail-screen" hidden><button class="back-link" data-action="back">← 返回作品展</button><div class="detail-stage"><div class="detail-view-controls"><span>拖动旋转 · 滚轮 / 双指缩放</span><button data-action="zoom-out" aria-label="缩小照片">−</button><button data-action="zoom-in" aria-label="放大照片">＋</button><button data-action="reset-photo">复位</button></div></div><div class="detail-copy"><span class="eyebrow" id="detail-year"></span><h2 id="detail-title"></h2><p id="detail-date"></p><div class="exif-list" id="exif-list"></div><div class="detail-actions"><button data-action="previous">← 上一张</button><button data-action="next">下一张 →</button><button data-action="viewer">360° 旋转</button></div></div></section>
      <div class="modal" role="dialog" aria-modal="true" aria-label="作品展信息与设置" hidden><div class="modal-panel"><button class="modal-close" data-action="close" aria-label="关闭">×</button><div id="modal-content"></div></div></div>
      <div class="toast" role="status"></div>
    </main>`;
  const shell = app.querySelector<HTMLElement>(".portfolio-shell")!,
    welcome = app.querySelector<HTMLElement>(".welcome-screen")!,
    galleryScreen = app.querySelector<HTMLElement>(".gallery-screen")!,
    detailScreen = app.querySelector<HTMLElement>(".detail-screen")!;
  const sceneHost = app.querySelector<HTMLElement>(".scene-host")!,
    detailStage = app.querySelector<HTMLElement>(".detail-stage")!;
  const navigation = new GalleryNavigation(gallery);
  let scene: GalleryScene;
  try {
    scene = new GalleryScene(sceneHost, navigation, prefs);
  } catch {
    app.innerHTML =
      '<main class="error-screen"><b>FylzX\'s Portfolio</b><p>浏览器无法启动三维画面，请开启硬件加速后刷新重试。</p><button onclick="location.reload()">重新加载</button></main>';
    return;
  }
  let viewer: PhotoViewer | undefined;
  let entered = false,
    isDetail = false;
  let previousFocus: HTMLElement | null = null;
  let viewerOverlay: HTMLElement | undefined;
  const updateTheme = () => {
    shell.classList.toggle("theme-dark", prefs.dark);
    shell.classList.toggle("reduced-motion", prefs.reduced);
    scene.settings(prefs);
  };
  const current = () => navigation.current;
  const update = () => {
    const photo = current();
    for (const direction of ["up", "down"])
      app.querySelector<HTMLButtonElement>(
        `[data-action="nav-${direction}"]`,
      )!.disabled = !photo;
    app.querySelector<HTMLButtonElement>('[data-action="nav-left"]')!.disabled =
      navigation.lane <= 0;
    app.querySelector<HTMLButtonElement>(
      '[data-action="nav-right"]',
    )!.disabled = navigation.lane >= gallery.collections.length - 1;
    const label = gallery.collections[navigation.lane]?.label;
    app
      .querySelectorAll<HTMLButtonElement>(".collection-nav button")
      .forEach((button, index) => {
        button.classList.toggle("active", index === navigation.lane);
        button.setAttribute("aria-selected", String(index === navigation.lane));
        if (index === navigation.lane)
          button.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    if (!photo) {
      app.querySelector("#photo-counter")!.textContent = "00 — 00";
      app.querySelector("#photo-title")!.textContent = "待续";
      app.querySelector("#photo-date")!.textContent = "暂时没有照片";
      app.querySelector<HTMLButtonElement>(".open-photo")!.disabled = true;
      app.querySelector("#footer-year")!.textContent = label
        ? `${label} COLLECTION`
        : "COLLECTION";
      return;
    }
    app.querySelector<HTMLButtonElement>(".open-photo")!.disabled = false;
    app.querySelector("#photo-counter")!.textContent =
      `${label} / ${String(navigation.index + 1).padStart(2, "0")} — ${String(navigation.count).padStart(2, "0")}`;
    app.querySelector("#photo-title")!.textContent = photo.id;
    app.querySelector("#photo-date")!.textContent = photo.date;
    app.querySelector("#footer-year")!.textContent = label
      ? `${label} COLLECTION`
      : "COLLECTION";
    app
      .querySelectorAll<HTMLButtonElement>(".collection-nav button")
      .forEach((button, index) => {
        button.classList.toggle("active", index === navigation.lane);
        button.setAttribute("aria-selected", String(index === navigation.lane));
      });
    app.querySelector("#detail-year")!.textContent =
      `${label} COLLECTION / ${String(navigation.index + 1).padStart(2, "0")} OF ${String(navigation.count).padStart(2, "0")}`;
    app.querySelector("#detail-title")!.textContent = photo.id;
    app.querySelector("#detail-date")!.textContent = photo.date;
    app.querySelector("#exif-list")!.innerHTML = exifMarkup(photo);
  };
  const enter = () => {
    if (entered) return;
    entered = true;
    welcome.classList.add("leave");
    setTimeout(
      () => {
        welcome.hidden = true;
        galleryScreen.hidden = false;
        galleryScreen.classList.add("appear");
        scene.resize();
        scene.start();
        update();
        app.querySelector<HTMLButtonElement>(".open-photo")!.focus();
      },
      prefs.reduced ? 0 : 260,
    );
  };
  const open = () => {
    if (!current() || isDetail) return;
    isDetail = true;
    detailScreen.hidden = false;
    detailStage.append(sceneHost);
    galleryScreen.classList.add("behind");
    galleryScreen.inert = true;
    detailScreen.classList.add("appear");
    scene.open(true);
    scene.resize();
    update();
    app.querySelector<HTMLButtonElement>(".back-link")!.focus();
  };
  const back = () => {
    if (!isDetail) return;
    isDetail = false;
    detailScreen.classList.remove("appear");
    detailScreen.hidden = true;
    galleryScreen.append(sceneHost);
    galleryScreen.classList.remove("behind");
    galleryScreen.inert = false;
    scene.open(false);
    scene.resize();
    app.querySelector<HTMLButtonElement>(".open-photo")!.focus();
  };
  const movePhoto = (direction: number) => {
    navigation.photo(direction);
    scene.selection();
    update();
  };
  const moveCollection = (direction: number) => {
    if (isDetail) return;
    if (scene.moveCollection(direction)) {
      update();
    }
  };
  const showModal = (kind: "about" | "settings") => {
    const modal = app.querySelector<HTMLElement>(".modal")!,
      content = app.querySelector<HTMLElement>("#modal-content")!;
    content.innerHTML =
      kind === "about"
        ? `<span class="eyebrow">FYLZX / ABOUT</span><h2>A personal collection<br><em>of observed moments.</em></h2><p>光线、颜色、空间和时间。<br>一些经过的地方，一些想要记住的片刻。</p>`
        : `<span class="eyebrow">FYLZX / SETTINGS</span><h2>展览设置</h2><label><input type="checkbox" data-setting="dark" ${prefs.dark ? "checked" : ""}> 深色配色</label><label><input type="checkbox" data-setting="reduced" ${prefs.reduced ? "checked" : ""}> 减少动效</label><label>画质 <select data-setting="quality">${(["performance", "original", "high", "ultra"] as const).map((value) => `<option value="${value}" ${prefs.quality === value ? "selected" : ""}>${{ performance: "流畅", original: "标准", high: "高", ultra: "极高" }[value]}</option>`).join("")}</select></label>`;
    previousFocus = document.activeElement as HTMLElement;
    galleryScreen.inert = detailScreen.inert = true;
    modal.hidden = false;
    modal.classList.add("show");
    modal.querySelector<HTMLButtonElement>(".modal-close")!.focus();
  };
  const closeModal = () => {
    const modal = app.querySelector<HTMLElement>(".modal")!;
    modal.classList.remove("show");
    modal.hidden = true;
    galleryScreen.inert = isDetail;
    detailScreen.inert = false;
    previousFocus?.focus();
  };
  const closeViewer = () => {
    viewer?.dispose();
    viewer = undefined;
    viewerOverlay?.remove();
    viewerOverlay = undefined;
    detailScreen.inert = false;
    scene.suspended = false;
    app.querySelector<HTMLButtonElement>('[data-action="viewer"]')!.focus();
  };
  const showViewer = () => {
    const photo = current();
    if (!photo || viewer) return;
    const overlay = document.createElement("div");
    overlay.className = "viewer-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "照片 360 度查看");
    overlay.innerHTML = `<button class="viewer-close">× <span>返回</span></button><div class="viewer-canvas"></div><button class="viewer-reset">复位视角 ↗</button><p class="viewer-tip">拖动旋转 · 滚轮缩放 · Home 复位</p>`;
    shell.append(overlay);
    viewerOverlay = overlay;
    const canvas = overlay.querySelector<HTMLElement>(".viewer-canvas")!;
    viewer = new PhotoViewer(canvas, photo, prefs);
    detailScreen.inert = true;
    scene.suspended = true;
    overlay
      .querySelector(".viewer-close")!
      .addEventListener("click", closeViewer);
    overlay
      .querySelector(".viewer-reset")!
      .addEventListener("click", () => viewer?.reset());
    overlay.querySelector<HTMLButtonElement>(".viewer-close")!.focus();
  };
  app.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-action], [data-collection], .modal",
    );
    if (!target) return;
    const action = target.dataset.action;
    if (target.dataset.collection !== undefined) {
      navigation.select(
        Number(target.dataset.collection),
        navigation.rows[Number(target.dataset.collection)],
      );
      scene.selection();
      update();
      return;
    }
    if (target.classList.contains("modal") && event.target === target)
      return closeModal();
    if (action === "enter") enter();
    else if (action === "open") open();
    else if (action === "back") back();
    else if (action === "zoom-in") scene.zoomBy(1.2);
    else if (action === "zoom-out") scene.zoomBy(1 / 1.2);
    else if (action === "reset-photo") scene.resetView();
    else if (action === "nav-up") movePhoto(-1);
    else if (action === "nav-down") movePhoto(1);
    else if (action === "nav-left") moveCollection(-1);
    else if (action === "nav-right") moveCollection(1);
    else if (action === "previous") movePhoto(-1);
    else if (action === "next") movePhoto(1);
    else if (action === "viewer") showViewer();
    else if (action === "about" || action === "settings") showModal(action);
    else if (action === "close") closeModal();
  });
  app.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const setting = target.dataset.setting;
    if (!setting) return;
    if (setting === "dark" || setting === "reduced")
      prefs[setting] = (target as HTMLInputElement).checked;
    else if (setting === "quality")
      prefs.quality = target.value as Preferences["quality"];
    savePrefs(prefs);
    updateTheme();
  });
  window.addEventListener("keydown", (event) => {
    const modal = app.querySelector<HTMLElement>(".modal")!;
    const activeDialog = viewerOverlay ?? (!modal.hidden ? modal : undefined);
    if (activeDialog && event.key === "Tab") {
      const controls = Array.from(
        activeDialog.querySelectorAll<HTMLElement>(
          'button, input, select, [tabindex="0"]',
        ),
      );
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls.at(-1)?.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === controls.at(-1)
      ) {
        event.preventDefault();
        controls[0]?.focus();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (viewer) closeViewer();
      else if (!modal.hidden) closeModal();
      else if (isDetail) back();
      return;
    }
    if (
      activeDialog ||
      !welcome.hidden ||
      /INPUT|SELECT|TEXTAREA/.test((event.target as HTMLElement).tagName)
    )
      return;
    if (event.key.startsWith("Arrow")) event.preventDefault();
    if (event.key === "ArrowUp") movePhoto(-1);
    if (event.key === "ArrowDown") movePhoto(1);
    if (event.key === "ArrowLeft") moveCollection(-1);
    if (event.key === "ArrowRight") moveCollection(1);
    if (
      event.key === "Enter" &&
      detailScreen.hidden &&
      (event.target as HTMLElement).tagName !== "BUTTON"
    )
      open();
  });
  const selectionHint =
    app.querySelector<HTMLButtonElement>(".selection-hint")!;
  scene.onSelectionHint = (x, y, visible) => {
    selectionHint.hidden = !visible || isDetail;
    selectionHint.style.left = `${Math.max(85, Math.min(innerWidth - 85, x))}px`;
    selectionHint.style.top = `${Math.max(95, y - 10)}px`;
  };
  scene.onSelect = update;
  scene.onOpen = open;
  scene.onError = (message) => {
    const toast = app.querySelector<HTMLElement>(".toast")!;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
  };
  window.addEventListener(
    "pagehide",
    () => {
      viewer?.dispose();
      scene.dispose();
    },
    { once: true },
  );
}
void boot();
