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
          { role: "system", content: personaPrompt },
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
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;
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

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

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
