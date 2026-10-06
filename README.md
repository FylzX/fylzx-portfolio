# FylzX's Portfolio

摄影作品展：统一尺寸的玻璃展板，照片保持比例、留边展示。根据实际照片分布，按完整月份合并为少量时间段；分类之间不循环，类内照片按日期和编号循环浏览。分组定义见 `collections.json`，空分类不显示

## 运行

需要 Node.js 22.18+（或 Node.js 24）与 npm

```sh
npm ci
npm run dev
```

也可直接双击根目录的 `启动服务器.cmd`，首次运行会安装缺少的依赖

本地入口：终端显示的地址（默认 http://127.0.0.1:5173）。点击“进入作品展”浏览。方向键左右切换分类，上下或滚轮切换照片；拖动可在三维阵列中浏览。点击照片或“查看照片”进入详情，查看 EXIF 与可选描述，可进入 360° 视图旋转、缩放、平移与复位

## 添加照片

把 JPG、WebP 或 PNG 放入 [`photos/`](photos/README.md)，如 `2024-01-01-01.jpg`、`2024-01-01-02.webp`、`2024-01-02.png`。同名 JSON 的 `description` 字段用于照片描述。开发时自动刷新，构建时自动整理。目录内已导入 101 张真实照片。

```sh
npm run build
npm run preview
```

静态站点输出为 `dist/`。构建生成 `public/gallery/` 的网页预览图与清单，不依赖原参考目录，支持子路径部署。展示数据仅包含摄影所需 EXIF 字段。照片原文件不会被拷贝到发布目录

```sh
npm test
# 另一个终端先运行 npm run dev，再执行：
npm run test:browser
```

浏览器检查使用独立的临时 Edge 环境，覆盖分类边界、类内循环、EXIF、描述、详情、360°、设置和手机视口。不会读取用户浏览器配置。截图输出到已忽略的 `.test-output/`

## 来源

从 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI) 提取工作室光照、阻尼/波浪公式、画质管线和查看器镜头逻辑，并为摄影重写展板、导航与页面。保留原作者 MIT 许可于 [`public/licenses/RhineLabUI-MIT.txt`](public/licenses/RhineLabUI-MIT.txt)。原 `RhineLabUI-main/` 目录不参与构建，继续被 Git 忽略

## 当前分组

按 `LrC out` 中 101 张照片的分布设定，月份是最小单位：

| 分组          | 照片数量 |
| ------------- | -------: |
| 2024          |        8 |
| 2025 · 1月    |       27 |
| 2025 · 2—3月  |       22 |
| 2025 · 4—7月  |       13 |
| 2025 · 8—12月 |       19 |
| 2026          |       12 |

101 张真实照片已复制到 `photos/`，原文件仍保留在已被 Git 忽略的 `LrC out/`。按文件名中的日期归类，不用 EXIF 日期改组。未来年份默认单独归年，可以再修改 `collections.json` 的名称及起止月份

## 许可与版权

本项目基于 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI)修改
RhineLabUI 采用 MIT 许可证，Copyright (c) 2026 LBEILC
原作者版权声明与完整许可文本见[RhineLabUI MIT 许可证](public/licenses/RhineLabUI-MIT.txt)

除另有说明的第三方内容和摄影作品外，本项目代码采用 MIT 许可证，详见 [LICENSE](LICENSE)FylzX 对自行创作的修改和新增部分保留相应版权, 第三方内容遵循各自的许可证

`photos/` 中的摄影作品及其生成的预览图、缩略图不适用上述MIT 许可证
除另有说明外，这些作品版权归 FylzX 所有，保留所有权利

允许为正常浏览本作品展而进行必要的加载与缓存
除法律允许的情形或另有授权外，未经许可不得复制、分发、改编这些摄影作品，或将其用于商业用途