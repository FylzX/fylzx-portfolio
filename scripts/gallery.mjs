import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  lstat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
import exifr from "exifr";
import { loadCollections, groupPhotos } from "./collections.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const pattern = /^(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.(jpe?g|png|webp)$/i;
const fields = [
  "Make",
  "Model",
  "LensModel",
  "ExposureTime",
  "FNumber",
  "ISO",
  "FocalLength",
  "DateTimeOriginal",
  "OffsetTimeOriginal",
];
const thumbnailWidths = [1400, 1300, 1200, 1100, 1000];
const thumbnailMaxBytes = 500 * 1024;
const thumbnailMinQuality = 80;
const thumbnailMaxQuality = 90;

async function encodeWebp(buffer, width, quality) {
  return sharp(buffer)
    .rotate()
    .resize({
      width,
      height: width,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 6, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
}

async function encodeThumbnail(buffer) {
  for (const width of thumbnailWidths) {
    const best = await encodeWebp(buffer, width, thumbnailMaxQuality);
    if (best.data.length <= thumbnailMaxBytes) return best;
  }

  let low = thumbnailMinQuality;
  let high = thumbnailMaxQuality;
  let selected = await encodeWebp(buffer, 1000, thumbnailMinQuality);
  while (low <= high) {
    const quality = Math.floor((low + high) / 2);
    const candidate = await encodeWebp(buffer, 1000, quality);
    if (candidate.data.length <= thumbnailMaxBytes) {
      selected = candidate;
      low = quality + 1;
    } else high = quality - 1;
  }
  if (selected.data.length <= thumbnailMaxBytes) return selected;

  throw new Error("Thumbnail exceeds 500KB at 1000px and quality 80; review this image instead of lowering quality.");
}

export function parsePhotoName(name) {
  const match = pattern.exec(name);
  if (!match) return null;
  const [, date, sequence] = match;
  const year = Number(date.slice(0, 4));
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    year < 2024 ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`照片日期无效（从 2024 年开始）：${name}`);
  }
  const order = Number(sequence ?? 0);
  if (!Number.isSafeInteger(order)) throw new Error(`照片编号过大：${name}`);
  return {
    id: name.slice(0, name.lastIndexOf(".")),
    filename: name,
    date,
    year,
    month: date.slice(0, 7),
    sequence: order,
  };
}

export function comparePhotos(a, b) {
  return (
    a.date.localeCompare(b.date) ||
    a.sequence - b.sequence ||
    a.filename.localeCompare(b.filename, "en")
  );
}

export function exifInfo(tags = {}) {
  const result = [];
  const add = (label, value) => {
    if (value !== undefined && value !== null && String(value).trim())
      result.push({ label, value: String(value) });
  };
  add(
    "相机",
    tags.Model
      ? `${tags.Make && !String(tags.Model).toLowerCase().startsWith(String(tags.Make).toLowerCase()) ? `${tags.Make} ` : ""}${tags.Model}`
      : tags.Make,
  );
  add("镜头", tags.LensModel);
  if (Number(tags.FocalLength) > 0)
    add(
      "焦距",
      `${Number(tags.FocalLength).toFixed(1).replace(/\.0$/, "")} mm`,
    );
  if (Number(tags.ExposureTime) > 0) {
    const exposure = Number(tags.ExposureTime);
    add(
      "快门",
      exposure < 1 ? `1/${Math.round(1 / exposure)} s` : `${exposure} s`,
    );
  }
  if (Number(tags.FNumber) > 0) add("光圈", `ƒ/${Number(tags.FNumber)}`);
  if (Number(tags.ISO) > 0) add("ISO", tags.ISO);
  if (typeof tags.DateTimeOriginal === "string") {
    add(
      "拍摄时间",
      tags.DateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3") +
        (tags.OffsetTimeOriginal ? ` ${tags.OffsetTimeOriginal}` : ""),
    );
  }
  return result;
}

