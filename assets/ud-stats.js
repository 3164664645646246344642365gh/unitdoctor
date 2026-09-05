/* UnitDoctor site stats — honest, device-local counters.
   - runs: counts tool actions (generate / check / convert / copy) in THIS browser only.
     No server, no tracking — the number is real because it is yours.
   - day: days since public launch (2026-09-05), same for every visitor.
   Exposes nothing global; renders into [data-ud-runs] and [data-ud-day] elements. */
(function () {
  var RUNS = "ud_runs";
  var LAUNCH = new Date("2026-09-05T00:00:00");

  function runs() {
    try { return parseInt(localStorage.getItem(RUNS) || "0", 10) || 0; }
    catch (e) { return 0; }
  }

  function bump() {
    try { localStorage.setItem(RUNS, String(runs() + 1)); } catch (e) {}
    render();
  }

  function render() {
    var els = document.querySelectorAll("[data-ud-runs]");
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = runs().toLocaleString("en-US");
    }
    var d = document.querySelector("[data-ud-day]");
    if (d) {
      var days = Math.max(1, Math.floor((Date.now() - LAUNCH.getTime()) / 86400000) + 1);
      d.textContent = days.toLocaleString("en-US");
    }
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target;
    while (t && t !== document.body) {
      if (t.classList && (t.classList.contains("btn-primary") ||
                          t.classList.contains("btn-copy-main") ||
                          t.hasAttribute("data-ud-count"))) {
        bump();
        return;
      }
      t = t.parentNode;
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
