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
import { bindQuizKeyboardShortcuts } from "./quiz-keyboard.js?v=20260706a";
import { bindCustomImport } from "./quiz-import.js";
import { buildFavoriteSet, FAVORITE_SET_ID, getFavoriteCount, isQuestionFavorite, toggleQuestionFavorite } from "./quiz-favorites.js";
import { loadQuizManifest } from "./quiz-manifest.js";
import { bindWrongBookActions, createWrongBookRecord, renderWrongBook } from "./quiz-wrong-book.js";

const setList = document.querySelector("#set-list");
const modeSwitch = document.querySelector("#mode-switch");
const limitSwitch = document.querySelector("#limit-switch");
const limitInput = document.querySelector("#limit-input");
const hideQuestionToggle = document.querySelector("#hide-question-toggle");
const practiceSettingsToggle = document.querySelector("#practice-settings-toggle");
const practiceSettingsPanel = document.querySelector("#practice-settings-panel");
const practiceSettingsSummary = document.querySelector("#practice-settings-summary");
const page = document.querySelector(".page");
const quizRoot = document.querySelector("#quiz-root");
const quizSubtitle = document.querySelector("#quiz-subtitle");
const quizBlockTransitionSelectors = [".progress-row", ".question-body", ".action-row", ".summary-box", ".empty-state"];

const state = {
  manifest: [],
  activeSetId: "",
  activeSetTitle: "",
  customSet: null,
  questions: [],
  index: 0,
  score: 0,
  answered: false,
  randomMode: false,
  questionLimit: null,
  hideQuestion: false,
  privateMode: false,
  wrongQuestions: [],
  wrongBookRecords: []
};
let practiceSettingsCloseTimer = 0;
let quizContentTransitionCleanup = null;
let quizBlockTransitionCleanup = null;
let quizExitLayerCleanup = null;
const quizResizeFallbackMs = 700;

init().catch((error) => {
  renderEmpty(`题库加载失败：${error.message}`);
});

async function init() {
  const manifestData = await loadQuizManifest();
  state.manifest = manifestData.items;
  state.privateMode = manifestData.privateMode;
  bindModeSwitch();
  bindLimitSwitch();
  bindPracticeOptions();
  bindPracticeSettings();
  bindCustomImport({ onImport: startCustomQuiz });
  bindQuizKeyboardShortcuts({ nextQuestion, selectOption: selectOptionByShortcut, submitAnswer, isAnswered: () => state.answered });
  renderSetList();
  renderEmpty(buildIdleSubtitle());
}

function renderSetList() {
  setList.innerHTML = "";
  renderFavoriteSetCard();

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

function renderFavoriteSetCard() {
  const count = getFavoriteCount();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "set-card favorite-set-card";
  button.dataset.setId = FAVORITE_SET_ID;
  button.disabled = count === 0;
  button.innerHTML = [
    '<span class="set-badge">重点</span>',
    "<h3>重点题练习</h3>",
    '<p class="set-desc">集中重做手动标记的难题。</p>',
    `<p class="helper">${count ? `已收藏 ${count} 题` : "暂无重点题"}</p>`
  ].join("");
  button.addEventListener("click", startFavoriteQuiz);
  setList.appendChild(button);
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
  startQuestionSet({ ...setMeta, questions });
}

function renderQuestion() {
  const question = state.questions[state.index];
  if (!question) {
    renderSummary();
    return;
  }

  const isLast = state.index === state.questions.length - 1;
  const progress = Math.round((state.index / state.questions.length) * 100);

  const html = [
    '<div class="progress-row">',
    `<span class="question-type">${getTypeLabel(question.type)}</span>`,
    `<span class="progress-copy">第 ${state.index + 1} / ${state.questions.length} 题</span>`,
    "</div>",
    '<div class="progress-bar" aria-hidden="true">',
    `<div class="progress-fill" style="width: ${progress}%"></div>`,
    "</div>",
    '<div class="question-body">',
    renderQuestionHeading(question),
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

  renderQuizContent(html, () => {
    renderAnswerArea(question);
    bindQuestionActions();
    state.answered = false;
    toggleSubmitState();
  });
}

function startCustomQuiz(importedSet) {
  startQuestionSet(importedSet, { preserveForRestart: true });
}

function startFavoriteQuiz() {
  startQuestionSet(buildFavoriteSet(), { emptyMessage: "暂无重点题。先在题目右上角标记重点。" });
}

function startQuestionSet(questionSet, options = {}) {
  const limitedQuestions = applyQuestionLimit(questionSet.questions);
  const activeQuestions = state.randomMode ? shuffleArray(limitedQuestions) : limitedQuestions;
  if (!activeQuestions.length) {
    renderEmpty(options.emptyMessage || "当前题库没有可用题目。");
    return;
  }

  state.activeSetId = questionSet.id;
  state.activeSetTitle = questionSet.title;
  state.customSet = options.preserveForRestart ? questionSet : null;
  state.questions = activeQuestions;
  state.index = 0;
  state.score = 0;
  state.answered = false;
  state.wrongQuestions = [];
  state.wrongBookRecords = [];
  syncQuizActiveState();
  syncActiveCard();
  syncLimitButtons();
  quizSubtitle.textContent = buildQuizSubtitle(questionSet.title, questionSet.description, questionSet.questions.length);
  renderQuestion();
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
  document.querySelector("#favorite-question")?.addEventListener("click", toggleCurrentFavorite);
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
    syncPracticeSettingsSummary();
    if (state.questions.length && !state.answered) renderQuestion();
  });
}