export async function buildGallery({
  input = path.join(root, "photos"),
  output = path.join(root, "public/gallery"),
} = {}) {
  await mkdir(input, { recursive: true });
  await mkdir(output, { recursive: true });
  const entries = await readdir(input, { withFileTypes: true });
  const images = entries
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => parsePhotoName(entry.name))
    .sort(comparePhotos);
  const names = new Set();
  const positions = new Set();
  for (const photo of images) {
    if (
      names.has(photo.id.toLowerCase()) ||
      positions.has(`${photo.date}:${photo.sequence}`)
    )
      throw new Error(
        `同一天的编号或同名照片重复：${photo.filename}，请使用不同编号。`,
      );
    names.add(photo.id.toLowerCase());
    positions.add(`${photo.date}:${photo.sequence}`);
  }
  const descriptionFiles = new Map(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          /^\d{4}-\d{2}-\d{2}(?:-\d+)?\.json$/i.test(entry.name),
      )
      .map((entry) => [entry.name.toLowerCase(), entry.name]),
  );
  const records = [];
  const keep = new Set(["manifest.json"]);
  // Read only date-named photographs and their optional, explicitly paired descriptions.
  for (const photo of images) {
    const source = path.join(input, photo.filename);
    if ((await lstat(source)).isSymbolicLink())
      throw new Error(`不读取链接照片：${photo.filename}`);
    const buffer = await readFile(source);
    let description = "";
    const sidecar = descriptionFiles.get(`${photo.id}.json`.toLowerCase());
    if (sidecar) {
      const sidecarPath = path.join(input, sidecar);
      if (!(await lstat(sidecarPath)).isFile())
        throw new Error(`描述必须是普通文件：${sidecar}`);
      let json;
      try {
        json = JSON.parse(await readFile(sidecarPath, "utf8"));
      } catch {
        throw new Error(`描述 JSON 无效：${sidecar}`);
      }
      if (
        !json ||
        Array.isArray(json) ||
        typeof json !== "object" ||
        (json.description !== undefined && typeof json.description !== "string")
      )
        throw new Error(`描述格式应为 {"description":"文字"}：${sidecar}`);
      description = (json.description ?? "").trim();
    }
    let tags = {};
    try {
      tags =
        (await exifr.parse(buffer, {
          pick: fields,
          gps: false,
          tiff: true,
          exif: true,
          translateValues: true,
          reviveValues: false,
        })) ?? {};
    } catch {
      /* Pictures without readable EXIF remain viewable. */
    }
    const thumbDigest = createHash("sha256")
      .update(buffer)
      .update("portfolio-webp-v3")
      .digest("hex")
      .slice(0, 16);
    const thumb = `${photo.id}.${thumbDigest}.thumb.webp`;
    keep.add(thumb);
    // Auto-orient before measuring/display. The detail view uses the original file.
    const sourceMetadata = await sharp(buffer).metadata();
    const rotated = [5, 6, 7, 8].includes(sourceMetadata.orientation);
    try {
      let thumbnailCached = false;
      try {
        const metadata = await sharp(path.join(output, thumb)).metadata();
        thumbnailCached = Boolean(metadata.width && metadata.height);
      } catch {
        /* The thumbnail cache is independent of the detail image. */
      }
      if (!thumbnailCached) {
        const thumbnail = await encodeThumbnail(buffer);
        await writeFile(path.join(output, thumb), thumbnail.data);
      }
    } catch (cause) {
      throw new Error(`无法生成照片预览，请检查图像文件：${photo.filename}`, { cause });
    }
    records.push({
      ...photo,
      preview: `photos/${photo.filename}`,
      thumbnail: `gallery/${thumb}`,
      width: rotated ? sourceMetadata.height : sourceMetadata.width,
      height: rotated ? sourceMetadata.width : sourceMetadata.height,
      exif: exifInfo(tags),
      description,
    });
  }
  const manifest = groupPhotos(records, await loadCollections());
  await writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  // Delete only stale derivatives bearing this generator's exact naming convention.
  for (const entry of await readdir(output, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      /^\d{4}-\d{2}-\d{2}(?:-\d+)?\.[a-f0-9]{16}(?:\.thumb)?\.webp$/.test(
        entry.name,
      ) &&
      !keep.has(entry.name)
    )
      await unlink(path.join(output, entry.name));
  }
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const result = await buildGallery();
  console.log(
    `已整理 ${result.photos.length} 张照片，分组：${result.collections.map((group) => group.label).join(" / ")}`,
  );
}
