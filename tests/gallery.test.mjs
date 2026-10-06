import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, mkdtemp, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import exifr from "exifr";
import {
  parsePhotoName,
  comparePhotos,
  exifInfo,
  buildGallery,
} from "../scripts/gallery.mjs";

test("date and sequence sorting, validity, supported formats", () => {
  const names = [
    "2024-01-02.jpg",
    "2024-01-01-10.webp",
    "2024-01-01-02.png",
    "2024-01-01-01.jpg",
  ];
  assert.deepEqual(
    names
      .map(parsePhotoName)
      .sort(comparePhotos)
      .map((x) => x.filename),
    [names[3], names[2], names[1], names[0]],
  );
  assert.throws(() => parsePhotoName("2025-02-29.jpg"), /日期无效/);
  assert.throws(() => parsePhotoName("2023-01-01.jpg"), /日期无效/);
  assert.ok(parsePhotoName("2024-02-29.PNG"));
  assert.equal(parsePhotoName("notes.txt"), null);
});
test("EXIF fields are formatted without invented values", () => {
  assert.deepEqual(
    exifInfo({
      ExposureTime: 1 / 250,
      FNumber: 2.8,
      ISO: 200,
      DateTimeOriginal: "2026:09:30 10:20:30",
    }),
    [
      { label: "快门", value: "1/250 s" },
      { label: "光圈", value: "ƒ/2.8" },
      { label: "ISO", value: "200" },
      { label: "拍摄时间", value: "2026-09-30 10:20:30" },
    ],
  );
  assert.deepEqual(exifInfo(), []);
});
test("pipeline handles rotation, PNG/WebP, paired descriptions, configured collections and future years", async () => {
  await mkdir(".test-output", { recursive: true });
  const temp = await mkdtemp(path.resolve(".test-output/photos-"));
  const input = path.join(temp, "input"),
    output = path.join(temp, "output");
  await mkdir(input);
  await sharp({
    create: { width: 80, height: 120, channels: 3, background: "#ab9" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD2: {
        ExposureTime: "1/125",
        FNumber: "28/10",
        ISOSpeedRatings: "100",
        DateTimeOriginal: "2026:01:01 12:00:00",
      },
    })
    .toFile(path.join(input, "2026-01-01.jpg"));
  await sharp({
    create: { width: 60, height: 40, channels: 3, background: "#baa" },
  })
    .png()
    .toFile(path.join(input, "2024-01-01.png"));
  await sharp({
    create: { width: 40, height: 60, channels: 3, background: "#aba" },
  })
    .webp()
    .toFile(path.join(input, "2027-01-01.webp"));
  await writeFile(
    path.join(input, "2026-01-01.json"),
    JSON.stringify({ description: "A story\nSecond line" }),
  );
  const result = await buildGallery({ input, output });
  assert.deepEqual(
    result.collections.map((group) => group.id),
    ["2024", "2026", "2027"],
  );
  assert.equal(result.photos.length, 3);
  const photo = result.photos[1];
  assert.equal(photo.width, 120);
  assert.equal(photo.height, 80);
  assert.equal(photo.description, "A story\nSecond line");
  assert.equal(result.photos[0].description, "");
  assert.ok(
    photo.exif.some(
      (item) => item.label === "快门" && item.value === "1/125 s",
    ),
  );
  const metadata = await sharp(
    path.join(output, path.basename(photo.preview)),
  ).metadata();
  assert.equal(metadata.exif, undefined);
  assert.equal((await readdir(output)).length, 7);
  await writeFile(path.join(input, "2026-01-01.json"), "{broken");
  await assert.rejects(buildGallery({ input, output }), /JSON 无效/);
});
