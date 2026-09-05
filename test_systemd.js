/* Test suite for calendar.js + units.js — run: node test_systemd.js */
"use strict";
var Cal = require("./assets/calendar.js");
var Units = require("./assets/units.js");

var pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log("  FAIL: " + name); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + " | got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }

/* ---------- 1. OnCalendar parsing ---------- */
var p = Cal.parse("Mon..Fri *-*-* 02:30:00");
ok(p.ok, "parse weekday range ok");
eq(p.dow, [1, 2, 3, 4, 5], "dow Mon..Fri");
eq(p.h, [2], "hour 02");
eq(p.mi, [30], "minute 30");

p = Cal.parse("daily");
ok(p.ok && p.preset === "daily", "preset daily accepted");
eq(p.h, [0], "daily hour=0");

p = Cal.parse("*:0/15");
ok(p.ok, "shorthand *:0/15 ok");
eq(p.mi, [0, 15, 30, 45], "every 15 min");
eq(p.s, [0], "implicit seconds 0");

p = Cal.parse("*-*-* *:*:*");
ok(p.ok && p.s === null, "every-second spec has s=null");
eq(p.s, null, "s null means any second");

p = Cal.parse("Mon..Fri 09:00");
ok(p.ok, "two-part spec (dow + time) ok");
eq(p.d, null, "date omitted -> null");

p = Cal.parse("Sat,Sun *-*-01 12:00:00");
ok(p.ok && p.dow[0] === 0 && p.dow[1] === 6, "Sat,Sun -> [0(Sun),6(Sat)] sorted");

p = Cal.parse("Sun *-*-* 00:00:00");
eq(p.dow, [0], "Sun = 0");

p = Cal.parse("*-*-01,15 14:30:00");
eq(p.d, [1, 15], "day list 1,15");

p = Cal.parse("2026-12-25 00:00:00");
ok(p.ok && p.y[0] === 2026, "year-pinned spec parses");

p = Cal.parse("bogus");
ok(!p.ok && p.errors.length > 0, "bogus input errors");

p = Cal.parse("");
ok(!p.ok, "empty input errors");

p = Cal.parse("*-*-* 25:00:00");
ok(!p.ok, "hour 25 rejected");

p = Cal.parse("*-13-01 00:00:00");
ok(!p.ok, "month 13 rejected");

/* ---------- 2. formatting round-trip ---------- */
eq(Cal.format(Cal.parse("Mon..Fri *-*-* 02:30:00")), "Mon..Fri *-*-* 02:30:00", "fmt roundtrip weekday+time");
eq(Cal.format(Cal.parse("*:0/15")), "*-*-* *:0/15:00".replace("0/15", "0/15"), "fmt shorthand keeps step");
ok(Cal.format(Cal.parse("*:0/15")).indexOf("0/15") > 0 || Cal.format(Cal.parse("*:0/15")).indexOf("0,15,30,45") > 0, "fmt keeps 15-min step either way");
eq(Cal.format(Cal.parse("daily")), "*-*-* 00:00:00", "fmt daily expands");

/* ---------- 3. nextRuns ---------- */
var from = new Date(2026, 8, 5, 12, 0, 0); /* Sat 2026-09-05 12:00 local */
var runs = Cal.nextRuns(Cal.parse("Mon..Fri *-*-* 09:00:00"), 3, from);
ok(runs.length === 3, "nextRuns returns 3");
eq([runs[0].getDay(), runs[0].getHours(), runs[0].getMinutes()], [1, 9, 0], "first run Monday 09:00 (after Sat noon)");
eq([runs[1].getDay(), runs[1].getHours()], [2, 9], "second run Tuesday 09:00");

runs = Cal.nextRuns(Cal.parse("*-*-* *:*:*"), 2, new Date(2026, 8, 5, 12, 0, 3));
ok(runs.length === 2 && runs[0].getSeconds() === 4, "every-second starts next second");

runs = Cal.nextRuns(Cal.parse("*-*-* *:0/15:00"), 4, new Date(2026, 8, 5, 12, 1, 0));
eq(runs.map(function (r) { return r.getMinutes(); }), [15, 30, 45, 0], "quarter-hour steps (next day wraps to :00)");

