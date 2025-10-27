// Theme toggle (Dark / Light)
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  const apply = (mode) => {
    const isDark = mode === "dark";
    document.body.classList.toggle("dark", isDark);
    btn.textContent = isDark ? "☀️" : "🌙";
    btn.setAttribute(
      "aria-label",
      isDark ? "Comută modul luminos" : "Comută modul întunecat"
    );
  };

  // Load preference
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") {
    apply(saved);
  } else {
    // Optional: follow system preference initially
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    apply(prefersDark ? "dark" : "light");
  }

  // Toggle on click
  btn.addEventListener("click", () => {
    const nowDark = !document.body.classList.contains("dark");
    const mode = nowDark ? "dark" : "light";
    apply(mode);
    localStorage.setItem("theme", mode);
  });
});
