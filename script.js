// Theme toggle (Dark / Light)
document.addEventListener("DOMContentLoaded", () => {
  // On every page load, immediately cancel any prior speech from previous pages/tabs in this tab
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
  }

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

// ---------------- Voice Read Aloud Feature ----------------
document.addEventListener("DOMContentLoaded", () => {
  if (!("speechSynthesis" in window)) {
    return; // Browser unsupported; silently skip.
  }

  const article = document.querySelector(".article-content");
  const meta = document.querySelector(".article-header .article-meta");
  // Only inject on real article pages: need meta, title, and at least one paragraph in the article.
  const titleProbe = document.querySelector(".article-title");
  const hasTextContent =
    article && article.querySelector("p, h2, blockquote, li, figcaption");
  if (!article || !meta || !titleProbe || !hasTextContent) return;

  // Create button
  const voiceBtn = document.createElement("button");
  voiceBtn.id = "voice-read";
  voiceBtn.type = "button";
  voiceBtn.className = "voice-read-btn";
  voiceBtn.textContent = "▶ Read Aloud";
  voiceBtn.setAttribute("aria-label", "Read article aloud");
  meta.appendChild(voiceBtn);

  // Status live region (for accessibility)
  const status = document.createElement("div");
  status.className = "voice-read-status";
  status.setAttribute("aria-live", "polite");
  status.style.position = "absolute";
  status.style.height = "1px";
  status.style.width = "1px";
  status.style.overflow = "hidden";
  status.style.clip = "rect(1px,1px,1px,1px)";
  meta.appendChild(status);

  const synth = window.speechSynthesis;
  let queue = [];
  let index = 0;
  let reading = false;
  let paused = false;
  let currentUtterance = null;
  let elementMap = []; // [{el, chunks, chunkIndex}]
  let elementPointer = 0;
  let targetLang = null; // e.g., 'en-US' or 'ro-RO'
  // Track any deferred starts so we can cancel instantly on pause
  let pendingSpeakTimeout = null;
  let pendingVoicesHandler = null;
  // Prevent skipping to next chunk when user pauses/cancels mid-utterance
  let suppressAdvance = false;
  let canceledIndex = -1;
  // Resume within the same chunk
  let resumeOffset = 0; // char index within current queue[index]
  let currentBaseOffset = 0; // offset applied to current utterance text slice

  function detectLang() {
    // Priority 1: explicit lang attribute
    const docLang = (document.documentElement.lang || "").trim();
    if (/^ro(-|$)/i.test(docLang)) return "ro-RO";
    if (/^en(-|$)/i.test(docLang)) return "en-US";

    // Priority 2: simple heuristic on article text (sample title + first two paragraphs)
    const sampleEls = [];
    const titleEl = document.querySelector(".article-title");
    if (titleEl) sampleEls.push(titleEl);
    const paras = article.querySelectorAll("p");
    for (let i = 0; i < Math.min(2, paras.length); i++)
      sampleEls.push(paras[i]);
    const sampleText = sampleEls
      .map((n) => (n.textContent || "").trim())
      .join(" \n ")
      .toLowerCase();
    const roMarks = /[ăâîșşțţ]/i.test(sampleText);
    const roWords =
      /( și | sunt | este | în | că | pentru | dintre | asupra | care | acest| această| aceste | cum | încă | după )/i.test(
        " " + sampleText + " "
      );
    if (roMarks || roWords) return "ro-RO";
    return "en-US";
  }

  function pickVoice(langPref) {
    const lang = (
      langPref ||
      targetLang ||
      detectLang() ||
      "en-US"
    ).toLowerCase();
    const voices = synth.getVoices();
    if (!voices || !voices.length) return null;
    // Preferred female voice name candidates (heuristic, varies by OS / engine)
    const preferredNames = [
      "Zira",
      "Samantha",
      "Google US English",
      "Google UK English Female",
      "Microsoft Zira",
      "Microsoft Zira Desktop",
      "Jenny",
      "Sara",
      "Nova",
      "Aria",
      "Female",
    ];
    // Filter by language first
    let langVoices = voices.filter(
      (v) => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2))
    );
    // Attempt match by name containing any preferred token
    for (const token of preferredNames) {
      const match = langVoices.find((v) =>
        v.name.toLowerCase().includes(token.toLowerCase())
      );
      if (match) return match;
    }
    const female = langVoices.find((v) => /female/i.test(v.name));
    if (female) return female;
    // General English female fallback
    const anyEnFemale = voices.find((v) => /female/i.test(v.name));
    if (anyEnFemale) return anyEnFemale;
    // Last resort: first language-matched, else first overall
    return langVoices[0] || voices[0];
  }

  function chunkText(text, size = 220) {
    const parts = [];
    let remaining = text.trim();
    while (remaining.length > size) {
      // Try to split at last period or space before limit
      let slice = remaining.slice(0, size);
      const pivot = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(" "));
      if (pivot > 80) {
        parts.push(remaining.slice(0, pivot + 1).trim());
        remaining = remaining.slice(pivot + 1).trim();
      } else {
        parts.push(slice.trim());
        remaining = remaining.slice(size).trim();
      }
    }
    if (remaining) parts.push(remaining);
    return parts;
  }

  function buildQueue() {
    elementMap = [];
    const collect = [];
    const titleEl = document.querySelector(".article-title");
    const dekEl = document.querySelector(".article-dek");
    if (titleEl) collect.push(titleEl);
    if (dekEl) collect.push(dekEl);
    // Include more semantic content inside the article only
    article
      .querySelectorAll("h2, blockquote, p, li, figcaption")
      .forEach((el) => {
        if (el.closest(".article-tags")) return;
        if (el.classList.contains("source-note")) return;
        collect.push(el);
      });
    const sourceNote = article.querySelector(".source-note");
    if (sourceNote) collect.push(sourceNote);
    collect.forEach((el) => {
      const text = el.textContent.trim();
      if (!text) return;
      const chunks = chunkText(text);
      elementMap.push({ el, chunks, chunkIndex: 0 });
    });
    queue = elementMap.flatMap((m) => m.chunks);
    index = 0;
    elementPointer = 0;
  }

  function speakNext() {
    if (!reading || paused) return; // Do not speak if we've been paused/cancelled
    if (index >= queue.length) {
      finalize();
      return;
    }
    const voice = pickVoice();
    const currentIndex = index; // capture for handlers
    const chunk = queue[currentIndex] || "";
    const startAt = currentIndex === index ? Math.max(0, resumeOffset) : 0;
    currentBaseOffset = startAt;
    const textToSpeak = chunk.slice(startAt);
    const utter = new SpeechSynthesisUtterance(textToSpeak);
    // Determine and apply language for better pronunciation
    if (!targetLang) targetLang = detectLang();
    utter.lang =
      (voice && voice.lang) ||
      targetLang ||
      document.documentElement.lang ||
      "en-US";
    utter.voice = voice;
    utter.rate = 1.0;
    utter.pitch = 1.0;
    currentUtterance = utter;
    applyHighlight(index);
    // Track boundary (word/sentence) to resume mid-chunk next time
    utter.onboundary = (e) => {
      if (typeof e.charIndex === "number") {
        resumeOffset = currentBaseOffset + e.charIndex;
      }
    };
    utter.onend = (ev) => {
      // If this end was caused by a user pause/cancel, do not advance index
      if (suppressAdvance && paused && currentIndex === index) {
        suppressAdvance = false;
        canceledIndex = -1;
        // Keep resumeOffset where boundary last reported
        return;
      }
      // Finished current chunk
      resumeOffset = 0;
      index = Math.max(index, currentIndex + 1);
      if (reading && !paused) {
        speakNext();
      }
    };
    utter.onerror = (ev) => {
      // Some engines fire error with 'canceled' on cancel; honor suppression in that case too
      if (suppressAdvance && currentIndex === index) {
        suppressAdvance = false;
        canceledIndex = -1;
        // Keep resumeOffset where boundary last reported
        return;
      }
      resumeOffset = 0;
      index = Math.max(index, currentIndex + 1);
      if (reading && !paused) speakNext();
    };
    synth.speak(utter);
    status.textContent =
      "Reading segment " + (index + 1) + " of " + queue.length;
  }

  function startReading() {
    buildQueue();
    reading = true;
    paused = false;
    targetLang = detectLang();
    resumeOffset = 0;
    voiceBtn.textContent = "⏸ Pause";
    voiceBtn.setAttribute("aria-label", "Pause reading");
    status.textContent = "Started reading article";
    // Flush any leftover utterances queued by other pages before speaking
    try {
      synth.cancel();
    } catch (_) {}
    // If voices are not loaded yet, wait for them before speaking to avoid null/incorrect voices
    const attemptSpeak = () => {
      const available = synth.getVoices();
      if (available && available.length) {
        speakNext();
      } else {
        // Wait briefly or until voiceschanged fires
        let waited = false;
        pendingSpeakTimeout = setTimeout(() => {
          waited = true;
          pendingSpeakTimeout = null;
          speakNext();
        }, 600);
        pendingVoicesHandler = () => {
          if (!waited) {
            if (pendingSpeakTimeout) clearTimeout(pendingSpeakTimeout);
            pendingSpeakTimeout = null;
            speakNext();
          }
          window.speechSynthesis.onvoiceschanged = null;
          pendingVoicesHandler = null;
        };
        window.speechSynthesis.onvoiceschanged = pendingVoicesHandler;
      }
    };
    attemptSpeak();
  }

  function pauseReading() {
    // Hard, immediate stop so no extra syllables play
    try {
      synth.cancel();
    } catch (_) {}
    paused = true; // keep reading=true so we can resume from current index
    suppressAdvance = true; // don't advance to next chunk on this cancel
    canceledIndex = index;
    // Clear any deferred starts
    if (pendingSpeakTimeout) {
      clearTimeout(pendingSpeakTimeout);
      pendingSpeakTimeout = null;
    }
    if (window.speechSynthesis.onvoiceschanged === pendingVoicesHandler) {
      window.speechSynthesis.onvoiceschanged = null;
      pendingVoicesHandler = null;
    }
    voiceBtn.textContent = "▶ Resume";
    voiceBtn.setAttribute("aria-label", "Resume reading");
    status.textContent = "Paused";
  }

  function resumeReading() {
    paused = false;
    // Ensure suppression flags are clear before continuing
    suppressAdvance = false;
    canceledIndex = -1;
    voiceBtn.textContent = "⏸ Pause";
    voiceBtn.setAttribute("aria-label", "Pause reading");
    status.textContent = "Resumed";
    // Start the next utterance from the current index
    speakNext();
  }

  function stopReading() {
    synth.cancel();
    reading = false;
    paused = false;
    currentUtterance = null;
    suppressAdvance = false;
    canceledIndex = -1;
    resumeOffset = 0;
    currentBaseOffset = 0;
    voiceBtn.textContent = "🔁 Replay";
    voiceBtn.setAttribute("aria-label", "Replay article audio");
    status.textContent = "Finished";
  }

  function finalize() {
    stopReading();
  }

  function clearHighlights() {
    elementMap.forEach((m) => m.el.classList.remove("voice-glow"));
  }

  function applyHighlight(globalIndex) {
    // Determine which element this globalIndex belongs to
    let count = 0;
    for (let i = 0; i < elementMap.length; i++) {
      const m = elementMap[i];
      const length = m.chunks.length;
      if (globalIndex >= count && globalIndex < count + length) {
        clearHighlights();
        m.el.classList.add("voice-glow");
        return;
      }
      count += length;
    }
  }

  voiceBtn.addEventListener("click", () => {
    if (!reading) {
      startReading();
    } else if (reading && !paused) {
      pauseReading();
    } else if (reading && paused) {
      resumeReading();
    }
  });

  // Long press (hold >600ms) to stop completely
  let pressTimer = null;
  voiceBtn.addEventListener("mousedown", () => {
    if (!reading) return;
    pressTimer = setTimeout(() => {
      stopReading();
    }, 600);
  });
  ["mouseup", "mouseleave"].forEach((ev) =>
    voiceBtn.addEventListener(ev, () => {
      if (pressTimer) clearTimeout(pressTimer);
    })
  );

  // Rebuild voices if they load asynchronously
  // Keep a lightweight handler to refresh target voice language if user/system changes voices mid-session
  window.speechSynthesis.onvoiceschanged = () => {
    // No immediate action; pickVoice is invoked per utterance and we set utter.lang explicitly.
  };
});

