# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

- `npm start` — 启动本地 Node.js 服务（`server.js`），端口来自 `PORT`，默认是 3000。
- `node server.js` — 等同于直接运行服务器入口。

当前 `package.json` 没有 build、lint 或 test 脚本；在引入测试框架前，也没有单独运行某个测试的命令。

## 运行环境

- 需要 Node.js 18 或更高版本（见 `package.json` 的 `engines`）。
- 运行时配置会从 `.env` 读取，项目没有使用 `dotenv` 依赖，而是在 `server.js` 内手动加载。
- 本地配置可参考 `.env.example`：
  - `DEEPSEEK_API_KEY` 是 `/api/chat` 必需配置。
  - `DEEPSEEK_MODEL` 未设置时默认使用 `deepseek-v4-flash`。
  - `PORT` 未设置时默认使用 `3000`。

## 架构概览

这是一个小型 CommonJS Node.js 个人主页项目，由静态 HTML 页面和服务端 DeepSeek 聊天代理组成。

- `server.js` 是唯一后端入口：负责加载 `.env`、从仓库根目录提供静态文件，并处理 `POST /api/chat`。
- `/api/chat` 接收浏览器传来的 `messages` 数组，只保留最近的 `user` / `assistant` 消息，前置固定的 YQ 人设 system prompt，然后调用 DeepSeek chat completions API。浏览器端不会接触 `DEEPSEEK_API_KEY`。
- 静态路由按文件解析：`/` 映射到 `index.html`，其他 GET/HEAD 路径相对仓库根目录解析，并带有路径穿越检查。
- `index.html` 包含主页 UI、内联 CSS 和全部客户端聊天逻辑。脚本维护内存中的 `conversation` 数组，并把最近 10 条消息发送到 `/api/chat`。
- `works.html` 是独立的静态作品页，包含内联 CSS，没有 JavaScript。

## 编辑注意事项

- 主页内容和聊天 UI 修改主要在 `index.html`；数字分身应知道什么、如何回答，修改 `server.js` 中的 persona prompt。
- 新增前端资源时，确认 `server.js` 中对应扩展名有正确的 `Content-Type`。
- 如果新增测试，也要同步在 `package.json` 添加脚本，方便未来实例发现测试命令。
- 本仓库中的说明、注释、面向维护者的文案优先使用中文。
