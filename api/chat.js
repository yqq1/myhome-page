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

const deepseekUrl = "https://api.deepseek.com/chat/completions";

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

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    response.status(500).json({
      error: "服务器还没有配置 DEEPSEEK_API_KEY。请在 Vercel 环境变量中设置它。"
    });
    return;
  }

  const messages = sanitizeMessages(request.body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    response.status(400).json({ error: "请先输入一个问题。" });
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
      response.status(upstream.status).json({
        error: data.error?.message || "DeepSeek API 请求失败。"
      });
      return;
    }

    const reply = data.choices?.[0]?.message?.content?.trim();
    response.status(200).json({
      reply: reply || "我暂时没有生成有效回复，可以换个问法再试一次。"
    });
  } catch (error) {
    response.status(502).json({
      error: "连接 DeepSeek API 失败，请检查服务器网络或稍后重试。"
    });
  }
};