function bindPracticeSettings() {
  practiceSettingsToggle.addEventListener("click", () => {
    const expanded = practiceSettingsToggle.getAttribute("aria-expanded") === "true";
    setPracticeSettingsExpanded(!expanded);
  });
  syncPracticeSettingsSummary();
}

function setPracticeSettingsExpanded(expanded) {
  window.clearTimeout(practiceSettingsCloseTimer);
  practiceSettingsToggle.setAttribute("aria-expanded", String(expanded));
  practiceSettingsPanel.setAttribute("aria-hidden", String(!expanded));

  if (prefersReducedMotion()) {
    practiceSettingsPanel.classList.toggle("is-open", expanded);
    practiceSettingsPanel.hidden = !expanded;
    return;
  }

  if (expanded) {
    practiceSettingsPanel.hidden = false;
    window.requestAnimationFrame(() => {
      if (practiceSettingsToggle.getAttribute("aria-expanded") === "true") {
        practiceSettingsPanel.classList.add("is-open");
      }
    });
    return;
  }

  practiceSettingsPanel.classList.remove("is-open");
  const hidePanel = (event) => {
    if (event.target !== practiceSettingsPanel || event.propertyName !== "grid-template-rows") return;
    if (practiceSettingsToggle.getAttribute("aria-expanded") === "true") return;
    practiceSettingsPanel.hidden = true;
    practiceSettingsPanel.removeEventListener("transitionend", hidePanel);
  };
  practiceSettingsPanel.addEventListener("transitionend", hidePanel);
  practiceSettingsCloseTimer = window.setTimeout(() => {
    if (practiceSettingsToggle.getAttribute("aria-expanded") !== "true") practiceSettingsPanel.hidden = true;
    practiceSettingsPanel.removeEventListener("transitionend", hidePanel);
  }, 260);
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
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
  else { state.wrongQuestions.push(question); state.wrongBookRecords.push(createWrongBookRecord(question, getActiveSetTitle())); }

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
  const html = [
    `<div class="result-box" data-state="${isCorrect ? "correct" : "wrong"}">`,
    `<h4 class="result-title">${isCorrect ? "回答正确" : "回答错误"}</h4>`,
    `<p class="result-answer">你的答案：${renderUserAnswer(question, isCorrect, userAnswer, normalizedAnswer)}</p>`,
    `<p class="result-answer">标准答案：${escapeHtml(formatAnswerDisplay(question, question.answer))}</p>`,
    "</div>"
  ].join("");

  transitionQuizRootHeight(() => {
    resultArea.innerHTML = html;
  });
}

function renderUserAnswer(question, isCorrect, userAnswer, normalizedAnswer) {
  if (question.type !== "short") {
    return escapeHtml(formatAnswerDisplay(question, normalizedAnswer));
  }

  return isCorrect ? escapeHtml(formatAnswerDisplay(question, userAnswer)) : formatShortAnswerDiff(userAnswer, question.answer);
}

