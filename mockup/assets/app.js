/*!
 * 20SKIN mockup — app.js
 * 原生 JS、事件委派，無外部相依。負責：
 *   1) 行動版漢堡選單開合（含雙層下拉的子選單展開）
 *   2) FAQ accordion（.c-faq，同時間僅展開一則）
 *   3) 分類 Tab 切換（.c-tabs）
 *   4) 輪播 .c-slider（首頁 hero）
 *   5) AI 諮詢面板 .c-chat（浮動鈕 .c-consult 開闔）
 */
(function () {
  "use strict";

  document.addEventListener("click", function (e) {
    handleHamburger(e);
    handleMobileSubmenu(e);
    handleTabs(e);
  });

  /* -----------------------------------------------------------------
   * 1) 漢堡選單開合
   * ------------------------------------------------------------- */
  function handleHamburger(e) {
    var toggle = e.target.closest("[data-nav-toggle]");
    if (!toggle) return;

    var header = document.querySelector(".c-header");
    if (!header) return;

    var isOpen = header.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    document.body.style.overflow = isOpen ? "hidden" : "";
  }

  /* -----------------------------------------------------------------
   * 2) 行動版：雙層下拉子選單展開／收合
   *    桌機（≥1024px）用 CSS :hover / :focus-within 即可，不需 JS
   * ------------------------------------------------------------- */
  function handleMobileSubmenu(e) {
    if (window.innerWidth > 1024) return;

    var link = e.target.closest(".c-nav__item.has-children > .c-nav__link");
    if (!link) return;

    e.preventDefault();
    var item = link.parentElement;
    var wasExpanded = item.classList.contains("is-expanded");

    // 手風琴式：收合同層其他已展開項目
    var siblings = item.parentElement.children;
    for (var i = 0; i < siblings.length; i++) {
      siblings[i].classList.remove("is-expanded");
    }
    if (!wasExpanded) item.classList.add("is-expanded");
  }

  /* -----------------------------------------------------------------
   * 3) FAQ accordion：同時間僅展開一則（<details> 群組內）
   * ------------------------------------------------------------- */
  document.addEventListener(
    "toggle",
    function (e) {
      var item = e.target;
      if (!item.matches || !item.matches(".c-faq__item") || !item.open) return;

      var group = item.closest(".c-faq");
      if (!group) return;

      var items = group.querySelectorAll(".c-faq__item[open]");
      items.forEach(function (other) {
        if (other !== item) other.removeAttribute("open");
      });
    },
    true
  );

  /* -----------------------------------------------------------------
   * 4) Tab / 篩選列切換（.c-tabs）
   *    結構：.c-tabs > .c-tabs__list > button.c-tabs__btn[data-tab="id"]
   *          .c-tabs__panel[data-tab-panel="id"]
   * ------------------------------------------------------------- */
  function handleTabs(e) {
    var btn = e.target.closest(".c-tabs__btn");
    if (!btn) return;

    var tabs = btn.closest(".c-tabs");
    if (!tabs) return;

    var targetId = btn.getAttribute("data-tab");

    tabs.querySelectorAll(".c-tabs__btn").forEach(function (b) {
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });
    tabs.querySelectorAll(".c-tabs__panel").forEach(function (panel) {
      var match = panel.getAttribute("data-tab-panel") === targetId;
      panel.hidden = !match;
    });
  }

  /* -----------------------------------------------------------------
   * 5) 輪播 .c-slider
   *    結構：[data-slider] > .c-slider__viewport > .c-slider__slide
   *                       > .c-slider__foot > .c-slider__dots > button[role=tab]
   *                                          > [data-slider-caption]
   *
   *    設計取捨：
   *    - 淡入淡出而非位移，避免促銷感（樣式在 base.css，這裡只切 class）
   *    - 尊重 prefers-reduced-motion：不自動播放，但指示器仍可手動切換
   *    - hover／鍵盤 focus 進到輪播內就暫停，離開才恢復
   *    - 分頁切到背景時停掉計時器，回來再啟動（省電，也避免一次補跳多張）
   * ------------------------------------------------------------- */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.querySelectorAll("[data-slider]").forEach(initSlider);

  function initSlider(root) {
    var slides = Array.prototype.slice.call(root.querySelectorAll(".c-slider__slide"));
    var dots = Array.prototype.slice.call(root.querySelectorAll(".c-slider__dot"));
    var caption = root.querySelector("[data-slider-caption]");
    if (slides.length < 2) return;

    var interval = parseInt(root.getAttribute("data-slider-interval"), 10) || 5000;
    var index = Math.max(0, slides.findIndex(function (s) { return s.classList.contains("is-active"); }));
    var timer = null;
    var paused = false;

    function show(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach(function (slide, i) {
        slide.classList.toggle("is-active", i === index);
        // 非當前投影片對輔助技術隱藏，避免讀屏機一次唸出四張的 alt
        slide.setAttribute("aria-hidden", i === index ? "false" : "true");
      });
      dots.forEach(function (dot, i) {
        dot.setAttribute("aria-selected", i === index ? "true" : "false");
      });
      if (caption) {
        caption.textContent = slides[index].getAttribute("data-slide-caption") || "";
      }
    }

    function start() {
      if (timer || paused || reduceMotion.matches || document.hidden) return;
      timer = setInterval(function () { show(index + 1); }, interval);
    }
    function stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }
    // 手動操作後重新計時，才不會剛點完就馬上被自動播放翻掉
    function goTo(next) { show(next); stop(); start(); }

    dots.forEach(function (dot, i) {
      dot.addEventListener("click", function () { goTo(i); });
    });

    // 鍵盤：左右鍵切換（focus 在指示器上時）
    root.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(index - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goTo(index + 1); }
    });

    // 滑鼠移入／鍵盤 focus 進來就暫停
    ["mouseenter", "focusin"].forEach(function (evt) {
      root.addEventListener(evt, function () { paused = true; stop(); });
    });
    ["mouseleave", "focusout"].forEach(function (evt) {
      root.addEventListener(evt, function () { paused = false; start(); });
    });

    // 觸控滑動
    var touchX = null;
    root.addEventListener("touchstart", function (e) {
      touchX = e.changedTouches[0].clientX;
    }, { passive: true });
    root.addEventListener("touchend", function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 40) goTo(dx < 0 ? index + 1 : index - 1);
    }, { passive: true });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });

    // 使用者中途改系統偏好也要跟著停／啟（Safari 舊版只有 addListener）
    var onMotionChange = function () { stop(); start(); };
    if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", onMotionChange);
    else if (reduceMotion.addListener) reduceMotion.addListener(onMotionChange);

    show(index);
    start();
  }

  /* -----------------------------------------------------------------
   * 6) AI 諮詢面板 .c-chat
   *    結構：button.c-consult[data-consult-toggle] + aside.c-chat[hidden]
   *
   *    ⚠️ 這是介面示意，沒有串接 AI（docs/04-ai-faq.md §4：介面與功能
   *    分兩階段交付）。送出後只回一則佔位訊息，不要當成問答功能已完成。
   *    正式版此處改為呼叫 API，並由後台的啟用開關決定是否輸出這段 DOM。
   * ------------------------------------------------------------- */
  var chatToggle = document.querySelector("[data-consult-toggle]");
  var chatPanel = document.getElementById("consultPanel");

  if (chatToggle && chatPanel) {
    var chatLog = chatPanel.querySelector("[data-consult-log]");
    var chatForm = chatPanel.querySelector("[data-consult-form]");
    var chatInput = chatPanel.querySelector(".c-chat__input");

    function openChat() {
      chatPanel.hidden = false;
      chatToggle.setAttribute("aria-expanded", "true");
      if (chatInput) chatInput.focus();
    }

    function closeChat() {
      chatPanel.hidden = true;
      chatToggle.setAttribute("aria-expanded", "false");
      // 焦點必須交還給觸發鍵，否則鍵盤使用者會掉回文件開頭
      chatToggle.focus();
    }

    chatToggle.addEventListener("click", function () {
      if (chatPanel.hidden) openChat(); else closeChat();
    });

    chatPanel.addEventListener("click", function (e) {
      if (e.target.closest("[data-consult-close]")) closeChat();
      var chip = e.target.closest("[data-consult-ask]");
      if (chip) ask(chip.textContent.trim());
    });

    // Esc 關閉：面板不是 modal，焦點可能在頁面任何地方，所以掛在 document
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !chatPanel.hidden) closeChat();
    });

    if (chatForm) {
      chatForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var q = chatInput ? chatInput.value.trim() : "";
        if (!q) return;
        if (chatInput) chatInput.value = "";
        ask(q);
      });
    }

    function ask(question) {
      appendMsg(question, "user");
      appendMsg("（示意稿）AI 問答尚未串接，正式上線後會依站內療程頁、FAQ 題庫與已審核文章回答，並附上來源連結。", "pending");
      if (chatInput) chatInput.focus();
    }

    function appendMsg(text, kind) {
      if (!chatLog) return;
      var p = document.createElement("p");
      p.className = "c-chat__msg c-chat__msg--" + (kind === "user" ? "user" : "bot");
      if (kind === "pending") p.classList.add("c-chat__msg--pending");
      p.textContent = text;
      chatLog.appendChild(p);
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  }
})();
