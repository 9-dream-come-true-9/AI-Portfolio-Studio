# Vercel 部署清单

把当前仓库根目录作为 Vercel 项目根目录上传或导入。

## 必须包含

```text
index.html
style.css
script.js
assets/
api/chat.js
api/assistant-knowledge-base.md
package.json
vercel.json
```

## 环境变量

本地的 `.env` 只用于开发调试，包含真实密钥时不要上传。Vercel 线上只需要配置模型服务和基础限流变量：

```text
AI_API_KEY=你的模型服务 API Key
AI_API_BASE=https://token-plan-cn.xiaomimimo.com/v1
AI_MODEL=mimo-v2.6-flash
AI_MAX_COMPLETION_TOKENS=8000

# 单个 Vercel 实例内的基础限流（不是跨实例硬额度）
CHAT_RATE_LIMIT_WINDOW_MS=60000
CHAT_RATE_LIMIT_MAX=12
CHAT_UPSTREAM_TIMEOUT_MS=45000
```

`AI_API_KEY` 是必填项。AI 助手会通过 `/api/chat` 调用服务端模型代理，API Key 不会写进 `index.html` 或 `script.js`。当前版本不依赖 Redis、Turnstile 或额外的挑战接口；限流使用进程内内存，在 Vercel 多实例环境下只能作为基础缓冲，不能当作严格的每日预算。

`CHAT_UPSTREAM_TIMEOUT_MS` 用于限制等待模型首尾响应的时间，默认 45 秒；Vercel 函数最大执行时间需保持在至少 60 秒，避免较慢但有效的模型回答被过早判为超时。
如果 Vercel 环境变量中已经存在旧的 `CHAT_UPSTREAM_TIMEOUT_MS=30000`，请改为 `45000` 或删除后重新部署；显式旧值会覆盖代码默认值。

模型供应商侧请使用公开作品集专用的独立 API Key，并设置日预算、余额告警、TPM/RPM 或并发上限。修改 Vercel 环境变量后必须重新部署才会生效。

## 部署步骤

1. 将本仓库导入 Vercel。
2. 使用仓库根目录作为项目根目录。
3. 在项目的 Environment Variables 中配置上面的变量，并至少勾选 Production。
4. 完成部署后打开网站，发送一条普通问题验证流式回答。
5. 如果看到 `AI service is not configured`，检查 `AI_API_KEY`、`AI_API_BASE` 和 `AI_MODEL` 是否配置在正确的 Vercel 项目与环境。

## 不要上传 / 不要写入前端

```text
.env
真实 API Key
server.js
knowledge/
neocities_site/
```

API Key 只能放 Vercel Environment Variables，不能写入 `index.html` 或 `script.js`。

MiMo V2.5 已于北京时间 2026-10-21 10:00 下线。服务端对小米官方域名下遗留的 `AI_MODEL=mimo-v2.5` 自动使用 `mimo-v2.6-flash`，`mimo-v2.5-pro` 自动使用 `mimo-v2.6-pro`；其他服务商的模型配置保持原值。
