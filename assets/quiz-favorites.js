import { normalizeShortAnswer } from "./quiz-data.js";

export const FAVORITE_SET_ID = "__favorites__";

const storageKey = "quizFavorites:v1";

export function getFavoriteCount() {
  return readFavorites().length;
}

export function buildFavoriteSet() {
  const favorites = readFavorites();
  return {
    id: FAVORITE_SET_ID,
    title: "重点题练习",
    description: "浏览器本地保存",
    questions: favorites.map((item) => item.question)
  };
}

export function isQuestionFavorite(question, context) {
  const key = createFavoriteKey(question, context);
  return readFavorites().some((item) => item.key === key);
}

export function toggleQuestionFavorite(question, context) {
  const key = createFavoriteKey(question, context);
  const favorites = readFavorites();
  const existingIndex = favorites.findIndex((item) => item.key === key);

  if (existingIndex >= 0) {
    favorites.splice(existingIndex, 1);
    writeFavorites(favorites);
    return { active: false, count: favorites.length };
  }

  favorites.unshift({
    key,
    savedAt: new Date().toISOString(),
    question: createQuestionSnapshot(question, context, key)
  });
  writeFavorites(favorites);
  return { active: true, count: favorites.length };
}

function createQuestionSnapshot(question, context, key) {
  const type = question.type || "short";
  const answer = String(question.answer || "");
  return {
    id: String(question.id || ""),
    set: context.setId || question.set || "",
    title: String(question.title || ""),
    type,
    options: Array.isArray(question.options)
      ? question.options.map((option) => ({ key: String(option.key || ""), text: String(option.text || "") }))
      : [],
    answer,
    answerKey: type === "short" ? normalizeShortAnswer(answer) : answer,
    favoriteKey: key,
    favoriteMeta: {
      setId: context.setId || question.set || "",
      setTitle: context.setTitle || ""
    }
  };
}

function createFavoriteKey(question, context = {}) {
  if (question.favoriteKey) return question.favoriteKey;
  const setPart = context.setId || question.favoriteMeta?.setId || question.set || context.setTitle || "custom";
  const idPart = question.id || "";
  return `${setPart}::${idPart}::${question.title || ""}`;
}

function readFavorites() {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.key && item?.question?.title) : [];
  } catch {
    return [];
  }
}

function writeFavorites(favorites) {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(storageKey, JSON.stringify(favorites));
  } catch {}
}

function getStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}
