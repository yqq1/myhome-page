import {
  escapeHtml,
  formatAnswerDisplay,
  formatQuestionLimitLabel,
  formatShortAnswerDiff,
  getQuestionLimitRange,
  getTypeLabel,
  normalizeQuestion,
  normalizeQuestionLimit,
  normalizeShortAnswer,
  parseCsv,
  shuffleArray
} from "./quiz-data.js";
import { bindQuizKeyboardShortcuts } from "./quiz-keyboard.js";

const manifestUrl = "data/quiz-manifest.json";
const setList = document.querySelector("#set-list");
const modeSwitch = document.querySelector("#mode-switch");
const limitSwitch = document.querySelector("#limit-switch");
const limitInput = document.querySelector("#limit-input");
const hideQuestionToggle = document.querySelector("#hide-question-toggle");
const page = document.querySelector(".page");
const quizRoot = document.querySelector("#quiz-root");
const quizSubtitle = document.querySelector("#quiz-subtitle");

const state = {
  manifest: [],
  activeSetId: "",
  questions: [],
  index: 0,
  score: 0,
  answered: false,
  randomMode: false,
  questionLimit: null,
  hideQuestion: false,
  wrongQuestions: []
};

init().catch((error) => {
  renderEmpty(`题库加载失败：${error.message}`);
});

async function init() {
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error("无法读取题库索引");

  state.manifest = await response.json();
  bindModeSwitch();
  bindLimitSwitch();
  bindPracticeOptions();
  bindQuizKeyboardShortcuts({
    nextQuestion,
    selectOption: selectOptionByShortcut,
    submitAnswer,
    isAnswered: () => state.answered
  });
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
  const limitedQuestions = applyQuestionLimit(questions);
  const activeQuestions = state.randomMode ? shuffleArray(limitedQuestions) : limitedQuestions;

  if (!activeQuestions.length) {
    renderEmpty("当前题库没有可用题目。");
    return;
  }

  state.activeSetId = setMeta.id;
  state.questions = activeQuestions;
  state.index = 0;
  state.score = 0;
  state.answered = false;
  state.wrongQuestions = [];

  syncQuizActiveState();
  syncActiveCard();
  syncLimitButtons();
  quizSubtitle.textContent = buildQuizSubtitle(setMeta.title, setMeta.description, questions.length);
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
    renderQuestionTitle(question),
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
  const activeQuestion = question;

  if (question.type === "single") {
    question.options = shuffleArray(question.options).map((option, index) => ({
      ...option,
      displayKey: String.fromCharCode(65 + index)
    }));
  }

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
      `<strong>${escapeHtml(option.displayKey || option.key)}</strong>`,
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

function bindLimitSwitch() {
  document.querySelector("#apply-limit").addEventListener("click", () => setQuestionLimit(limitInput.value));
  document.querySelector("#clear-limit").addEventListener("click", () => setQuestionLimit("all"));
  limitInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      setQuestionLimit(limitInput.value);
    }
  });
  syncLimitButtons();
}

function bindPracticeOptions() {
  hideQuestionToggle.addEventListener("change", () => {
    state.hideQuestion = hideQuestionToggle.checked;
    if (state.questions.length && !state.answered) renderQuestion();
  });
}

function submitAnswer() {
  if (state.answered) return;

  const question = state.questions[state.index];
  const userAnswer = collectUserAnswer(question);
  const hasAnswer = Array.isArray(userAnswer) ? userAnswer.length > 0 : Boolean(userAnswer);
  if (!hasAnswer) return;

  const normalizedAnswer = normalizeUserAnswer(question, userAnswer);
  const isCorrect = normalizedAnswer === question.answerKey || (question.type === "short" && userAnswer === "1");
  if (isCorrect) state.score += 1;
  else state.wrongQuestions.push(question);

  state.answered = true;
  document.querySelector("#submit-answer").disabled = true;
  document.querySelector("#next-question").disabled = false;
  disableAnswerInputs();
  renderResult(question, isCorrect, userAnswer, normalizedAnswer);
}

function nextQuestion() {
  if (!state.answered) return;
  state.index += 1;
  renderQuestion();
}

function renderResult(question, isCorrect, userAnswer, normalizedAnswer) {
  const resultArea = document.querySelector("#result-area");
  resultArea.innerHTML = [
    `<div class="result-box" data-state="${isCorrect ? "correct" : "wrong"}">`,
    `<h4 class="result-title">${isCorrect ? "回答正确" : "回答错误"}</h4>`,
    `<p class="result-answer">你的答案：${renderUserAnswer(question, isCorrect, userAnswer, normalizedAnswer)}</p>`,
    `<p class="result-answer">标准答案：${escapeHtml(formatAnswerDisplay(question, question.answer))}</p>`,
    "</div>"
  ].join("");
}

