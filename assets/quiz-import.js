import { normalizeQuestion, parseCsv } from "./quiz-data.js";

const standardHeaders = ["id", "set", "title", "type", "options", "answer"];
const wrongBookHeaders = ["题库", "题号", "题型", "题目", "选项", "标准答案"];
const typeMap = {
  "单选题": "single",
  "多选题": "multiple",
  "判断题": "judge",
  "简答题": "short"
};

export function bindCustomImport({ onImport }) {
  const input = document.querySelector("#custom-import-input");
  const status = document.querySelector("#custom-import-status");
  if (!input || !status) return;

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      status.dataset.state = "";
      status.hidden = true;
      const importedSet = await parseImportFile(file);
      onImport(importedSet);
      status.dataset.state = "success";
      status.hidden = false;
      status.textContent = `已导入 ${importedSet.questions.length} 题：${file.name}`;
    } catch (error) {
      status.dataset.state = "error";
      status.hidden = false;
      status.textContent = error.message || "导入失败。";
    } finally {
      input.value = "";
    }
  });
}

async function parseImportFile(file) {
  const rows = parseCsv(await file.text());
  if (!rows.length) throw new Error("CSV 中没有可用题目。");

  const headers = Object.keys(rows[0]);
  const setId = `custom-${Date.now()}`;
  const questions = hasHeaders(headers, standardHeaders)
    ? parseStandardRows(rows, setId)
    : hasHeaders(headers, wrongBookHeaders)
      ? parseWrongBookRows(rows, setId)
      : null;

  if (!questions) throw new Error("未识别 CSV 表头。");
  if (!questions.length) throw new Error("CSV 中没有可用题目。");

  return {
    id: setId,
    title: `自定义题库 · ${file.name}`,
    description: "从本地 CSV 导入",
    questions
  };
}

function parseStandardRows(rows, setId) {
  return rows
    .filter((row) => row.title && row.type && row.answer)
    .map((row, index) => normalizeQuestion({ ...row, id: row.id || String(index + 1), set: setId }));
}

function parseWrongBookRows(rows, setId) {
  return rows
    .filter((row) => row["题目"] && row["题型"] && row["标准答案"])
    .map((row, index) => normalizeQuestion({
      id: row["题号"] || String(index + 1),
      set: setId,
      title: row["题目"],
      type: typeMap[row["题型"]] || "short",
      options: normalizeWrongBookOptions(row["选项"]),
      answer: normalizeWrongBookAnswer(row)
    }));
}

function normalizeWrongBookOptions(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("|");
}

function normalizeWrongBookAnswer(row) {
  const answer = row["标准答案"];
  const type = typeMap[row["题型"]];
  if (type === "short" || !type) return answer;
  if (type === "multiple") return answer.split("/").map(extractAnswerKey).filter(Boolean).join(",");
  return extractAnswerKey(answer);
}

function extractAnswerKey(value) {
  return String(value || "").trim().match(/^[^\s.．、]+/)?.[0] || "";
}

function hasHeaders(actualHeaders, expectedHeaders) {
  return expectedHeaders.every((header) => actualHeaders.includes(header));
}