// Ensure immediate stop when leaving the page (navigation to another site/page)
if ("speechSynthesis" in window) {
  const hardCancel = () => {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
  };
  // Fires for bfcache navigations and normal unloads
  window.addEventListener("pagehide", hardCancel);
  // Fallback for older browsers
  window.addEventListener("beforeunload", hardCancel);
  // Stop when tab is hidden (backgrounded) so no carry-over resumes later
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hardCancel();
    }
  });
  // Stop on window blur (user switches apps or windows)
  window.addEventListener("blur", hardCancel);
}

// ---------------- Footer Enhancements (social + back to top + year) ----------------
document.addEventListener("DOMContentLoaded", () => {
  const footer = document.querySelector("footer.site-footer");
  if (!footer) return;
  const inner = footer.querySelector(".footer-inner");
  if (!inner) return;

  // Social links block (if missing)
  if (!inner.querySelector(".footer-social")) {
    const social = document.createElement("div");
    social.className = "footer-social";
    social.setAttribute("aria-label", "Social links");
    social.innerHTML = `
      <a href="https://facebook.com/" target="_blank" rel="noopener" aria-label="Facebook">💬 Facebook</a>
      <a href="https://www.instagram.com/" target="_blank" rel="noopener" aria-label="Instagram">📷 Instagram</a>
      <a href="https://www.youtube.com/" target="_blank" rel="noopener" aria-label="YouTube">▶ YouTube</a>
    `;
    inner.appendChild(social);
  }

  // Update year in footer copy
  const copy = footer.querySelector(".footer-copy");
  if (copy) {
    const year = new Date().getFullYear();
    copy.textContent = `© ${year} CobraNEWS. All rights reserved.`;
  }

  // Back to top button
  let backBtn = document.querySelector(".back-to-top");
  if (!backBtn) {
    backBtn = document.createElement("button");
    backBtn.className = "back-to-top";
    backBtn.type = "button";
    backBtn.textContent = "↑ Top";
    backBtn.setAttribute("aria-label", "Back to top");
    document.body.appendChild(backBtn);
  }

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  function toggleBackToTop() {
    const y = window.scrollY || window.pageYOffset;
    backBtn.style.display = y > 400 ? "inline-flex" : "none";
  }
  window.addEventListener("scroll", toggleBackToTop, { passive: true });
  toggleBackToTop();

  backBtn.addEventListener("click", () => {
    if (prefersReduced) {
      window.scrollTo(0, 0);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
});
