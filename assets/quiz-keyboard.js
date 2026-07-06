export function bindQuizKeyboardShortcuts({ isAnswered, nextQuestion, selectOption, submitAnswer }) {
  document.addEventListener("keydown", (event) => {
    if (event.repeat || isTypingTarget(event.target)) return;

    if (/^[1-9]$/.test(event.key)) {
      if (selectOption(Number(event.key) - 1)) event.preventDefault();
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") return;

    const submitButton = document.querySelector("#submit-answer");
    const nextButton = document.querySelector("#next-question");
    const answered = isAnswered();
    const canAct = answered ? nextButton && !nextButton.disabled : submitButton && !submitButton.disabled;
    if (!canAct) return;

    event.preventDefault();
    answered ? nextQuestion() : submitAnswer();
  });
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const input = target.closest("input");
  if (input?.matches('input[name="answer-option"][type="radio"], input[name="answer-option"][type="checkbox"]')) return false;
  return Boolean(target.closest("input, textarea, button, select, [contenteditable='true']"));
}
