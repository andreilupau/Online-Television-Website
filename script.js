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
      isDark ? "Toggle light mode" : "Toggle dark mode"
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

  // Contact form handling (Formspree or mailto fallback)
  const form = document.getElementById("contact-form");
  if (form) {
    const statusEl = document.getElementById("form-status");
    const endpoint = form.getAttribute("data-endpoint");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (statusEl) {
        statusEl.textContent = "Sending...";
        statusEl.className = "form-status info";
      }
      const data = new FormData(form);
      try {
        // If endpoint not configured, open default mail client as fallback
        if (!endpoint || endpoint.includes("REPLACE_FORM_ID")) {
          const name = (data.get("name") || "").toString();
          const email = (data.get("email") || "").toString();
          const message = (data.get("message") || "").toString();
          const subject = `Website contact from ${name}`;
          const body = `${message}\n\nFrom: ${name} <${email}>`;
          window.location.href = `mailto:lupauandrei27@gmail.com?subject=${encodeURIComponent(
            subject
          )}&body=${encodeURIComponent(body)}`;
          if (statusEl) {
            statusEl.textContent = "Opening your email client...";
            statusEl.className = "form-status info";
          }
          return;
        }
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: data,
        });
        if (res.ok) {
          if (statusEl) {
            statusEl.textContent = "Thank you! Your message was sent.";
            statusEl.className = "form-status success";
          }
          form.reset();
        } else {
          if (statusEl) {
            statusEl.textContent =
              "Could not send. Please try again or email me directly at lupauandrei27@gmail.com";
            statusEl.className = "form-status error";
          }
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent =
            "Network error. Please try again later or email me at lupauandrei27@gmail.com";
          statusEl.className = "form-status error";
        }
      }
    });
  }
});
