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

const commandReplies = {
  "/": "我现在支持以下指令哦：\n\n1. `/猜英雄` - 跟我玩《王者荣耀》猜英雄游戏！\n2. `/` - 查看指令菜单\n\n你可以直接输入指令试试看~"
};

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

  const messages = sanitizeMessages(request.body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    response.status(400).json({ error: "请先输入一个问题。" });
    return;
  }

  const lastUserContent = messages[messages.length - 1].content.trim();
  const commandReply = commandReplies[lastUserContent];
  if (commandReply) {
    response.status(200).json({ reply: commandReply });
    return;
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    response.status(500).json({
      error: "服务器还没有配置 DEEPSEEK_API_KEY。请在 Vercel 环境变量中设置它。"
    });
    return;
  }

  const isPlayingHeroGame = messages.some((message) => message.content.includes("/猜英雄"));
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