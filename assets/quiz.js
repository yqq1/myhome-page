import {
  escapeHtml,
  formatAnswerDisplay,
  getTypeLabel,
  normalizeQuestion,
  normalizeShortAnswer,
  parseCsv,
  shuffleArray
} from "./quiz-data.js";

const manifestUrl = "data/quiz-manifest.json";
const setList = document.querySelector("#set-list");
const modeSwitch = document.querySelector("#mode-switch");
const quizRoot = document.querySelector("#quiz-root");
const quizSubtitle = document.querySelector("#quiz-subtitle");

const state = {
  manifest: [],
  activeSetId: "",
  questions: [],
  index: 0,
  score: 0,
  answered: false,
  randomMode: false
};

init().catch((error) => {
  renderEmpty(`题库加载失败：${error.message}`);
});

async function init() {
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error("无法读取题库索引");

  state.manifest = await response.json();
  bindModeSwitch();
  renderSetList();
  renderEmpty("先从左侧选择一个题库开始。");
}

function renderSetList() {
  setList.innerHTML = "";

  state.manifest.forEach((setMeta) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "set-card";
    button.dataset.setId = setMeta.id;
    button.innerHTML = [
      `<span class="set-badge">${escapeHtml(setMeta.badge || "题库")}</span>`,
      `<h3>${escapeHtml(setMeta.title)}</h3>`,
      `<p class="set-desc">${escapeHtml(setMeta.description)}</p>`,
      `<p class="helper">共 ${Number(setMeta.questionCount || 0)} 题</p>`
    ].join("");
    button.addEventListener("click", () => {
      selectSet(setMeta.id).catch((error) => renderEmpty(`题库加载失败：${error.message}`));
    });
    setList.appendChild(button);
  });
}

async function selectSet(setId) {
  const setMeta = state.manifest.find((item) => item.id === setId);
  if (!setMeta) return;

  const response = await fetch(setMeta.file);
  if (!response.ok) throw new Error("无法读取题库文件");

  const csvText = await response.text();
  const questions = parseCsv(csvText)
    .filter((row) => row.set === setMeta.id)
    .map(normalizeQuestion);
  const activeQuestions = state.randomMode ? shuffleArray(questions) : questions;

  if (!activeQuestions.length) {
    renderEmpty("当前题库没有可用题目。");
    return;
  }

  state.activeSetId = setMeta.id;
  state.questions = activeQuestions;
  state.index = 0;
  state.score = 0;
  state.answered = false;

  syncActiveCard();
  quizSubtitle.textContent = `${setMeta.title} · ${setMeta.description} · ${state.randomMode ? "随机出题" : "顺序出题"}`;
  renderQuestion();
}

function renderQuestion() {
  const question = state.questions[state.index];
  if (!question) {
    renderSummary();
    return;
  }

  const isLast = state.index === state.questions.length - 1;
  const progress = Math.round((state.index / state.questions.length) * 100);

  quizRoot.innerHTML = [
    '<div class="progress-row">',
    `<span class="question-type">${getTypeLabel(question.type)}</span>`,
    `<span class="progress-copy">第 ${state.index + 1} / ${state.questions.length} 题</span>`,
    "</div>",
    '<div class="progress-bar" aria-hidden="true">',
    `<div class="progress-fill" style="width: ${progress}%"></div>`,
    "</div>",
    '<div class="question-body">',
    `<h3 class="question-title">${escapeHtml(question.title)}</h3>`,
    '<div id="answer-area"></div>',
    "</div>",
    '<div id="result-area"></div>',
    '<div class="action-row">',
    '<button id="back-to-sets" class="ghost-button" type="button">返回题库列表</button>',
    '<div class="action-group">',
    '<button id="submit-answer" class="button" type="button">提交答案</button>',
    `<button id="next-question" class="ghost-button" type="button" disabled>${isLast ? "查看结果" : "下一题"}</button>`,
    "</div>",
    "</div>"
  ].join("");

  renderAnswerArea(question);
  bindQuestionActions();
  state.answered = false;
  toggleSubmitState();
}

function renderAnswerArea(question) {
  const answerArea = document.querySelector("#answer-area");
  const activeQuestion = question.type === "single"
    ? { ...question, options: shuffleArray(question.options) }
    : question;

  if (activeQuestion.type === "short") {
    answerArea.innerHTML = [
      '<p class="helper">请输入简答内容，提交后会按完全一致规则判定。</p>',
      '<textarea id="short-answer" class="short-answer" placeholder="在这里输入你的答案"></textarea>'
    ].join("");
    document.querySelector("#short-answer").addEventListener("input", toggleSubmitState);
    return;
  }

  const options = activeQuestion.options.map((option) => {
    const inputType = activeQuestion.type === "multiple" ? "checkbox" : "radio";
    return [
      '<label class="option-item">',
      `<input type="${inputType}" name="answer-option" value="${escapeHtml(option.key)}" />`,
      '<span class="option-copy">',
      `<strong>${escapeHtml(option.key)}</strong>`,
      `<span>${escapeHtml(option.text)}</span>`,
      "</span>",
      "</label>"
    ].join("");
  }).join("");

  answerArea.innerHTML = `<div class="option-list">${options}</div>`;
  answerArea.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", toggleSubmitState);
  });
}

function bindQuestionActions() {
  document.querySelector("#back-to-sets").addEventListener("click", resetToSetList);
  document.querySelector("#submit-answer").addEventListener("click", submitAnswer);
  document.querySelector("#next-question").addEventListener("click", nextQuestion);
}