runs = Cal.nextRuns(Cal.parse("*-*-01 00:00:00"), 2, new Date(2026, 8, 5, 12, 0, 0));
eq([runs[0].getMonth() + 1, runs[0].getDate()], [10, 1], "monthly hits Oct 1");
eq([runs[1].getMonth() + 1, runs[1].getDate()], [11, 1], "then Nov 1");

runs = Cal.nextRuns(Cal.parse("2026-12-25 00:00:00"), 1, new Date(2026, 8, 5, 12, 0, 0));
eq([runs[0].getMonth() + 1, runs[0].getDate()], [12, 25], "year-pinned fires Dec 25");

runs = Cal.nextRuns(Cal.parse("2030-12-25 00:00:00"), 1, new Date(2026, 8, 5, 12, 0, 0));
eq(runs.length, 0, "beyond 730-day horizon returns empty");

/* ---------- 4. cron -> calendar ---------- */
var r = Cal.cronToCalendar("0 2 * * 1-5");
ok(r.ok, "cronToCalendar basic ok");
eq(r.oncalendar, "Mon..Fri *-*-* 02:00:00", "0 2 * * 1-5 -> Mon..Fri *-*-* 02:00:00");
ok(r.timer.indexOf("[Timer]") > 0 && r.timer.indexOf("OnCalendar=Mon..Fri *-*-* 02:00:00") > 0, "timer template contains OnCalendar");
eq(r.warnings.length, 0, "no warnings when dom unrestricted");

r = Cal.cronToCalendar("*/15 * * * *");
ok(r.ok, "cron step ok");
ok(r.oncalendar.indexOf("/15") > 0, "*/15 keeps step form: " + r.oncalendar);

r = Cal.cronToCalendar("30 4 1 * 1");
ok(r.ok && r.warnings.length === 1, "dom+dow restricted -> AND warning");

r = Cal.cronToCalendar("@daily");
ok(r.ok && r.oncalendar === "*-*-* 00:00:00", "@daily macro");

r = Cal.cronToCalendar("@hourly");
ok(r.ok && r.oncalendar.indexOf("*:00:00") > 0, "@hourly macro");

r = Cal.cronToCalendar("@reboot");
ok(!r.ok && r.errors[0].indexOf("OnBootSec") > 0, "@reboot -> OnBootSec advice");

r = Cal.cronToCalendar("0 2 * * * /usr/bin/backup.sh");
ok(r.ok && r.warnings.length >= 1 && r.warnings[0].indexOf("Command") >= 0, "command text warned");

r = Cal.cronToCalendar("99 * * * *");
ok(!r.ok, "cron minute 99 rejected");

r = Cal.cronToCalendar("0 2 * JAN-MAR *");
ok(r.ok && (r.oncalendar.indexOf("Jan..Mar") > 0), "month names Jan-Mar: " + r.oncalendar);

/* ---------- 5. calendar -> cron ---------- */
r = Cal.calendarToCron("Mon..Fri *-*-* 02:30:00");
ok(r.ok, "calendarToCron ok");
eq(r.cron, "30 2 * * 1-5", "reverse conversion exact");

r = Cal.calendarToCron("*-*-* *:*:*");
ok(r.ok && r.warnings.length >= 1, "second-precision warns");

r = Cal.calendarToCron("2026-12-25 00:00:00");
ok(r.ok && r.warnings.some(function (w) { return w.indexOf("Year") >= 0; }), "year-pinned warns");

/* ---------- 6. service generator ---------- */
var g = Units.generateService({ name: "My App!", execStart: "/usr/bin/node /opt/app/server.js", user: "www-data", restart: true, harden: true, afterNetwork: true });
ok(g.ok, "generateService ok");
ok(g.name === "my-app", "name sanitized");
ok(g.unit.indexOf("ExecStart=/usr/bin/node /opt/app/server.js") > 0, "ExecStart emitted");
ok(g.unit.indexOf("User=www-data") > 0, "User emitted");
ok(g.unit.indexOf("Restart=on-failure") > 0, "Restart emitted");
ok(g.unit.indexOf("NoNewPrivileges=true") > 0, "hardening emitted");
ok(g.unit.indexOf("After=network-online.target") > 0, "network wait emitted");
ok(g.commands.indexOf("systemctl enable --now my-app.service") > 0, "install commands");

g = Units.generateService({ execStart: "node app.js" });
ok(!g.ok && g.errors[0].indexOf("absolute path") > 0, "relative ExecStart rejected at generation");