function renderSummary() {
  const total = state.questions.length;
  const wrong = total - state.score;
  const percent = total ? Math.round((state.score / total) * 100) : 0;

  const html = [
    '<div class="summary-box">',
    '<span class="question-type">练习完成</span>',
    '<h3 class="question-title">本套题已经做完</h3>',
    '<div class="summary-grid">',
    summaryCell(total, "总题数"),
    summaryCell(state.score, "答对"),
    summaryCell(wrong, "答错"),
    summaryCell(`${percent}%`, "得分率"),
    "</div>",
    renderWrongBook(state.wrongBookRecords),
    '<div class="action-row summary-actions">',
    '<button id="restart-set" class="button" type="button">重新开始</button>',
    `<button id="retry-wrong" class="ghost-button" type="button"${wrong ? "" : " disabled"}>重答错题</button>`,
    '<button id="back-from-summary" class="ghost-button" type="button">返回题库列表</button>',
    "</div>",
    "</div>"
  ].join("");

  renderQuizContent(html, () => {
    document.querySelector("#restart-set").addEventListener("click", restartCurrentSet);
    document.querySelector("#retry-wrong").addEventListener("click", retryWrongQuestions);
    document.querySelector("#back-from-summary").addEventListener("click", resetToSetList);
    bindWrongBookActions(state.wrongBookRecords);
  });
}

function renderEmpty(message) {
  renderQuizContent([
    '<div class="empty-state">',
    `<p class="helper">${escapeHtml(message)}</p>`,
    "</div>"
  ].join(""));
}

function renderQuizContent(html, afterRender = () => {}) {
  cleanupActiveQuizTransitions();

  const startHeight = quizRoot.getBoundingClientRect().height;
  const previousBlockHeights = captureQuizBlockHeights();
  const exitLayer = createQuizExitLayer(startHeight);

  if (prefersReducedMotion()) {
    quizRoot.classList.remove("is-resizing", "is-entering");
    quizRoot.style.height = "";
    quizRoot.innerHTML = html;
    afterRender();
    return;
  }

  quizRoot.classList.add("is-resizing", "is-entering");
  quizRoot.style.height = `${startHeight}px`;
  void quizRoot.offsetHeight;

  quizRoot.innerHTML = html;
  afterRender();

  const naturalState = measureQuizNaturalState(startHeight);
  const endHeight = naturalState.height;
  const nextBlockHeights = naturalState.blockHeights;
  if (exitLayer && startHeight > endHeight + 1) mountQuizExitLayer(exitLayer);
  animateQuizBlocksFrom(previousBlockHeights, nextBlockHeights);

  const finishTransition = (event) => {
    if (event && (event.target !== quizRoot || event.propertyName !== "height")) return;
    cleanupTransition();
  };
  const cleanupTransition = () => {
    window.clearTimeout(fallbackTimer);
    quizRoot.removeEventListener("transitionend", finishTransition);
    quizRoot.classList.remove("is-resizing", "is-entering");
    quizRoot.style.height = "";
    if (quizExitLayerCleanup) quizExitLayerCleanup();
    quizContentTransitionCleanup = null;
  };
  const fallbackTimer = window.setTimeout(cleanupTransition, quizResizeFallbackMs);

  quizContentTransitionCleanup = cleanupTransition;
  quizRoot.addEventListener("transitionend", finishTransition);
  window.requestAnimationFrame(() => {
    quizRoot.style.height = `${endHeight}px`;
  });
}

function cleanupActiveQuizTransitions() {
  if (quizContentTransitionCleanup) quizContentTransitionCleanup();
  if (quizBlockTransitionCleanup) quizBlockTransitionCleanup();
  if (quizExitLayerCleanup) quizExitLayerCleanup();
}

function captureQuizBlockHeights() {
  return quizBlockTransitionSelectors.map((selector) => {
    const element = quizRoot.querySelector(selector);
    return element ? [selector, element.getBoundingClientRect().height] : null;
  }).filter(Boolean);
}

function measureQuizNaturalState(startHeight) {
  const previousTransition = quizRoot.style.transition;
  quizRoot.style.transition = "none";
  quizRoot.style.height = "auto";
  const height = quizRoot.getBoundingClientRect().height;
  const blockHeights = captureQuizBlockHeights();
  quizRoot.style.height = `${startHeight}px`;
  void quizRoot.offsetHeight;
  quizRoot.style.transition = previousTransition;
  return { height, blockHeights };
}

