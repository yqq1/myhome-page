const THEME_KEY = "yq-theme";
let themeTransitionTimer = 0;

initThemeToggle();

function initThemeToggle() {
  syncThemeButtons();
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      transitionTheme(getCurrentTheme() === "dark" ? "light" : "dark", true);
    });
  });
}

function getCurrentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function transitionTheme(theme, persist) {
  if (shouldReduceMotion()) {
    applyTheme(theme, persist);
    return;
  }

  document.documentElement.classList.add("theme-transitioning");
  window.clearTimeout(themeTransitionTimer);

  if (document.startViewTransition) {
    const transition = document.startViewTransition(() => applyTheme(theme, persist));
    transition.finished.finally(endThemeTransition);
    return;
  }

  applyTheme(theme, persist);
  themeTransitionTimer = window.setTimeout(endThemeTransition, 360);
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

function endThemeTransition() {
  document.documentElement.classList.remove("theme-transitioning");
}

function shouldReduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function syncThemeButtons() {
  const isDark = getCurrentTheme() === "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.textContent = isDark ? "浅色模式" : "暗色模式";
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute("aria-label", isDark ? "切换到浅色模式" : "切换到暗色模式");
  });
}
