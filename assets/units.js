/* =========================================================
   units.js — systemd unit generator + doctor (UnitDoctor v3.0)
   Pure client-side: generates .service/.timer unit text from a
   form model, and statically checks pasted unit files against
   common authoring mistakes from systemd.unit/service/timer(5).
   No dependencies. No network. Nothing uploaded.
   ========================================================= */
/* keep the doctor usable standalone in Node: pull in calendar.js if missing */
if (typeof Cal === "undefined" && typeof require === "function") {
  try { Cal = require("./calendar.js"); } catch (e) { /* browser: calendar.js is loaded first */ }
}
var Units = (function () {
  "use strict";

  /* ---------- directive whitelist for the doctor ---------- */
  var KNOWN = {
    "unit": ["description", "documentation", "requires", "wants", "requisite", "bindsto", "partof", "conflicts", "before", "after", "onfailure", "onsuccess", "propagatesreloadto", "reloadpropagatedfrom", "joinsnamespaceof", "requiresmountsfor", "conditionpathexists", "conditionpathisdirectory", "conditionfileexists", "conditionacpower", "assertpathexists", "stopwhenunneeded", "refusemanualstart", "refusemanualstop", "allowisolate", "defaultdependencies", "collectmode", "failureaction", "successaction", "jobtimeoutsec", "startlimitintervalsec", "startlimitburst", "startlimitaction"],
    "service": ["type", "exittype", "remainafterexit", "execstart", "execstartpre", "execstartpost", "execreload", "execstop", "execstoppost", "restart", "restartsec", "restartsteps", "restartmaxdelaysec", "timeoutstartsec", "timeoutstopsec", "timeoutsec", "runtimemaxsec", "watchdogsec", "pidfile", "busname", "user", "group", "supplementarygroups", "dynamicuser", "pamname", "workingdirectory", "rootdirectory", "rootimage", "environment", "environmentfile", "passenvironment", "standardinput", "standardoutput", "standarderror", "stdinpath", "stdoutpath", "stderrpath", "umask", "privatetmp", "privatedevices", "privatenetwork", "privateusers", "privatemounts", "networknamespacepath", "protectsystem", "protecthome", "protectkerneltunables", "protectkernelmodules", "protectkernellogs", "protectclock", "protectcontrolgroups", "protectproc", "procsubset", "restrictaddressfamilies", "restrictnamespaces", "restrictrealtime", "restrictsuidsgid", "lockpersonality", "memorydenypwriteexec", "nonewprivileges", "memorymax", "memoryhigh", "memoryswapmax", "cpuquota", "cpuweight", "cpuschedulingpolicy", "nice", "ioschedulingclass", "ioschedulingpriority", "limitnofile", "limitnproc", "oomscoreadjust", "oompolicy", "killmode", "killsignal", "restartkillsignal", "sendtokill", "timeoutcleansec", "capabilityboundingset", "ambientcapabilities", "readwritepaths", "readonlypaths", "inaccessiblepaths", "execpaths", "noexecpaths", "temporaryfilesystem", "statedirectory", "runtimedirectory", "cachedirectory", "logsdirectory", "configurationdirectory", "statedirectorymode", "runtimedirectorymode", "keyringmode", "removeipc", "slice", "delegate", "importcredential", "setcredential", "loadcredential", "systemcallfilter", "systemcallarchitectures", "systemcallerrornumber", "hostname", "timezone"],
    "timer": ["onactivesec", "onbootsec", "onstartupsec", "onunitactivesec", "onunitinactivesec", "oncalendar", "onclockchange", "ontimezonechange", "accuracysec", "randomizeddelaysec", "fixedrandomdelay", "unit", "persistent", "wakesystem", "remainafterelapse"],
    "socket": ["listenstream", "listendatagram", "listensequentialpacket", "listenfifo", "listennetlink", "accept", "socketuser", "socketgroup", "socketmode", "service", "bindipv6only", "backlog", "keepalive"],
    "mount": ["what", "where", "type", "options", "sloppyoptions", "lazyunmount", "readwriteonly", "directorymode", "timeoutsec"],
    "path": ["pathexists", "pathchanged", "pathmodified", "directorynotempty", "unit", "makedefault"],
    "install": ["alias", "wantedby", "requiredby", "upheldby", "also", "defaultinstance"],
    "target": ["requires", "wants", "after", "before", "description", "allowisolate", "defaultdependencies"]
  };
  var SECTIONS = ["unit", "service", "timer", "socket", "mount", "path", "install", "target"];

  var RESTART_VALUES = ["no", "always", "on-success", "on-failure", "on-abnormal", "on-watchdog", "on-abort"];
  var TYPE_VALUES = ["simple", "forking", "oneshot", "dbus", "notify", "exec", "notify-reload"];
  var KILLMODES = ["control-group", "process", "mixed", "none"];
  var STD_VALUES = ["inherit", "null", "tty", "journal", "kmsg", "syslog", "socket", "journal+console", "kmsg+console", "file:", "append:", "descriptor:"];

  /* ---------- .service generator ---------- */
  function generateService(o) {
    var e = o || {};
    var err = [];
    if (!e.execStart) err.push("ExecStart is required — what command should run?");
    if (e.execStart && e.execStart.trim().indexOf("/") !== 0) err.push("ExecStart must be an absolute path (systemd does not search PATH). Example: /usr/bin/node");
    var name = sanitizeName(e.name || "my-app");
    var lines = [];
    lines.push("# /etc/systemd/system/" + name + ".service");
    lines.push("[Unit]");
    lines.push("Description=" + (e.description || name));
    if (e.afterNetwork) lines.push("After=network-online.target\nWants=network-online.target");
    lines.push("");
    lines.push("[Service]");
    var type = e.type || "simple";
    lines.push("Type=" + type);
    if (type === "oneshot") lines.push("RemainAfterExit=" + (e.remainAfterExit === false ? "no" : "yes"));
    if (e.execStartPre) lines.push("ExecStartPre=" + e.execStartPre);
    lines.push("ExecStart=" + e.execStart);
    if (e.execStop) lines.push("ExecStop=" + e.execStop);
    if (e.user && e.user !== "root") lines.push("User=" + e.user);
    if (e.group && e.group !== "root") lines.push("Group=" + e.group);
    if (e.workingDirectory) lines.push("WorkingDirectory=" + e.workingDirectory);
    if (e.environment) String(e.environment).split("\n").forEach(function (l) { if (l.trim()) lines.push("Environment=" + l.trim()); });
    if (e.restart) {
      lines.push("Restart=" + (e.restartPolicy || "on-failure"));
      lines.push("RestartSec=" + (e.restartSec || 5));
    }
    if (e.memoryMax) lines.push("MemoryMax=" + e.memoryMax);
    if (e.harden) {
      lines.push("NoNewPrivileges=true");
      lines.push("ProtectSystem=full");
      lines.push("ProtectHome=read-only");
      lines.push("PrivateTmp=true");
    }
    lines.push("");
    lines.push("[Install]");
    lines.push("WantedBy=" + (e.wantedBy || "multi-user.target"));
    lines.push("");
    var cmds =
      "sudo cp " + name + ".service /etc/systemd/system/\n" +
      "sudo systemctl daemon-reload\n" +
      "sudo systemctl enable --now " + name + ".service";
    return { ok: err.length === 0, errors: err, unit: lines.join("\n"), name: name, commands: cmds };
  }

  /* ---------- .timer + .service pair generator ---------- */
  function generateTimerPair(o) {
    var e = o || {};
    var err = [];
    if (!e.execStart) err.push("ExecStart is required — what command should run?");
    if (e.execStart && e.execStart.trim().indexOf("/") !== 0) err.push("ExecStart must be an absolute path (systemd does not search PATH).");
    var oncal = (e.onCalendar || "").trim();
    if (!oncal && !e.onBootSec) err.push("Provide an OnCalendar schedule (or a boot delay).");
    var name = sanitizeName(e.name || "my-task");
    var lines = [];
    lines.push("# /etc/systemd/system/" + name + ".timer");
    lines.push("[Unit]");
    lines.push("Description=Run " + name + " " + (oncal ? "on schedule " + oncal : "after boot"));
    lines.push("");
    lines.push("[Timer]");
    if (oncal) lines.push("OnCalendar=" + oncal);
    if (e.onBootSec) lines.push("OnBootSec=" + e.onBootSec);
    if (e.onUnitInactiveSec) lines.push("OnUnitInactiveSec=" + e.onUnitInactiveSec);
    lines.push("AccuracySec=" + (e.accuracySec || "1min"));
    if (e.randomizedDelaySec) lines.push("RandomizedDelaySec=" + e.randomizedDelaySec);
    if (oncal) lines.push("Persistent=" + (e.persistent === false ? "false" : "true"));
    lines.push("");
    lines.push("[Install]");
    lines.push("WantedBy=timers.target");
    lines.push("");
    var svc =
      "# /etc/systemd/system/" + name + ".service\n" +
      "[Unit]\n" +
      "Description=" + (e.description || name + " job") + "\n\n" +
      "[Service]\n" +
      "Type=oneshot\n" +
      "ExecStart=" + e.execStart + "\n" +
      (e.user && e.user !== "root" ? "User=" + e.user + "\n" : "") +
      (e.harden ? "NoNewPrivileges=true\n" : "") +
      "\n";
    var cmds =
      "sudo cp " + name + ".timer " + name + ".service /etc/systemd/system/\n" +
      "sudo systemctl daemon-reload\n" +
      "sudo systemctl enable --now " + name + ".timer";
    return { ok: err.length === 0, errors: err, timer: lines.join("\n"), service: svc, name: name, commands: cmds, onCalendar: oncal };
  }

  function sanitizeName(n) {
    var s = String(n).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "my-app";
  }

  /* ---------- doctor: static checks on a pasted unit ---------- */
  function diagnose(text) {
    var findings = [];
    var lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    var section = null, execStarts = 0, serviceType = "simple", hasInstall = false, hasWantedBy = false, hasPIDFile = false, hasExecStart = false, sawAny = false, onCalendarValue = null;
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var line = raw.trim();
      if (line === "" || line.charAt(0) === "#" || line.charAt(0) === ";") continue;
      sawAny = true;
      if (line.charAt(0) === "[") {
        if (line.charAt(line.length - 1) !== "]") { findings.push(f(i, "high", "Section header is missing its closing bracket.", "Write it as [" + line.slice(1) + "]")); section = null; continue; }
        var sec = line.slice(1, -1).trim().toLowerCase();
        if (SECTIONS.indexOf(sec) < 0) {
          findings.push(f(i, "medium", "Unknown section [" + line.slice(1, -1) + "] — systemd will ignore it.", "Check spelling. Common sections: [Unit] [Service] [Timer] [Install]."));
          section = null;
        } else { section = sec; }
        if (sec === "install") hasInstall = true;
        continue;
      }
      var eq = line.indexOf("=");
      if (eq < 0) { findings.push(f(i, "high", "This line has no \"=\" — every directive must be Key=Value.", "Did you forget the = sign?")); continue; }
      if (section === null) { findings.push(f(i, "high", "Directive outside any [Section].", "Move it under the right section header.")); continue; }
      var key = line.slice(0, eq).trim().toLowerCase();
      var val = line.slice(eq + 1).trim();
      var whitelists = [];
      ["unit", "service", "timer", "socket", "mount", "path", "install", "target"].forEach(function (s) { if (section === s && KNOWN[s]) whitelists.push(KNOWN[s]); });
      var knownSomewhere = whitelists.length > 0 && whitelists.some(function (w) { return w.indexOf(key) >= 0; });
      if (!knownSomewhere) {
        var sug = suggest(key, whitelists[0] || []);
        findings.push(f(i, sug ? "medium" : "low", "Unknown directive \"" + key + "=\" in [" + section.toUpperCase() + "]." + (sug ? " Did you mean \"" + sug + "\"?" : ""), sug ? "Replace with " + sug + "=…" : "systemd ignores unknown keys — check spelling."));
      }
      /* semantic rules */
      if (key === "execstart") { execStarts++; hasExecStart = true;
        if (val && val.indexOf("/") !== 0 && val.indexOf("%") !== 0) {
          findings.push(f(i, "critical", "ExecStart uses a relative path (\"" + val.split(" ")[0] + "\") — systemd does NOT search PATH. This fails with status=203/EXEC.", "Use the absolute path, e.g. /usr/bin/node /opt/app/server.js"));
        }
        if (/(&|\||>|<|;|\$\(|\*|\?)/.test(val)) {
          findings.push(f(i, "medium", "ExecStart seems to use shell syntax (pipes, globs, redirection). ExecStart does not run a shell.", "Wrap it: ExecStart=/bin/bash -c 'your | pipeline | here'"));
        }
      }
      if (key === "type") { serviceType = val.toLowerCase(); if (TYPE_VALUES.indexOf(serviceType) < 0) findings.push(f(i, "high", "Type=" + val + " is not a valid type.", "Allowed: " + TYPE_VALUES.join(", "))); }
      if (key === "restart") { if (RESTART_VALUES.indexOf(val.toLowerCase()) < 0) findings.push(f(i, "high", "Restart=" + val + " is not valid.", "Allowed: " + RESTART_VALUES.join(", ") + " (typo? e.g. \"alwayz\" → \"always\")")); }
      if (key === "killmode") { if (KILLMODES.indexOf(val.toLowerCase()) < 0) findings.push(f(i, "medium", "KillMode=" + val + " is not valid.", "Allowed: " + KILLMODES.join(", "))); }
      if (key === "pidfile") hasPIDFile = true;
      if (key === "wantedby") hasWantedBy = true;
      if ((key === "standardoutput" || key === "standarderror")) {
        var v = val.toLowerCase();
        var okStd = STD_VALUES.some(function (s) { return s === v || (s.slice(-1) === ":" && v.indexOf(s) === 0); });
        if (!okStd) {
          var fixed = (v === "jurnal" || v === "joural") ? "journal" : null;
          findings.push(f(i, "high", key + "=" + val + " is not a valid setting.", fixed ? "Typo — use " + fixed + ". Valid: journal, null, tty, kmsg, syslog, file:/path, append:/path." : "Valid: journal, null, tty, kmsg, syslog, file:/path, append:/path."));
        }
      }
      if (key === "oncalendar" && section === "timer") {
        onCalendarValue = val;
        var cp = Cal.parse(val);
        if (!cp.ok) findings.push(f(i, "critical", "OnCalendar=" + val + " does not parse: " + cp.errors[0], "Check the format: [Weekday] Year-Month-Day Hour:Minute:Second, e.g. Mon..Fri *-*-* 09:00:00"));
      }
      if (key === "oncalendar" && section !== "timer") {
        findings.push(f(i, "medium", "OnCalendar= only has meaning inside a [Timer] section.", "Move it to the .timer unit."));
      }
    }
    if (!sawAny) findings.push(f(0, "high", "Nothing to check — the input is empty.", "Paste a .service or .timer file, or load the broken example."));
    if (hasExecStart && execStarts > 1 && serviceType !== "oneshot") {
      findings.push(f(-1, "high", "Multiple ExecStart= lines require Type=oneshot (current Type=" + serviceType + ").", "Set Type=oneshot, or keep exactly one ExecStart=."));
    }
    if (serviceType === "forking" && !hasPIDFile) {
      findings.push(f(-1, "medium", "Type=forking without PIDFile= — systemd cannot reliably track the main process.", "Add PIDFile=/run/your-app.pid or prefer Type=simple/exec/notify."));
    }
    if (section === "service" || hasExecStart) {
      if (!hasInstall || !hasWantedBy) {
        findings.push(f(-1, "medium", "No [Install] section with WantedBy= — \"systemctl enable\" will do nothing.", "Add:\n[Install]\nWantedBy=multi-user.target"));
      }
    }
    if (onCalendarValue && /every\s+\d+\s*(min|hour|day)/i.test(onCalendarValue)) {
      findings.push(f(-1, "high", "OnCalendar looks like plain English, not a calendar spec.", "For every 5 minutes use *:0/5 or *-*-* *:0/5:00."));
    }
    return { findings: findings, score: score(findings) };
  }

  function f(line, severity, message, fix) { return { line: line, severity: severity, message: message, fix: fix || "" }; }

  function suggest(key, dict) {
    var best = null, bestD = 99;
    for (var i = 0; i < dict.length; i++) {
      var d = editDistance(key, dict[i]);
      if (d < bestD) { bestD = d; best = dict[i]; }
    }
    return bestD <= 2 ? best : null;
  }

  function editDistance(a, b) {
    var m = a.length, n = b.length;
    if (Math.abs(m - n) > 3) return 99;
    var dp = [], i, j;
    for (i = 0; i <= m; i++) { dp[i] = [i]; }
    for (j = 0; j <= n; j++) { dp[0][j] = j; }
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return dp[m][n];
  }

  function score(findings) {
    var s = 100;
    findings.forEach(function (x) {
      if (x.severity === "critical") s -= 30;
      else if (x.severity === "high") s -= 18;
      else if (x.severity === "medium") s -= 8;
      else s -= 3;
    });
    return Math.max(0, s);
  }

  /* examples for the doctor */
  var EXAMPLES = {
    broken: [
      "[Unit]",
      "Description My App",
      "",
      "[Service]",
      "Type=simple",
      "ExecStart=node app.js",
      "Restart=alwayz",
      "StandardOutput=jurnal",
      "",
      "# no [Install] section on purpose"
    ].join("\n"),
    service: [
      "[Unit]",
      "Description=My web app",
      "After=network-online.target",
      "",
      "[Service]",
      "Type=simple",
      "User=www-data",
      "WorkingDirectory=/opt/app",
      "ExecStart=/usr/bin/node /opt/app/server.js",
      "Restart=on-failure",
      "RestartSec=5",
      "",
      "[Install]",
      "WantedBy=multi-user.target"
    ].join("\n"),
    timer: [
      "[Unit]",
      "Description=Nightly backup",
      "",
      "[Timer]",
      "OnCalendar=*-*-* 02:30:00",
      "Persistent=true",
      "",
      "[Install]",
      "WantedBy=timers.target"
    ].join("\n")
  };

  return {
    generateService: generateService,
    generateTimerPair: generateTimerPair,
    diagnose: diagnose,
    EXAMPLES: EXAMPLES,
    KNOWN: KNOWN
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Units;
