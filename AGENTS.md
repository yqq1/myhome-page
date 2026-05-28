# AGENTS.md

## 项目规则

- 优先小范围读取关键文件，不做全仓无差别扫描。
- 优先编辑现有文件，不重写整个文件。
- 不要重复读取已读文件，除非文件已被修改。
- 不要重构未要求修改的代码。
- 不要还原用户或其他工具已有改动。
- 面向维护者的说明、注释、文案优先使用中文。
- 输出保持简短，不贴完整修改后代码，不写无关说明。

## 常用命令

- `rtk npm start`：启动本地备用服务 `server.js`。
- `rtk node server.js`：等同于直接运行备用本地服务。
- 当前 `package.json` 只有 `start` 脚本，没有 build、lint、test 脚本。
- 运行环境需要 Node.js 18+。

## 项目结构

- 根目录 HTML 是静态页面：`index.html`、`works.html`、`quiz.html`。
- `server.js` 提供本地静态服务，并处理 `POST /api/chat`。
- 当前仓库没有 `api/chat.js`。
- `assets/quiz.js` 负责刷题交互逻辑。
- `assets/quiz-data.js` 负责 CSV 解析、题目规范化、答案格式化、出题范围处理。
- `assets/quiz.css` 是刷题页主样式。
- `assets/theme.css`、`assets/theme.js` 负责暗色模式。
- 题库索引在 `data/quiz-manifest.json`，题库 CSV 在 `data/`。

## 编辑注意

- 新增前端资源时，若要支持 `server.js`，同步确认 `Content-Type`。
- 修改聊天人设时优先看 `server.js` 中的 persona prompt。
- 修改刷题功能时优先看 `quiz.html`、`assets/quiz.js`、`assets/quiz-data.js`、`assets/quiz.css`。
- 修改暗色模式时优先看 `assets/theme.css`、`assets/theme.js` 和各页面的 `data-theme-toggle`。