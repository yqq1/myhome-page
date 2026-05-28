const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = __dirname;
loadEnvFile(path.join(rootDir, ".env"));

const port = Number(process.env.PORT || 3000);
const deepseekUrl = "https://api.deepseek.com/chat/completions";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const personaPrompt = `
你是 YQ 的个人主页数字分身，面向 YQ 的朋友聊天。
你要用中文回复，语气自然、简洁、带一点轻松感，但不要夸张。

关于 YQ：
- 名字：YQ
- 身份：大学生
- 一句话介绍：一个正在学习 AI 后端的萌新 engineer
- 最近在做：搭建自己的个人主页，学习算法，完善以往项目，同时学习新的技术栈和 AI
- 兴趣：游戏、AI 应用、散步
- 关心或擅长的方向：AI 应用、AI 后端、零系列游戏的更新
- 有记忆点的特点：喜欢自言自语，脑子里总有奇奇怪怪的想法
- 近期喜爱的角色：零.红蝶中的天苍澪和天苍茧

回答要求：
- 如果被问到 YQ 的作品，可以让访客通过顶栏的作品按钮跳转。
- 如果被问到联系方式，可以让访客通过顶栏的练习按钮跳转。
- 不要声称自己是真人。你是 YQ 的数字分身。
- 不知道的信息要坦诚说明，不要编造。
`.trim();

function sendJson(response, statusCode, data) {
  const body = JSON.stringify(data);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error("REQUEST_TOO_LARGE"));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").slice(0, 1200)
    }))
    .filter((message) => message.content.trim())
    .slice(-10);
}

async function handleChat(request, response) {
  if (!process.env.DEEPSEEK_API_KEY) {
    sendJson(response, 500, {
      error: "服务器还没有配置 DEEPSEEK_API_KEY。请在 .env 或服务器环境变量中设置它。"
    });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readRequestBody(request));
  } catch (error) {
    sendJson(response, error.message === "REQUEST_TOO_LARGE" ? 413 : 400, {
      error: "请求内容格式不正确。"
    });
    return;
  }

  const messages = sanitizeMessages(payload.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    sendJson(response, 400, {
      error: "请先输入一个问题。"
    });
    return;
  }

  const lastUserContent = messages[messages.length - 1].content.trim();

  // 🔴 策略 1：指令拦截，实现 0 Token 消耗
  if (lastUserContent === "/") {
    sendJson(response, 200, {
      reply: "我现在支持以下指令哦：\n\n1️⃣ `/猜英雄` - 跟我玩《王者荣耀》猜英雄游戏！\n2️⃣ `/` - 查看指令菜单\n\n你可以直接输入指令试试看~"
    });
    return; // 直接返回，不再请求 DeepSeek
  }

  // 🔴 策略 2：动态系统提示词（检测到最近在玩游戏才加载规则）
  const isPlayingHeroGame = messages.some(msg => msg.content.includes("/猜英雄"));
  let currentSystemPrompt = personaPrompt;

  if (isPlayingHeroGame) {
    currentSystemPrompt += `
\n\n【特殊指令模式：/猜英雄】
当前你正在和用户玩《王者荣耀》猜英雄游戏。
规则如下：
1. 你已经在心里随机挑选了一个《王者荣耀》的英雄角色（不要说出来）。
2. 用户会通过提问来猜测（比如：是男的吗？是法师吗？台词是什么？）。
3. 你必须根据设定的英雄真实回答用户的提问，每次回答只回答当前问题。
4. 绝对不能直接说出该英雄的名字，直到用户明确猜中！
5. 如果用户刚输入 /猜英雄，你就回复：“我已经想好了一个王者荣耀的英雄，你可以开始问我问题啦（比如问我性别、职业或台词）！
6.不要瞎编角色，一定要从《王者荣耀》这个游戏里面挑选英雄
”
`;
  }

  try {
    const upstream = await fetch(deepseekUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        messages: [
          { role: "system", content: currentSystemPrompt },
          ...messages
        ],
        thinking: { type: "disabled" },
        stream: false,
        temperature: 0.7,
        max_tokens: 600
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      sendJson(response, upstream.status, {
        error: data.error?.message || "DeepSeek API 请求失败。"
      });
      return;
    }

    const reply = data.choices?.[0]?.message?.content?.trim();
    sendJson(response, 200, {
      reply: reply || "我暂时没有生成有效回复，可以换个问法再试一次。"
    });
  } catch (error) {
    sendJson(response, 502, {
      error: "连接 DeepSeek API 失败，请检查服务器网络或稍后重试。"
    });
  }
}

function serveStatic(request, response) {
  const requestPath = decodeRequestPath(request);
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.join(rootDir, path.normalize(safePath).replace(/^(\.\.[/\\])+/, ""));

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".csv": "text/csv; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp"
    }[ext] || "application/octet-stream";

    response.writeHead(200, { "Content-Type": contentType });
    response.end(content);
  });
}

function decodeRequestPath(request) {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

const server = http.createServer((request, response) => {
  const pathname = decodeRequestPath(request);

  if (pathname === "/api/chat") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method Not Allowed" });
      return;
    }

    handleChat(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end("Method Not Allowed");
    return;
  }

  serveStatic(request, response);
});

server.listen(port, () => {
  console.log(`YQ home page is running at http://localhost:${port}`);
});
