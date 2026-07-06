import { escapeHtml, formatAnswerDisplay, getTypeLabel } from "./quiz-data.js";

const wrongBookHeaders = ["题库", "题号", "题型", "题目", "选项", "标准答案"];

export function createWrongBookRecord(question, setTitle) {
  return {
    setTitle,
    id: question.id || "",
    typeLabel: getTypeLabel(question.type),
    title: question.title,
    options: formatOptions(question),
    answer: formatAnswerDisplay(question, question.answer)
  };
}

export function renderWrongBook(records) {
  if (!records.length) return "";

  return [
    '<section class="wrong-book" aria-labelledby="wrong-book-title">',
    '<div class="wrong-book-heading">',
    '<div>',
    '<h4 id="wrong-book-title">本轮错题本</h4>',
    `<p>共 ${records.length} 题，可复制或下载 CSV。</p>`,
    "</div>",
    '<div class="wrong-book-actions">',
    '<button id="toggle-wrong-book" class="ghost-button" type="button" aria-expanded="false" aria-controls="wrong-book-list">展开错题</button>',
    '<button id="copy-wrong-book" class="ghost-button" type="button">复制CSV</button>',
    '<button id="download-wrong-book" class="ghost-button" type="button">下载CSV</button>',
    "</div>",
    "</div>",
    '<p id="wrong-book-status" class="wrong-book-status" aria-live="polite"></p>',
    `<div id="wrong-book-list" class="wrong-book-list" hidden>${records.map(renderWrongBookItem).join("")}</div>`,
    "</section>"
  ].join("");
}

export function bindWrongBookActions(records) {
  document.querySelector("#toggle-wrong-book")?.addEventListener("click", toggleWrongBookList);
  document.querySelector("#copy-wrong-book")?.addEventListener("click", async () => {
    try {
      await copyWrongBookCsv(records);
      setWrongBookStatus("CSV 已复制。");
    } catch {
      setWrongBookStatus("复制失败，请尝试下载 CSV。");
    }
  });
  document.querySelector("#download-wrong-book")?.addEventListener("click", () => {
    downloadWrongBookCsv(records);
    setWrongBookStatus("CSV 已开始下载。");
  });
}

function toggleWrongBookList(event) {
  const button = event.currentTarget;
  const list = document.querySelector("#wrong-book-list");
  if (!list) return;

  const nextExpanded = list.hidden;
  list.hidden = !nextExpanded;
  button.setAttribute("aria-expanded", String(nextExpanded));
  button.textContent = nextExpanded ? "收起错题" : "展开错题";
}

function renderWrongBookItem(record, index) {
  return [
    '<article class="wrong-book-item">',
    `<strong>${index + 1}. ${escapeHtml(record.title)}</strong>`,
    `<p>题库：${escapeHtml(record.setTitle)} · 题号：${escapeHtml(record.id || "-")} · ${escapeHtml(record.typeLabel)}</p>`,
    record.options ? `<p>选项：${escapeHtml(record.options)}</p>` : "",
    `<p>标准答案：${escapeHtml(record.answer)}</p>`,
    "</article>"
  ].join("");
}

function formatOptions(question) {
  if (!question.options?.length) return "";
  return question.options.map((option) => `${option.displayKey || option.key}. ${option.text}`).join("\n");
}

function buildWrongBookCsv(records) {
  const rows = records.map((record) => [record.setTitle, record.id, record.typeLabel, record.title, record.options, record.answer]);
  return [wrongBookHeaders, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

async function copyWrongBookCsv(records) {
  const csv = buildWrongBookCsv(records);
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(csv);
      return;
    } catch {}
  }
  copyWithTextarea(csv);
}

function downloadWrongBookCsv(records) {
  const blob = new Blob(["\ufeff", buildWrongBookCsv(records)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `错题本-${buildTimestamp()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function copyWithTextarea(value) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("COPY_FAILED");
}

function escapeCsvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function buildTimestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function setWrongBookStatus(message) {
  const status = document.querySelector("#wrong-book-status");
  if (status) status.textContent = message;
}
