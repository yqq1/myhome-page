const THEME_KEY = "yq-theme";

initThemeToggle();

function initThemeToggle() {
  syncThemeButtons();
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(getCurrentTheme() === "dark" ? "light" : "dark", true);
    });
  });
}

function getCurrentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme, persist) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }

  syncThemeButtons();
}

function syncThemeButtons() {
  const isDark = getCurrentTheme() === "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.textContent = isDark ? "浅色模式" : "暗色模式";
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute("aria-label", isDark ? "切换到浅色模式" : "切换到暗色模式");
  });
}