function createQuizExitLayer(height) {
  if (height <= 1 || !quizRoot.children.length || prefersReducedMotion()) return null;

  const layer = document.createElement("div");
  layer.className = "quiz-exit-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("inert", "");
  layer.style.height = `${height}px`;

  Array.from(quizRoot.children).forEach((child) => {
    const clone = child.cloneNode(true);
    sanitizeQuizExitClone(clone);
    layer.appendChild(clone);
  });

  return layer.childElementCount ? layer : null;
}

function sanitizeQuizExitClone(root) {
  [root, ...root.querySelectorAll("[id], [name], [for], [tabindex], [autofocus]")].forEach((element) => {
    element.removeAttribute("id");
    element.removeAttribute("name");
    element.removeAttribute("for");
    element.removeAttribute("tabindex");
    element.removeAttribute("autofocus");
  });
}

function mountQuizExitLayer(layer) {
  if (quizExitLayerCleanup) quizExitLayerCleanup();
  quizRoot.appendChild(layer);

  const cleanup = () => {
    layer.remove();
    if (quizExitLayerCleanup === cleanup) quizExitLayerCleanup = null;
  };
  quizExitLayerCleanup = cleanup;

  window.requestAnimationFrame(() => {
    if (layer.isConnected) layer.classList.add("is-leaving");
  });
}

function animateQuizBlocksFrom(previousBlockHeights, nextBlockHeights) {
  if (quizBlockTransitionCleanup) quizBlockTransitionCleanup();
  if (prefersReducedMotion()) return;

  const previousHeightBySelector = new Map(previousBlockHeights);
  const nextHeightBySelector = new Map(nextBlockHeights);
  const animatedItems = quizBlockTransitionSelectors.map((selector) => {
    const previousHeight = previousHeightBySelector.get(selector);
    const nextHeight = nextHeightBySelector.get(selector);
    const element = quizRoot.querySelector(selector);
    if (!element || typeof previousHeight !== "number" || typeof nextHeight !== "number") return null;
    if (Math.abs(nextHeight - previousHeight) < 1) return null;

    element.classList.add("is-block-resizing");
    element.style.height = `${previousHeight}px`;
    element.style.overflow = "hidden";
    return { element, nextHeight };
  }).filter(Boolean);

  if (!animatedItems.length) return;

  void quizRoot.offsetHeight;
  let completedCount = 0;
  const cleanup = () => {
    window.clearTimeout(fallbackTimer);
    animatedItems.forEach(({ element }) => {
      element.removeEventListener("transitionend", onTransitionEnd);
      element.classList.remove("is-block-resizing");
      element.style.height = "";
      element.style.overflow = "";
    });
    quizBlockTransitionCleanup = null;
  };
  const onTransitionEnd = (event) => {
    if (event.propertyName !== "height") return;
    if (!animatedItems.some(({ element }) => element === event.target)) return;
    completedCount += 1;
    if (completedCount >= animatedItems.length) cleanup();
  };
  const fallbackTimer = window.setTimeout(cleanup, quizResizeFallbackMs);

  quizBlockTransitionCleanup = cleanup;
  animatedItems.forEach(({ element }) => element.addEventListener("transitionend", onTransitionEnd));
  window.requestAnimationFrame(() => {
    animatedItems.forEach(({ element, nextHeight }) => {
      element.style.height = `${nextHeight}px`;
    });
  });
}

function transitionQuizRootHeight(updateContent) {
  cleanupActiveQuizTransitions();
  const startHeight = quizRoot.getBoundingClientRect().height;

  if (prefersReducedMotion()) {
    quizRoot.classList.remove("is-resizing", "is-entering");
    quizRoot.style.height = "";
    updateContent();
    quizRoot.classList.remove("is-entering");
    return;
  }

  quizRoot.classList.add("is-resizing");
  quizRoot.style.height = `${startHeight}px`;
  void quizRoot.offsetHeight;
  updateContent();
  const endHeight = quizRoot.scrollHeight;
  const finishTransition = (event) => {
    if (event && (event.target !== quizRoot || event.propertyName !== "height")) return;
    cleanupTransition();
  };
  const cleanupTransition = () => {
    window.clearTimeout(fallbackTimer);
    quizRoot.removeEventListener("transitionend", finishTransition);
    quizRoot.classList.remove("is-resizing", "is-entering");
    quizRoot.style.height = "";
    quizContentTransitionCleanup = null;
  };
  const fallbackTimer = window.setTimeout(cleanupTransition, quizResizeFallbackMs);

  quizContentTransitionCleanup = cleanupTransition;
  quizRoot.addEventListener("transitionend", finishTransition);
  window.requestAnimationFrame(() => {
    quizRoot.style.height = `${endHeight}px`;
  });
}

