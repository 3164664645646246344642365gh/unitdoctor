/* =========================================================
   calendar.js — systemd OnCalendar engine (UnitDoctor v3.0)
   Pure client-side. Parses OnCalendar specs, computes next
   run times, and converts cron <-> OnCalendar both ways.
   No dependencies. No network. Runs in any modern browser.
   ========================================================= */
var Cal = (function () {
  "use strict";

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var DOWS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  var DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTH_NAMES = [null, "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var PRESETS = {
    minutely: "*-*-* *:*:00",
    hourly: "*-*-* *:00:00",
    daily: "*-*-* 00:00:00",
    monthly: "*-*-01 00:00:00",
    weekly: "Mon *-*-* 00:00:00",
    yearly: "*-01-01 00:00:00",
    annually: "*-01-01 00:00:00",
    quarterly: "*-01,04,07,10-01 00:00:00",
    semiannually: "*-06,12-01 00:00:00"
  };

  /* Generic field parser shared by OnCalendar and cron sides.
     Items: "*" | "n" | "a..b" | "a-b" | "start/step" (to max) | "range/step".
     Names accepted for month and weekday fields.
     A field covering its whole range is normalized to null (= any). */
  function parseList(raw, max, names, errs, label, cronStyle) {
    if (raw === undefined || raw === null || raw === "") return null;
    var out = {};
    var parts = String(raw).toLowerCase().split(",");
    for (var p = 0; p < parts.length; p++) {
      var item = parts[p].trim();
      if (item === "") { errs.push(label + ": empty list item."); continue; }
      var step = 1, base = item, hasStep = false;
      var slash = item.indexOf("/");
      if (slash >= 0) {
        step = parseInt(item.slice(slash + 1), 10);
        if (!(step > 0)) { errs.push(label + ": bad step in \"" + item + "\"."); continue; }
        base = item.slice(0, slash);
        hasStep = true;
      }
      var lo, hi, single = false;
      if (base === "*" || base === "") { lo = 0; hi = max; }
      else {
        var two = base.split("..");
        if (two.length === 2) {
          lo = resolveName(two[0], names); hi = resolveName(two[1], names);
        } else {
          var dash = base.indexOf("-");
          if (dash > 0) { lo = resolveName(base.slice(0, dash), names); hi = resolveName(base.slice(dash + 1), names); }
          else { lo = resolveName(base, names); hi = lo; single = true; }
        }
        if (lo === null || hi === null) { errs.push(label + ": cannot parse \"" + item + "\"."); continue; }
        if (lo < 0 || hi > max || lo > hi) { errs.push(label + ": value out of range in \"" + item + "\" (allowed 0-" + max + ")."); continue; }
        /* "a/step" repeats from a up to the field maximum */
        if (hasStep && single) hi = max;
      }
      for (var v = lo; v <= hi; v += step) out[v] = true;
    }
    var arr = Object.keys(out).map(Number).sort(function (a, b) { return a - b; });
    if (!arr.length) return null;
    if (arr.length === max + 1 && arr[0] === 0) return null;
    return arr;
  }

  function resolveName(tok, names) {
    var t = String(tok).trim().toLowerCase();
    if (t === "" || t === "*") return null;
    if (/^\d+$/.test(t)) { var n = parseInt(t, 10); return isNaN(n) ? null : n; }
    if (names && names.hasOwnProperty(t)) return names[t];
    return null;
  }

  /* ---------- parse an OnCalendar spec ---------- */
  function parse(specRaw) {
    var res = { ok: false, errors: [], warnings: [], source: String(specRaw || "").trim(), dow: null, y: null, mo: null, d: null, h: null, mi: null, s: null, preset: null };
    var spec = res.source;
    if (!spec) { res.errors.push("Empty expression."); return res; }
    if (PRESETS.hasOwnProperty(spec.toLowerCase())) { res.preset = spec.toLowerCase(); spec = PRESETS[spec.toLowerCase()]; }

    var parts = spec.split(/\s+/).filter(function (x) { return x !== ""; });
    var datePart = null, timePart = null, dowPart = null;
    if (parts.length === 1) {
      if (parts[0].indexOf(":") >= 0) timePart = parts[0];
      else if (parts[0].indexOf("-") >= 0) datePart = parts[0];
      else { res.errors.push("Not a valid OnCalendar expression. Try like \"*-*-* 02:00:00\" or \"Mon..Fri *-*-* 09:00\"."); return res; }
    } else if (parts.length === 2) {
      if (parts[1].indexOf(":") < 0) { res.errors.push("Second part must be a time (Hour:Minute[:Second])."); return res; }
      timePart = parts[1];
      var p1 = parts[0];
      if (/^[a-z]/i.test(p1)) dowPart = p1;                            /* "Mon..Fri 09:00" */
      else if (p1.indexOf("-") >= 0) datePart = p1;                    /* "2026-12-25 00:00" or "*-*-* 02:00" */
      else { res.errors.push("Ambiguous expression \"" + p1 + "\". Use a full date (*-*-*) or a weekday (Mon..Fri) before the time."); return res; }
    } else if (parts.length === 3) {
      dowPart = parts[0]; datePart = parts[1]; timePart = parts[2];
    } else {
      res.errors.push("Too many parts. Expected: [Weekday] Year-Month-Day Hour:Minute[:Second]."); return res;
    }

    if (dowPart) res.dow = parseList(dowPart, 7, DOWS, res.errors, "Weekday");
    if (datePart) {
      var dm = datePart.split("-");
      if (dm.length !== 3) { res.errors.push("Date part must be Year-Month-Day (e.g. *-*-*)."); return res; }
      res.y = parseList(dm[0], 9999, null, res.errors, "Year");
      res.mo = parseList(dm[1], 12, MONTHS, res.errors, "Month");
      res.d = parseList(dm[2], 31, null, res.errors, "Day");
    }
    var tm = timePart.split(":");
    if (tm.length < 2 || tm.length > 3) { res.errors.push("Time part must be Hour:Minute or Hour:Minute:Second."); return res; }
    res.h = parseList(tm[0], 23, null, res.errors, "Hour");
    res.mi = parseList(tm[1], 59, null, res.errors, "Minute");
    if (tm.length === 3) res.s = parseList(tm[2], 59, null, res.errors, "Second");
    else res.s = [0];

    if (res.dow) { /* normalize 7 -> 0 (Sunday) */
      var has7 = res.dow.indexOf(7) >= 0;
      res.dow = res.dow.filter(function (x) { return x !== 7; });
      if (has7 && res.dow.indexOf(0) < 0) res.dow.push(0);
      res.dow.sort(function (a, b) { return a - b; });
    }
    if (res.errors.length) return res;
    res.ok = true;
    return res;
  }

  function inField(arr, v) { return arr === null ? true : arr.indexOf(v) >= 0; }

  function dayMatches(p, y, mo, d, dow) {
    return inField(p.y, y) && inField(p.mo, mo) && inField(p.d, d) && inField(p.dow, dow);
  }

  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function rangeArr(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }

  /* Next `count` fire times strictly after `from` (Date, local time). */
  function nextRuns(p, count, from) {
    if (!p.ok) return [];
    var out = [];
    var y = from.getFullYear(), mo = from.getMonth() + 1, d = from.getDate();
    var startH = from.getHours(), startMi = from.getMinutes(), startS = from.getSeconds();
    for (var i = 0; i < 731 && out.length < count; i++) {
      if (dayMatches(p, y, mo, d, new Date(y, mo - 1, d).getDay())) {
        var hList = p.h === null ? rangeArr(0, 23) : p.h;
        for (var hi = 0; hi < hList.length && out.length < count; hi++) {
          var h = hList[hi];
          if (i === 0 && h < startH) continue;
          var miList = p.mi === null ? rangeArr(0, 59) : p.mi;
          for (var mii = 0; mii < miList.length && out.length < count; mii++) {
            var mi = miList[mii];
            if (i === 0 && h === startH && mi < startMi) continue;
            var secList = p.s === null ? rangeArr(0, 59) : p.s;
            for (var si = 0; si < secList.length && out.length < count; si++) {
              var sec = secList[si];
              if (i === 0 && h === startH && mi === startMi && sec <= startS) continue;
              out.push(new Date(y, mo - 1, d, h, mi, sec, 0));
            }
          }
        }
      }
      d++;
      if (d > daysInMonth(y, mo)) { d = 1; mo++; if (mo > 12) { mo = 1; y++; } }
    }
    return out;
  }

  /* ---------- formatting ---------- */
  /* systemd style: ranges as "a..b", stepped runs as "a/step" when they reach max */
  function fmtField(arr, max, pad) {
    if (arr === null) return "*";
    var chunks = [], i = 0;
    while (i < arr.length) {
      var j = i;
      while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++;
      if (j > i) {
        chunks.push(arr[i] === 0 && arr[j] === max ? "*" : arr[i] + ".." + arr[j]);
        i = j + 1;
      } else {
        /* detect arithmetic step run: >=3 values, constant diff, reaching max */
        var k = (i + 2 < arr.length) ? arr[i + 1] - arr[i] : 1;
        if (k > 1) {
          var e = i;
          while (e + 1 < arr.length && arr[e + 1] - arr[e] === k) e++;
          if (e > i + 1 && arr[e] + k > max) { chunks.push(arr[i] + "/" + k); i = e + 1; continue; }
        }
        chunks.push(padNum(arr[i], max, pad));
        i++;
      }
    }
    return chunks.join(",");
  }

  function padNum(n, max, pad) {
    if (pad && n < 10 && max >= 9) return "0" + n;
    return String(n);
  }

  function fmtDow(arr) {
    if (arr === null) return null;
    var parts = [], i = 0;
    while (i < arr.length) {
      var j = i;
      while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1 && arr[j + 1] <= 6) j++;
      if (j > i) parts.push(DOW_NAMES[arr[i]] + ".." + DOW_NAMES[arr[j]]);
      else parts.push(DOW_NAMES[arr[i]] || String(arr[i]));
      i = j + 1;
    }
    return parts.join(",");
  }

  function fmtMonth(arr) {
    if (arr === null) return "*";
    var parts = [], i = 0;
    while (i < arr.length) {
      var j = i;
      while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++;
      if (j > i) parts.push(MONTH_NAMES[arr[i]] + ".." + MONTH_NAMES[arr[j]]);
      else parts.push(MONTH_NAMES[arr[i]] || String(arr[i]));
      i = j + 1;
    }
    return parts.join(",");
  }

  function format(p) {
    if (!p.ok) return "";
    var parts = [];
    var dow = fmtDow(p.dow);
    if (dow !== null) parts.push(dow);
    parts.push(fmtField(p.y, 9999) + "-" + fmtMonth(p.mo) + "-" + fmtField(p.d, 31));
    parts.push(fmtField(p.h, 23, true) + ":" + fmtField(p.mi, 59, true) + ":" + fmtField(p.s, 59, true));
    return parts.join(" ");
  }

  /* cron style: ranges as "a-b", full steps as "a/step" (Vixie) */
  function fmtCron(arr, max) {
    if (arr === null) return "*";
    var chunks = [], i = 0;
    while (i < arr.length) {
      var j = i;
      while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++;
      if (j > i) {
        chunks.push(arr[i] === 0 && arr[j] === max ? "*" : arr[i] + "-" + arr[j]);
        i = j + 1;
      } else {
        var k = (i + 2 < arr.length) ? arr[i + 1] - arr[i] : 1;
        if (k > 1) {
          var e = i;
          while (e + 1 < arr.length && arr[e + 1] - arr[e] === k) e++;
          if (e > i + 1 && arr[e] + k > max) { chunks.push(arr[i] + "/" + k); i = e + 1; continue; }
        }
        chunks.push(String(arr[i]));
        i++;
      }
    }
    return chunks.join(",");
  }

  /* ---------- cron parsing ---------- */
  var CRON_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var CRON_DOWS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  var CRON_MACROS = {
    "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *",
    "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *"
  };

  function parseCron(exprRaw) {
    var res = { ok: false, errors: [], warnings: [], source: String(exprRaw || "").trim(), mi: null, h: null, dom: null, mon: null, dow: null, command: null, macro: null };
    var expr = res.source;
    if (CRON_MACROS.hasOwnProperty(expr.toLowerCase())) { res.macro = expr.toLowerCase(); expr = CRON_MACROS[expr.toLowerCase()]; }
    var toks = expr.split(/\s+/).filter(function (x) { return x !== ""; });
    if (toks.length < 5) { res.errors.push("A cron line needs 5 fields: minute hour day-of-month month day-of-week."); return res; }
    if (toks.length > 5) {
      res.command = toks.slice(5).join(" ");
      res.warnings.push("Command text after the 5 schedule fields is ignored when generating a unit (put it in ExecStart= yourself).");
    }
    res.mi = parseList(toks[0], 59, null, res.errors, "Minute");
    res.h = parseList(toks[1], 23, null, res.errors, "Hour");
    res.dom = parseList(toks[2], 31, null, res.errors, "Day-of-month");
    res.mon = parseList(toks[3], 12, CRON_MONTHS, res.errors, "Month");
    res.dow = parseList(toks[4], 7, CRON_DOWS, res.errors, "Day-of-week");
    if (res.dow) {
      var has7 = res.dow.indexOf(7) >= 0;
      res.dow = res.dow.filter(function (x) { return x !== 7; });
      if (has7 && res.dow.indexOf(0) < 0) res.dow.push(0);
      res.dow.sort(function (a, b) { return a - b; });
    }
    if (res.errors.length) return res;
    res.ok = true;
    return res;
  }

  /* ---------- cron -> OnCalendar ---------- */
  function cronToCalendar(expr) {
    var raw = String(expr || "").trim().toLowerCase();
    if (raw === "@reboot") {
      return { ok: false, errors: ["@reboot has no OnCalendar equivalent. Use OnBootSec= in the [Timer] section instead (e.g. OnBootSec=1min)."], warnings: [] };
    }
    var c = parseCron(expr);
    if (!c.ok) return { ok: false, errors: c.errors, warnings: c.warnings };
    var p = { ok: true, dow: c.dow, y: null, mo: c.mon, d: c.dom, h: c.h, mi: c.mi, s: [0], errors: [], warnings: c.warnings.slice(), source: expr };
    if (c.dom !== null && c.dow !== null) {
      p.warnings.push("cron treats day-of-month and day-of-week as OR when both are restricted; systemd ANDs them. If you need cron's OR behavior, split into two OnCalendar= lines in the same timer.");
    }
    var oncal = format(p);
    var timer =
      "# /etc/systemd/system/my-task.timer\n" +
      "[Unit]\n" +
      "Description=My scheduled task\n\n" +
      "[Timer]\n" +
      "OnCalendar=" + oncal + "\n" +
      "Persistent=true\n" +
      "AccuracySec=1min\n\n" +
      "[Install]\n" +
      "WantedBy=timers.target\n";
    return { ok: true, oncalendar: oncal, timer: timer, warnings: p.warnings, cron: c };
  }

  /* ---------- OnCalendar -> cron ---------- */
  function calendarToCron(spec) {
    var p = parse(spec);
    if (!p.ok) return { ok: false, errors: p.errors, warnings: p.warnings };
    var warnings = p.warnings.slice();
    var plainSecond = p.s && p.s.length === 1 && p.s[0] === 0;
    if (!plainSecond) {
      warnings.push("Second precision exists on the systemd side only; a cron line fires at most once per minute.");
    }
    if (p.y !== null) warnings.push("Year-pinned OnCalendar fires once, ever. cron has no year field; guard with a date check inside the script.");
    var cronLine =
      fmtCron(p.mi, 59) + " " +
      fmtCron(p.h, 23) + " " +
      fmtCron(p.d, 31) + " " +
      fmtCron(p.mo, 12) + " " +
      fmtCron(p.dow === null ? null : p.dow, 7);
    return { ok: true, cron: cronLine, warnings: warnings, calendar: format(p) };
  }

  return {
    parse: parse,
    nextRuns: nextRuns,
    format: format,
    cronToCalendar: cronToCalendar,
    calendarToCron: calendarToCron,
    PRESETS: PRESETS
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Cal;
