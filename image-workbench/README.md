# 图片工作台

AI Portfolio Studio 的第二个站点，用于在浏览器中制作商品图：画布编辑、图层、文字、Logo、赠品排版、批量导出，以及本机抠图。AI 生图、图片顾问和母图识别是可选能力，需要使用者自行配置兼容服务。

## 本地运行

需要 Python 3.12 或更新版本。进入本目录后运行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe server.py
```

上面是 Windows 示例；macOS/Linux 请将 `.\.venv\Scripts\python.exe` 改为 `.venv/bin/python`。启动后按终端提示，在本机浏览器打开工作台。端口可用 `WORKBENCH_PORT` 环境变量调整。服务只监听本机，不提供局域网访问。

不配置 AI 服务也能使用画布编辑、Logo 素材、导出和本机抠图。抠图使用仓库内的 U-2-Net 小模型；相关授权文件位于 [`models`](./models)。编辑记录保存在当前浏览器，服务生成结果与任务记录默认写在用户目录下的 `.ai-portfolio-studio/image-workbench`，不会写进仓库。

### 赠品素材库

新版支持本地赠品素材搜索、版式示例和文字拆解。将你有权使用的 PNG/WebP 图片分别放在本目录的 `gift-assets/`（商品素材）或 `gift-examples/`（完整赠品版式）后重启服务，页面会按文件名建立索引。素材目录及由示例生成的 `gift-example-text.json` 不提交到 Git；仓库不附带原工作台的商品图片库。

需要按示例图片中的文字搜索时，运行 `python extract_gift_examples.py` 生成本机 OCR 索引。没有素材时，工作台仍可打开，赠品素材搜索会提示素材库为空。

### 系列图精细抠图

系列母图的商品轮廓处理使用可选的 SAM-HQ 模型。模型文件较大，仓库只保留来源、校验值及许可证。需要此功能时运行：

```powershell
.\.venv\Scripts\python.exe download_series_models.py
```

脚本从模型清单所列来源下载约 380 MB 文件，校验大小和 SHA-256 后保存到本机 `models/`；这些文件不会提交到 Git。未安装时，普通画布、本机 U-2-Net 抠图和其他不依赖 SAM-HQ 的功能仍可使用。

## 可选 AI 配置

仅在需要 AI 生图时设置以下环境变量：

```text
IMAGE_API_BASE=https://your-provider.example/v1
IMAGE_MODEL=your-image-model
IMAGE_API_KEY=your-private-key
```

图片接口需支持 `/images/generations`、`/images/edits`，接受代码中的 `aspect_ratio`、`resolution`、`quality`、`images` 等字段，并返回 PNG URL 或 `b64_json`。不同服务的字段并不一定通用，请在接入前核对其接口。代码不会自动重复提交付费生图请求。

图片顾问、提示词辅助、赠品素材语义搜索和母图识别还需要一个支持图文消息、JSON 输出的 Chat Completions 接口：

```text
ADVISOR_API_BASE=https://your-provider.example/v1
ADVISOR_MODEL=your-vision-model
ADVISOR_API_KEY=your-private-key
```

请将密钥留在本机环境变量或未提交的 `.env` 文件中；本项目不会读取线上原服务的凭据，也不包含原服务地址和历史任务数据。

## 目录说明

- `index.html` 和 `*.js`、`*.css`：浏览器工作台。
- `server.py`：本机 HTTP 服务和任务接口。
- `background_cutout.py`、`models/`：本机抠图。
- `image_client.py`、`image_advisor.py`、`series_layout.py`：可选 AI 接口与母图处理。
- `gift_catalog.py`、`gift_example_editor.py`、`gift-catalog.js`：赠品素材库与版式编辑。
- `prompt_helper.py`、`prompt-help.js`：可选提示词辅助。
- `logo-library/`、`logo-library.json`：页面所需的标识素材。品牌名称与标识仍属于各自权利人；使用时应核实授权和适用场景。

本站也能作为静态页面预览，但 AI、生图历史和本机抠图需要运行本地 Python 服务。
