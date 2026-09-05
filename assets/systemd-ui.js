/* systemd-ui.js — tiny shared helpers for the UnitDoctor tool pages (v3.0) */
window.UD = (function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1600);
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }
  function copyText(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast(msg || "copied to clipboard"); },
        function () { fallbackCopy(text); toast(msg || "copied to clipboard"); }
      );
    } else {
      fallbackCopy(text);
      toast(msg || "copied to clipboard");
    }
  }
  /* live-update helper: run fn on input/change of each listed element */
  function live(fn) {
    var ids = Array.prototype.slice.call(arguments, 1);
    ids.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("input", fn);
      el.addEventListener("change", fn);
    });
  }
  function fmtDate(d) {
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return days[d.getDay()] + " " + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }
  return { $: $, esc: esc, copyText: copyText, toast: toast, live: live, fmtDate: fmtDate };
})();
