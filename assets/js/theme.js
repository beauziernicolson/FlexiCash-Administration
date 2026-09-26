export function initTheme() {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.dataset.themePreference = "light";
  document.documentElement.style.colorScheme = "light";
  return "light";
}

export function setTheme() {
  return initTheme();
}

export function toggleTheme() {
  return initTheme();
}

initTheme();
