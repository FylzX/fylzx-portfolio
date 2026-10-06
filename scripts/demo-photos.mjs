import sharp from "sharp";
import { mkdir, writeFile, access } from "node:fs/promises";
const directory = new URL("../photos/", import.meta.url);
await mkdir(directory, { recursive: true });
const colors = [
  "#a6b8b2",
  "#b9cbd7",
  "#d0ae93",
  "#d8cebc",
  "#889bab",
  "#b4907d",
  "#bcc3a9",
  "#798d82",
];
const dates = [
  "01-01-01",
  "01-01-02",
  "01-02",
  "03-18",
  "05-26",
  "07-09",
  "08-23",
  "09-30",
];
for (const year of [2024, 2025, 2026]) {
  for (let i = 0; i < dates.length; i++) {
    const extension = ["jpg", "webp", "png"][i % 3];
    const url = new URL(`${year}-${dates[i]}.${extension}`, directory);
    try {
      await access(url);
      continue;
    } catch {
      /* Never replace a user's existing image. */
    }
    const portrait = i % 3 === 1;
    let pipeline = sharp({
      create: {
        width: portrait ? 480 : 720,
        height: portrait ? 720 : 480,
        channels: 3,
        background: colors[(i + year - 2024) % colors.length],
      },
    });
    if (extension === "jpg")
      pipeline = pipeline
        .jpeg()
        .withExif({
          IFD0: { Make: "FylzX", Model: "Color Study (Demo)" },
          IFD2: {
            ExposureTime: "1/125",
            FNumber: "28/10",
            ISOSpeedRatings: "100",
            FocalLength: "35/1",
            DateTimeOriginal: `${year}:${dates[i].slice(0, 5).replace("-", ":")} 10:30:00`,
          },
        });
    else if (extension === "webp") pipeline = pipeline.webp();
    else pipeline = pipeline.png();
    await writeFile(url, await pipeline.toBuffer());
  }
  const sidecar = new URL(`${year}-09-30.json`, directory);
  try {
    await access(sidecar);
  } catch {
    await writeFile(
      sidecar,
      JSON.stringify(
        {
          description:
            "色彩习作 · 这是一张纯色测试图片，用于预览展板比例、留边与浏览效果。替换为自己的照片后，可在同名 JSON 中写下拍摄故事。",
        },
        null,
        2,
      ),
    );
  }
}
console.log("测试照片已准备：每年 8 张，包含横向、竖向和三种图片格式。");