function renderQuestionTitle(question) {
  return state.hideQuestion
    ? '<p class="hidden-question-note">题目已隐藏，可以直接默写答案。</p>'
    : `<h3 class="question-title">${escapeHtml(question.title)}</h3>`;
}

function renderQuestionHeading(question) {
  const active = isQuestionFavorite(question, getFavoriteContext(question));
  return [
    '<div class="question-heading">',
    renderQuestionTitle(question),
    `<button id="favorite-question" class="favorite-button${active ? " active" : ""}" type="button" aria-pressed="${active}">${active ? "★ 已重点" : "☆ 标为重点"}</button>`,
    "</div>"
  ].join("");
}

function toggleCurrentFavorite() {
  const question = state.questions[state.index];
  if (!question) return;

  const result = toggleQuestionFavorite(question, getFavoriteContext(question));
  syncFavoriteButton(result.active);
  renderSetList();
  syncActiveCard();
}

function syncFavoriteButton(active) {
  const button = document.querySelector("#favorite-question");
  if (!button) return;
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", String(active));
  button.textContent = active ? "★ 已重点" : "☆ 标为重点";
}

function summaryCell(value, label) {
  return `<div><strong>${value}</strong><span>${label}</span></div>`;
}

function restartCurrentSet() {
  if (!state.activeSetId) return;
  if (state.activeSetId === FAVORITE_SET_ID) {
    startFavoriteQuiz();
    return;
  }
  if (state.customSet?.id === state.activeSetId) {
    startCustomQuiz(state.customSet);
    return;
  }
  selectSet(state.activeSetId).catch((error) => renderEmpty(`题库加载失败：${error.message}`));
}

function retryWrongQuestions() {
  if (!state.wrongQuestions.length) return;

  state.questions = state.wrongQuestions;
  state.index = 0;
  state.score = 0;
  state.answered = false;
  state.wrongQuestions = [];
  state.wrongBookRecords = [];
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
  state.activeSetTitle = "";
  state.customSet = null;
  state.questions = [];
  state.index = 0;
  state.score = 0;
  state.answered = false;
  state.wrongQuestions = [];
  state.wrongBookRecords = [];
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
  syncPracticeSettingsSummary();
}

function syncLimitButtons() {
  limitInput.disabled = false;
  document.querySelector("#clear-limit").classList.toggle("active", state.questionLimit === null);
  limitInput.value = "";
  syncPracticeSettingsSummary();
}

function syncPracticeSettingsSummary() {
  const modeLabel = state.randomMode ? "随机出题" : "顺序出题";
  const limitLabel = formatQuestionLimitLabel(state.questionLimit);
  const questionLabel = state.hideQuestion ? "隐藏题目" : "显示题目";
  practiceSettingsSummary.textContent = `${modeLabel} · ${limitLabel} · ${questionLabel}`;
}

function syncQuizActiveState() { page.classList.toggle("quiz-active", Boolean(state.activeSetId || state.questions.length)); }

function getActiveSetTitle() { return state.activeSetTitle || state.manifest.find((item) => item.id === state.activeSetId)?.title || state.activeSetId || "自定义题库"; }

function getFavoriteContext(question) {
  return {
    setId: question?.favoriteMeta?.setId || state.activeSetId,
    setTitle: question?.favoriteMeta?.setTitle || getActiveSetTitle()
  };
}

function applyQuestionLimit(questions) {
  const range = getQuestionLimitRange(state.questionLimit, questions.length);
  if (!range) return questions;
  return questions.slice(range.start - 1, range.end);
}

function buildIdleSubtitle() {
  const limitLabel = formatQuestionLimitLabel(state.questionLimit);
  const modeLabel = state.randomMode ? "随机出题" : "顺序出题";
  return `${state.privateMode ? "隐藏入口已开启。" : ""}先从左侧选择一个题库开始。当前为${modeLabel}，${limitLabel}。`;
}

function buildQuizSubtitle(title, description, total) {
  const limitLabel = state.questionLimit ? formatQuestionLimitLabel(state.questionLimit, total) : `共 ${state.questions.length} 题`;
  const modeLabel = state.randomMode ? "随机出题" : "顺序出题";
  return `${title} · ${description} · ${modeLabel} · ${limitLabel}`;
}
