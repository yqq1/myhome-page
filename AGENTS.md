# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 常用命令

- `npm run dev` — 使用 Vercel 本地开发环境运行静态页面和 `api/chat.js`。
- `npm start` — 使用原 Node.js 本地服务运行 `server.js`，主要作为备用本地预览方式。
- `node server.js` — 等同于直接运行备用本地服务。

当前 `package.json` 没有 build、lint 或 test 脚本；在引入测试框架前，也没有单独运行某个测试的命令。

## 运行环境

- 需要 Node.js 18 或更高版本（见 `package.json` 的 `engines`）。
- 本地备用服务 `server.js` 会从 `.env` 读取配置，项目没有使用 `dotenv` 依赖，而是在 `server.js` 内手动加载。
- 本地配置可参考 `.env.example`，其中 `PORT` 只影响 `server.js` 备用服务，默认是 `3000`。

## 架构概览

这是一个面向 Vercel 部署的小型个人主页项目：根目录 HTML 文件作为静态页面，`api/chat.js` 作为 Vercel Serverless Function 代理 DeepSeek 聊天接口。

- `index.html` 包含主页 UI、内联 CSS 和全部客户端聊天逻辑。脚本维护内存中的 `conversation` 数组，并把最近 10 条消息发送到 `/api/chat`。
- `works.html` 是独立的静态作品页，包含内联 CSS，没有 JavaScript。
- `api/chat.js` 是 Vercel 部署时的聊天接口入口。它接收浏览器传来的 `messages` 数组，只保留最近的 `user` / `assistant` 消息，前置固定的 YQ 人设 system prompt，然后调用 DeepSeek chat completions API。浏览器端不会接触 `DEEPSEEK_API_KEY`。
- `server.js` 是备用本地 Node.js 服务：负责加载 `.env`、从仓库根目录提供静态文件，并处理同样的 `POST /api/chat`。它不是 Vercel 部署的主入口。

## 编辑注意事项

- 主页内容和聊天 UI 修改主要在 `index.html`。
- 数字分身应知道什么、如何回答时，优先修改 `api/chat.js` 中的 persona prompt；如果还需要保持备用本地服务一致，再同步修改 `server.js`。
- 新增前端资源时，如果仍要支持 `server.js` 备用本地服务，确认其中对应扩展名有正确的 `Content-Type`。
- 如果新增测试，也要同步在 `package.json` 添加脚本，方便未来实例发现测试命令。
- 本仓库中的说明、注释、面向维护者的文案优先使用中文。
