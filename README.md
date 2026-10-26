# 赵亚杰 · AI Product Manager & FDE Portfolio

一个面向 AI 产品经理与 FDE 求职场景的个人主页，集中展示我的客户现场 AI 落地能力、Agent 与 Skill 产品经验、项目成果和联系方式。网站同时内置「AI 求职小杰君」，访客可以直接询问我的项目、经历、岗位匹配度和作品集信息。

[在线访问网站](https://www.zyjaiproduct.click/) · [查看飞书作品集](https://ocnlnp1ta2t2.feishu.cn/drive/folder/Wpm9fd5g4liX9Edxp3pctObYnng)

## 网站内容

- **个人定位**：2 年经验 AI 产品经理与 FDE，专注客户现场 AI 落地、Agent 方案、Skill 封装和 Vibe Coding；首页速览 3 段 AI 产品实习、客户现场 Agent 落地能力，以及 6 个月以上可实习时长
- **核心项目**：2 个个人开源 Agent Skill 项目——BOSS 直聘 Windows 桌面端 自动化Skill 合集（内含 4 个可组合 Skill），以及支持查询会话、读取消息和生成聊天总结的个人微信本地聊天记录读取器
- **量化成果**：沉淀 20+ 个技能模块，个性化 Push 点击率由 2.3% 提升至 7.8%，角色多样性提高 30%，RAG 客服响应准确率达到 91%
- **经历展示**：一级展示任职/就读时间、公司或学校及岗位/专业；公司通过“点击查看详情”进入项目细节，学校教育信息直接展开
- **AI 求职助手**：以最新简历和 AI 实验室导航为知识上下文，支持流式回答、快捷提问、历史消息、编辑与复制
- **多端体验**：响应式布局、玻璃卡片视觉、入场动效与减少动态效果适配

## 技术实现

| 模块 | 实现方式 |
| --- | --- |
| 页面结构 | 原生 HTML5 |
| 视觉与响应式 | 原生 CSS3 |
| 页面交互 | 原生 JavaScript |
| AI 接口 | Vercel Serverless Function |
| 模型接入 | OpenAI-compatible Chat Completions API |
| 部署 | Vercel |

AI 助手通过 `/api/chat` 访问服务端函数。API Key 仅保存在部署平台的环境变量中，不会写入前端代码或提交到仓库。

## 项目结构

```text
.
├── api/
│   ├── assistant-knowledge-base.md  # 最新简历与 AI 实验室完整知识库
│   └── chat.js                      # AI 助手服务端接口
├── assets/                      # 视频、插画与图标资源
├── index.html                   # 页面结构与内容
├── style.css                    # 视觉样式与响应式布局
├── script.js                    # 页面交互与 AI 助手逻辑
├── preloader.js                 # 首屏加载与资源预载
├── package.json
└── vercel.json                  # Vercel 与安全响应头配置
```

## 本地运行

请先安装 [Node.js](https://nodejs.org/)。

```bash
npm install
npx vercel dev
```

启动后按终端提示访问本地地址。只需预览静态页面时，也可以直接打开 `index.html`；AI 助手需要通过 Vercel 本地开发环境运行。

## 环境变量

在本地创建 `.env`，或在 Vercel 项目设置中添加以下变量：

```text
AI_API_KEY=your_api_key
AI_API_BASE=https://token-plan-cn.xiaomimimo.com/v1
AI_MODEL=mimo-v2.6-flash
AI_MAX_COMPLETION_TOKENS=8000
CHAT_RATE_LIMIT_WINDOW_MS=60000
CHAT_RATE_LIMIT_MAX=12
CHAT_UPSTREAM_TIMEOUT_MS=45000
```

其中 `AI_API_KEY` 为必填项，其余变量可按所使用的 OpenAI-compatible 模型服务调整。当前示例使用 Xiaomi MiMo Token Plan 的 `mimo-v2.6-flash` 模型；每次请求只调用模型一次，不做自动续写。`AI_MAX_COMPLETION_TOKENS` 只控制单次回答预算；生产环境会至少使用 8000 个 completion tokens。接口仍保留单实例内存限流，默认每个实例每分钟 12 次；这不是跨 Vercel 实例的硬额度，模型供应商侧仍应设置独立 Key、日预算和余额告警。`.env` 已被 Git 忽略，请勿提交真实密钥。

## 部署

1. 将本仓库导入 Vercel。
2. 在项目的 Environment Variables 中配置模型服务变量。
3. 使用仓库根目录作为项目根目录并完成部署。

更详细的部署说明见 [`DEPLOY_VERCEL.md`](./DEPLOY_VERCEL.md)。

## 说明

本仓库用于维护赵亚杰的个人作品集网站。页面中的项目数据、经历与联系方式均为个人展示内容。

<!-- Push notification test: documentation-only change; no website runtime files modified. -->

MiMo V2.5 已于北京时间 2026-10-21 10:00 下线。服务端对小米官方域名下遗留的 `AI_MODEL=mimo-v2.5` 自动使用 `mimo-v2.6-flash`，`mimo-v2.5-pro` 自动使用 `mimo-v2.6-pro`；其他服务商的模型配置保持原值。
 