function renderUserAnswer(question, isCorrect, userAnswer, normalizedAnswer) {
  if (question.type !== "short") {
    return escapeHtml(formatAnswerDisplay(question, normalizedAnswer));
  }

  if (isCorrect) {
    return escapeHtml(formatAnswerDisplay(question, userAnswer));
  }

  return formatShortAnswerDiff(userAnswer, question.answer);
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
    `<button id="retry-wrong" class="ghost-button" type="button"${wrong ? "" : " disabled"}>重答错题</button>`,
    '<button id="back-from-summary" class="ghost-button" type="button">返回题库列表</button>',
    "</div>",
    "</div>"
  ].join("");

  document.querySelector("#restart-set").addEventListener("click", restartCurrentSet);
  document.querySelector("#retry-wrong").addEventListener("click", retryWrongQuestions);
  document.querySelector("#back-from-summary").addEventListener("click", resetToSetList);
}

function renderEmpty(message) {
  quizRoot.innerHTML = [
    '<div class="empty-state">',
    `<p class="helper">${escapeHtml(message)}</p>`,
    "</div>"
  ].join("");
}

function renderQuestionTitle(question) {
  if (!state.hideQuestion) {
    return `<h3 class="question-title">${escapeHtml(question.title)}</h3>`;
  }

  return '<p class="hidden-question-note">题目已隐藏，可以直接默写答案。</p>';
}

function summaryCell(value, label) {
  return `<div><strong>${value}</strong><span>${label}</span></div>`;
}

function restartCurrentSet() {
  if (!state.activeSetId) return;
  selectSet(state.activeSetId).catch((error) => renderEmpty(`题库加载失败：${error.message}`));
}

function retryWrongQuestions() {
  if (!state.wrongQuestions.length) return;

  state.questions = state.wrongQuestions;
  state.index = 0;
  state.score = 0;
  state.answered = false;
  state.wrongQuestions = [];
  syncQuizActiveState();
  quizSubtitle.textContent = `重答错题 · 共 ${state.questions.length} 题`;
  renderQuestion();
}

function setQuestionMode(nextRandomMode) {
  if (state.randomMode === nextRandomMode) return;
  state.randomMode = nextRandomMode;
  syncModeButtons();

  if (state.activeSetId) {
    restartCurrentSet();
    return;
  }

  quizSubtitle.textContent = buildIdleSubtitle();
}

function setQuestionLimit(limitValue) {
  const nextLimit = normalizeQuestionLimit(limitValue);
  if (state.questionLimit === nextLimit) return;

  state.questionLimit = nextLimit;
  syncLimitButtons();

  if (state.activeSetId) {
    restartCurrentSet();
    return;
  }

  quizSubtitle.textContent = buildIdleSubtitle();
}

function resetToSetList() {
  state.activeSetId = "";
  state.questions = [];
  state.index = 0;
  state.score = 0;
  state.answered = false;
  state.wrongQuestions = [];
  syncQuizActiveState();
  quizSubtitle.textContent = buildIdleSubtitle();
  syncActiveCard();
  syncLimitButtons();
  renderEmpty("先从左侧选择一个题库开始。");
}

function selectOptionByShortcut(optionIndex) {
  const question = state.questions[state.index];
  if (!question || state.answered || question.type === "short") return false;

  const inputs = Array.from(document.querySelectorAll('input[name="answer-option"]'));
  const input = inputs[optionIndex];
  if (!input || input.disabled) return false;

  input.checked = question.type === "multiple" ? !input.checked : true;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
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
  document.querySelector("#answer-area")?.querySelectorAll("input, textarea").forEach((element) => {
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

function syncLimitButtons() {
  limitInput.disabled = false;
  document.querySelector("#clear-limit").classList.toggle("active", state.questionLimit === null);
  limitInput.value = "";
}

function syncQuizActiveState() { page.classList.toggle("quiz-active", Boolean(state.activeSetId || state.questions.length)); }

function applyQuestionLimit(questions) {
  const range = getQuestionLimitRange(state.questionLimit, questions.length);
  if (!range) return questions;
  return questions.slice(range.start - 1, range.end);
}

function buildIdleSubtitle() {
  const limitLabel = formatQuestionLimitLabel(state.questionLimit);
  const modeLabel = state.randomMode ? "随机出题" : "顺序出题";
  return `先从左侧选择一个题库开始。当前为${modeLabel}，${limitLabel}。`;
}

function buildQuizSubtitle(title, description, total) {
  const limitLabel = state.questionLimit ? formatQuestionLimitLabel(state.questionLimit, total) : `共 ${state.questions.length} 题`;
  const modeLabel = state.randomMode ? "随机出题" : "顺序出题";
  return `${title} · ${description} · ${modeLabel} · ${limitLabel}`;
}