function bindModeSwitch() {
  modeSwitch.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setQuestionMode(button.dataset.mode === "random");
    });
  });
  syncModeButtons();
}

function submitAnswer() {
  if (state.answered) return;

  const question = state.questions[state.index];
  const userAnswer = collectUserAnswer(question);
  const hasAnswer = Array.isArray(userAnswer) ? userAnswer.length > 0 : Boolean(userAnswer);
  if (!hasAnswer) return;

  const normalizedAnswer = normalizeUserAnswer(question, userAnswer);
  const isCorrect = normalizedAnswer === question.answerKey;
  if (isCorrect) state.score += 1;

  state.answered = true;
  document.querySelector("#submit-answer").disabled = true;
  document.querySelector("#next-question").disabled = false;
  disableAnswerInputs();
  renderResult(question, isCorrect, normalizedAnswer);
}

function nextQuestion() {
  if (!state.answered) return;
  state.index += 1;
  renderQuestion();
}

function renderResult(question, isCorrect, normalizedAnswer) {
  const resultArea = document.querySelector("#result-area");
  resultArea.innerHTML = [
    `<div class="result-box" data-state="${isCorrect ? "correct" : "wrong"}">`,
    `<h4 class="result-title">${isCorrect ? "回答正确" : "回答错误"}</h4>`,
    `<p class="result-answer">你的答案：${escapeHtml(formatAnswerDisplay(question, normalizedAnswer))}</p>`,
    `<p class="result-answer">标准答案：${escapeHtml(formatAnswerDisplay(question, question.answer))}</p>`,
    "</div>"
  ].join("");
}

function renderSummary() {
  const total = state.questions.length;
  const wrong = total - state.score;
  const percent = total ? Math.round((state.score / total) * 100) : 0;

  quizRoot.innerHTML = [
    '<div class="summary-box">',
    '<span class="question-type">练习完成</span>',
    '<h3 class="question-title">本套题已经做完</h3>',
    '<div class="summary-grid">',
    summaryCell(total, "总题数"),
    summaryCell(state.score, "答对"),
    summaryCell(wrong, "答错"),
    summaryCell(`${percent}%`, "得分率"),
    "</div>",
    '<div class="action-row summary-actions">',
    '<button id="restart-set" class="button" type="button">重新开始</button>',
    '<button id="back-from-summary" class="ghost-button" type="button">返回题库列表</button>',
    "</div>",
    "</div>"
  ].join("");

  document.querySelector("#restart-set").addEventListener("click", restartCurrentSet);
  document.querySelector("#back-from-summary").addEventListener("click", resetToSetList);
}

function renderEmpty(message) {
  quizRoot.innerHTML = [
    '<div class="empty-state">',
    `<p class="helper">${escapeHtml(message)}</p>`,
    "</div>"
  ].join("");
}

function summaryCell(value, label) {
  return `<div><strong>${value}</strong><span>${label}</span></div>`;
}

function restartCurrentSet() {
  if (!state.activeSetId) return;
  selectSet(state.activeSetId).catch((error) => renderEmpty(`题库加载失败：${error.message}`));
}

function setQuestionMode(nextRandomMode) {
  if (state.randomMode === nextRandomMode) return;
  state.randomMode = nextRandomMode;
  syncModeButtons();

  if (state.activeSetId) {
    restartCurrentSet();
    return;
  }

  quizSubtitle.textContent = `先从左侧选择一个题库开始。当前为${state.randomMode ? "随机出题" : "顺序出题"}。`;
}

function resetToSetList() {
  state.activeSetId = "";
  state.questions = [];
  state.index = 0;
  state.score = 0;
  state.answered = false;
  quizSubtitle.textContent = `先从左侧选择一个题库开始。当前为${state.randomMode ? "随机出题" : "顺序出题"}。`;
  syncActiveCard();
  renderEmpty("先从左侧选择一个题库开始。");
}

function collectUserAnswer(question) {
  if (question.type === "short") {
    return document.querySelector("#short-answer").value.trim();
  }

  const inputs = Array.from(document.querySelectorAll('input[name="answer-option"]:checked'));
  return question.type === "multiple" ? inputs.map((input) => input.value) : (inputs[0]?.value || "");
}

function normalizeUserAnswer(question, value) {
  if (question.type === "multiple") {
    return [...value].sort().join(",");
  }

  if (question.type === "short") {
    return normalizeShortAnswer(value);
  }

  return String(value).trim();
}

function toggleSubmitState() {
  const button = document.querySelector("#submit-answer");
  if (!button || state.answered) return;

  const question = state.questions[state.index];
  const userAnswer = collectUserAnswer(question);
  const hasAnswer = Array.isArray(userAnswer) ? userAnswer.length > 0 : Boolean(userAnswer);
  button.disabled = !hasAnswer;
}

function disableAnswerInputs() {
  document.querySelectorAll("input, textarea").forEach((element) => {
    element.disabled = true;
  });
}

function syncActiveCard() {
  document.querySelectorAll(".set-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.setId === state.activeSetId);
  });
}

function syncModeButtons() {
  modeSwitch.querySelectorAll("[data-mode]").forEach((button) => {
    const isRandomButton = button.dataset.mode === "random";
    button.classList.toggle("active", state.randomMode === isRandomButton);
  });
}
