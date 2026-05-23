export function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(current);
      current = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  if (current || row.length) {
    row.push(current);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }

  const [headerRow, ...bodyRows] = rows;
  const headers = headerRow.map((item) => item.trim());

  return bodyRows.map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ? cells[index].trim() : "";
    });
    return record;
  });
}

export function normalizeQuestion(row) {
  const type = row.type.trim();
  const answer = row.answer.trim();
  let options = [];

  if (type === "judge") {
    options = [
      { key: "对", text: "对" },
      { key: "错", text: "错" }
    ];
  } else if (type !== "short") {
    options = row.options.split("|").map(parseOption).filter(Boolean);
  }

  return {
    ...row,
    type,
    options,
    answer,
    answerKey: type === "short" ? normalizeShortAnswer(answer) : answer
  };
}

export function getTypeLabel(type) {
  return {
    single: "单选题",
    multiple: "多选题",
    judge: "判断题",
    short: "简答题"
  }[type] || "题目";
}

export function formatAnswerDisplay(question, answer) {
  if (!answer) return "未作答";
  if (question.type === "short") return answer;
  if (question.type === "multiple") {
    return answer.split(",").map((key) => formatOptionLabel(question, key)).join(" / ");
  }
  return formatOptionLabel(question, answer);
}

export function normalizeShortAnswer(value) {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

export function shuffleArray(items) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseOption(rawOption) {
  const option = rawOption.trim();
  if (!option) return null;

  const dotIndex = option.indexOf(".");
  if (dotIndex === -1) {
    return { key: option, text: option };
  }

  return {
    key: option.slice(0, dotIndex).trim(),
    text: option.slice(dotIndex + 1).trim()
  };
}

function formatOptionLabel(question, key) {
  const option = question.options.find((item) => item.key === key);
  if (!option) return key;
  return `${option.key} ${option.text}`;
}