/* ---------- 7. timer pair generator ---------- */
var t = Units.generateTimerPair({ name: "cleanup-logs", execStart: "/usr/local/bin/cleanup.sh", onCalendar: "*-*-* 03:00:00", randomizedDelaySec: "10min" });
ok(t.ok, "generateTimerPair ok");
ok(t.timer.indexOf("OnCalendar=*-*-* 03:00:00") > 0, "timer OnCalendar emitted");
ok(t.timer.indexOf("Persistent=true") > 0, "Persistent default true");
ok(t.timer.indexOf("RandomizedDelaySec=10min") > 0, "RandomizedDelaySec emitted");
ok(t.service.indexOf("Type=oneshot") > 0, "paired service oneshot");
ok(t.service.indexOf("ExecStart=/usr/local/bin/cleanup.sh") > 0, "paired service ExecStart");
ok(t.commands.indexOf("enable --now cleanup-logs.timer") > 0, "enable --now the TIMER not the service");

t = Units.generateTimerPair({ execStart: "/bin/true", onCalendar: "every 5 min" });
ok(t.ok, "plain-english OnCalendar accepted at generation (doctor catches it)");
ok(t.timer.indexOf("OnCalendar=every 5 min") > 0, "passes through for diagnosis");

/* ---------- 8. doctor ---------- */
var d = Units.diagnose(Units.EXAMPLES.broken);
var msgs = d.findings.map(function (x) { return x.message; }).join(" | ");
ok(d.findings.some(function (x) { return x.message.indexOf("no \"=\"") > 0 || x.message.indexOf("missing its closing") > 0; }), "missing = caught: " + msgs);
ok(d.findings.some(function (x) { return x.message.indexOf("203/EXEC") > 0; }), "relative ExecStart caught");
ok(d.findings.some(function (x) { return x.message.indexOf("Restart=") >= 0 && x.message.indexOf("not valid") > 0; }), "bad Restart caught");
ok(d.findings.some(function (x) { return x.message.indexOf("jurnal") >= 0 || x.message.indexOf("Typo") > 0 || x.fix.indexOf("journal") > 0; }), "jurnal typo caught");
ok(d.findings.some(function (x) { return x.message.indexOf("[Install]") > 0 || x.message.indexOf("systemctl enable") > 0; }), "missing Install caught");
ok(d.score < 100, "broken example scores below 100 (score=" + d.score + ")");

d = Units.diagnose(Units.EXAMPLES.service);
ok(d.findings.length === 0, "clean service -> zero findings (got " + d.findings.length + ": " + d.findings.map(function (x) { return x.message; }).join(";") + ")");

d = Units.diagnose(Units.EXAMPLES.timer);
ok(d.findings.length === 0, "clean timer -> zero findings");

d = Units.diagnose("[Service]\nType=forking\nExecStart=/usr/sbin/daemon\n");
ok(d.findings.some(function (x) { return x.message.indexOf("PIDFile") > 0; }), "forking without PIDFile caught");
ok(d.findings.some(function (x) { return x.message.indexOf("[Install]") > 0; }), "missing install flagged for forking unit");

d = Units.diagnose("[Service]\nExecStart=/bin/a\nExecStart=/bin/b\nType=simple\n");
ok(d.findings.some(function (x) { return x.message.indexOf("Multiple ExecStart") >= 0; }), "multiple ExecStart caught");

d = Units.diagnose("[Timer]\nOnCalendar=every 5 min\n");
ok(d.findings.some(function (x) { return x.message.indexOf("plain English") > 0; }), "english-language OnCalendar caught");

d = Units.diagnose("[Service]\nRestar=always\nExecStart=/bin/true\n");
ok(d.findings.some(function (x) { return x.message.indexOf("Did you mean") > 0 && x.fix.indexOf("restart=") >= 0; }), "typo Restar -> restart suggested");

d = Units.diagnose("");
ok(d.findings.length > 0 && d.findings[0].message.indexOf("empty") > 0, "empty input flagged");

d = Units.diagnose("[Service]\nOnCalendar=*-*-* 00:00:00\n");
ok(d.findings.some(function (x) { return x.message.indexOf("[Timer]") > 0; }), "OnCalendar outside Timer section caught");

/* summary */
console.log("\n=== test_systemd.js: " + pass + " passed, " + fail + " failed ===");
process.exit(fail ? 1 : 0);
