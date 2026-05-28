# HANDOFF.md

## 当前任务

继续打磨个人主页与刷题系统，最近重点是手机端刷题体验和暗色模式细节。

## 已确认事实

- 项目是静态个人主页，备用本地服务入口是 `server.js`。
- `package.json` 只有 `npm start`，无 build/lint/test。
- 当前没有 `api/chat.js`。
- 刷题页入口在 `works.html`，页面是 `quiz.html`。
- 题库通过 `data/quiz-manifest.json` 指向本地 CSV。
- `server.js` 已支持 `.csv`、`.json`、`.css`、`.js` 等静态资源类型，并会 decode URL 路径。
- `assets/quiz.js` 当前约 395 行，接近 400 行限制，后续优先把新增工具逻辑放到 `assets/quiz-data.js` 或 CSS。
- `assets/quiz-data.js` 当前约 170 行。
- `assets/quiz.css` 当前约 297 行。
- `assets/theme.css` 当前约 279 行。

## 已做修改

- 增加刷题页和作品页入口。
- 支持顺序/随机出题。
- 支持手动输入题数范围：`5` 表示 `1-5`，`5-10` 表示第 5 到第 10 题。
- 单选题选项每次随机，但显示字母保持顺序。
- 简答题判断已忽略大小写、空格和符号。
- 修复重新开始后不能编辑题数的问题。
- 增加暗色模式：`assets/theme.css`、`assets/theme.js`。
- 三个页面已接入主题切换按钮。
- 手机端刷题样式已修正：长选项/答案强制换行，避免横向撑宽；题干和操作区在移动端使用 sticky 改善可见性。

## 优先阅读文件

- `quiz.html`
- `assets/quiz.js`
- `assets/quiz-data.js`
- `assets/quiz.css`
- `assets/theme.css`
- `assets/theme.js`
- `data/quiz-manifest.json`
- `server.js`
- `works.html`

## 剩余待办

- 用真实移动端或浏览器移动视口验证 `quiz.html`：长选项、长标准答案、简答题输入、底部按钮 sticky。
- 检查中文文件名题库在浏览器中是否正常加载。
- 检查终端输出中的中文编码显示异常是否只是控制台显示问题，避免误判文件内容。
- 如继续扩展刷题逻辑，避免继续增大 `assets/quiz.js`。