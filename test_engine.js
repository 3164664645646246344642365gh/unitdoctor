// commitstyle engine v2 smoke test — run: node test_engine.js
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "assets/app.js"), "utf8");

const listeners = {};
global.document = {
  readyState: "loading",
  addEventListener: (ev, fn) => { listeners[ev] = fn; },
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  createElement: () => ({ style: {}, addEventListener() {}, classList: { add() {}, remove() {} } }),
  body: { appendChild() {}, removeChild() {} }
};
global.window = {};
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.navigator = {};

eval(src);
const cs = global.window.__cs;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra ? "  → " + extra : "")); }
}

// ---- parse ----
const diff1 = `diff --git a/src/auth/login.ts b/src/auth/login.ts
index abc..def 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -10,6 +10,9 @@ export function handleLogin(token: string) {
   const user = findUser(token);
+  if (!token) {
+    throw new Error("missing token");
+  }
   return user;
}`;
const files1 = cs.parseDiff(diff1);
check("parseDiff: 1 file, 3 added", files1.length === 1 && files1[0].added.length === 3);

// ---- v2: error-message signal drives the subject ----
const r1 = cs.generate(diff1, "diff", false);
check("error msg → recommended subject", r1.variants[0].subject === "handle missing token", r1.variants[0].subject);
check("recommended why cites the error", /error message/i.test(r1.variants[0].why), r1.variants[0].why);
check("guard becomes variant B", r1.variants.length >= 2 && /guard/.test(r1.variants[1].subject), r1.variants[1] && r1.variants[1].subject);
check("type fix, recommended has body", r1.analysis.type === "fix" && r1.variants[0].body && r1.variants[0].body.includes("1 file"), r1.variants[0].body);
check("no story-telling body on variants", !r1.variants[1].body, "");

// ---- lockfile → chore(deps) + named deps ----
const diff3 = `diff --git a/package-lock.json b/package-lock.json
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,5 +1,6 @@
 {
+  "vite": "6.1.0",
+  "esbuild": "0.24.0",
   "name": "app"
 }`;
const r3 = cs.generate(diff3, "diff", false);
check("lockfile → chore(deps)", r3.analysis.type === "chore" && r3.analysis.scope === "deps");
check("deps named in subject", r3.variants[0].subject === "add vite and esbuild dependencies", r3.variants[0].subject);

// ---- test-only ----
const diff4 = `diff --git a/tests/login.spec.ts b/tests/login.spec.ts
--- a/tests/login.spec.ts
+++ b/tests/login.spec.ts
@@ -0,0 +1,3 @@
+it("rejects empty token", () => {
+  expect(handleLogin("")).toThrow();
+});`;
const r4 = cs.generate(diff4, "diff", false);
check("test-only → test type", r4.analysis.type === "test", r4.analysis.type);

// ---- new export → feat ----
const diff5 = `diff --git a/src/utils/validate.ts b/src/utils/validate.ts
--- a/src/utils/validate.ts
+++ b/src/utils/validate.ts
@@ -0,0 +1,4 @@
+export function validateEmail(input: string) {
+  return /.+@.+/.test(input);
+}`;
const r5 = cs.generate(diff5, "diff", false);
check("new export → feat", r5.analysis.type === "feat");
check("subject from function name", r5.variants[0].subject === "add validate email", r5.variants[0].subject);

// ---- text mode: real rephrasing, not just prefixing ----
const r6 = cs.generate("fixed the login crash when token is empty", "text", false);
check("text P1 → condition-first rewrite", r6.variants[0].subject === "handle empty token in login", r6.variants[0].subject);
check("text faithful variant kept", r6.variants.some(v => v.subject === "fix the login crash when token is empty"), JSON.stringify(r6.variants.map(v => v.subject)));
check("text scope auth", r6.analysis.scope === "auth");
check("variants differ from each other", r6.variants[0].subject !== r6.variants[1].subject);

// ---- text bump pattern ----
const r6b = cs.generate("updated vite to 6.1.0", "text", false);
check("bump pattern + chore(deps)", r6b.variants[0].subject === "bump vite to 6.1.0" && r6b.analysis.type === "chore", r6b.variants[0].subject + " / " + r6b.analysis.type);

// ---- breaking ----
const r7 = cs.generate(diff1, "diff", true);
check("breaking flag → bang", cs.renderFormat(r7.variants[0], "conventional").includes("!:"), cs.renderFormat(r7.variants[0], "conventional"));
check("detailed includes BREAKING footer", cs.renderFormat(r7.variants[0], "detailed").includes("BREAKING CHANGE"));

// ---- removed export ----
const diff8 = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,4 +1,2 @@
-export const parseConfig = (s) => JSON.parse(s);
-
 export const loadConfig = () => ({}`;
const r8 = cs.generate(diff8, "diff", false);
check("removed export → fix + auto breaking", r8.analysis.type === "fix" && r8.analysis.breaking === true);
check("remove subject", r8.variants[0].subject === "remove parse config", r8.variants[0].subject);

// ---- style learner ----
const prof = cs.learnStyle([
  "feat(auth): add login rate limit",
  "fix: handle empty token",
  "chore(deps): bump vite to 6.1",
  "feat(api): add webhook retry",
  "fix(auth): guard against null session",
  "docs: update readme"
].join("\n"));
check("learnStyle: 6 commits, scopes counted", prof.n === 6 && prof.scopes["auth"] === 2);
check("median len sane", prof.medianLen >= 10 && prof.medianLen <= 72);

// ---- renderFormat sanity ----
const v = { type: "feat", scope: "auth", breaking: false, subject: "add login rate limit", body: "What: rate limit." };
check("fmt conventional", cs.renderFormat(v, "conventional") === "feat(auth): add login rate limit");
check("fmt emoji", cs.renderFormat(v, "emoji") === "✨ feat(auth): add login rate limit");
check("fmt simple", cs.renderFormat(v, "simple") === "Add login rate limit");
check("fmt detailed has body", cs.renderFormat(v, "detailed").includes("What: rate limit."));

// ---- v2.3: parseSubjects ----
const subj = cs.parseSubjects(
  "abc1234 fix: handle empty token\n" +
  "- feat: x\n" +
  "* chore: y\n" +
  "Merge pull request #6 from someone/branch\n"
);
check("parseSubjects: strips oneline hash", subj[0] === "fix: handle empty token", subj[0]);
check("parseSubjects: strips bullets, drops merges", subj.length === 3, JSON.stringify(subj));

// ---- v2.3: squash mode ----
const SQ = [
  "feat(auth): add login rate limit",
  "fix: handle empty token",
  "feat(auth): add remember-me banner",
  "chore(deps): bump vite to 6.1",
  "fix: guard against null session"
].join("\n");
const sq = cs.generateSquash(SQ);
check("squash kind=rows", sq && sq.kind === "rows");
check("squash title = dominant feat + top scope", sq.rec.msg === "feat(auth): add login rate limit", sq.rec.msg);
check("squash chips: 5 commits, feat, auth", sq.chips.some(c => c.value === "5") && sq.chips.some(c => c.value === "auth"));
check("squash alts: PR title + body", sq.alts.length === 2 && sq.alts[1].msg.includes("- fix: guard against null session"));

const sqB = cs.generateSquash("feat!: drop ie 11 support\nfix: minor thing");
check("squash breaking → !: title", sqB.rec.msg === "feat!: drop ie 11 support", sqB.rec.msg);
check("squash breaking chip flagged", sqB.chips.some(c => c.label === "breaking"));

// ---- v2.3: changelog mode ----
const CL = [
  "v1.4.0",
  "feat(auth): add login rate limit",
  "feat(api): add webhook retry with backoff",
  "fix: handle empty token",
  "fix(ui): stop button flicker on safari",
  "perf: cache token lookups",
  "chore(deps): bump vite to 6.1",
  "docs: rewrite quickstart"
].join("\n");
const cl = cs.generateChangelog(CL);
check("changelog kind=rows", cl && cl.kind === "rows");
check("changelog version header", cl.rec.msg.startsWith("## v1.4.0 — "), cl.rec.msg.split("\n")[0]);
check("changelog groups Features before Bug Fixes",
  cl.rec.msg.includes("### Features") && cl.rec.msg.indexOf("### Features") < cl.rec.msg.indexOf("### Bug Fixes"));
check("changelog scoped bullet", cl.rec.msg.includes("**auth:** add login rate limit"));
check("changelog docs + perf grouped", cl.rec.msg.includes("### Performance") && cl.rec.msg.includes("### Docs"));

const clOther = cs.generateChangelog("v2.0\nupdated readme\nshipped the thing");
check("changelog non-conventional → Other", clOther.rec.msg.includes("### Other") && clOther.rec.msg.includes("update readme"));

// ---- v2.3: lint mode ----
const lint1 = cs.lintMessage("feat(Auth): Added Login Rate-Limiting.");
check("lint: past-tense error found", lint1.issues.some(i => i.level === "error" && /past tense/i.test(i.text)), JSON.stringify(lint1.issues));
check("lint: scope-caps + capital + period warns", lint1.issues.filter(i => i.level === "warn").length === 3);
check("lint: corrected message", lint1.fixed === "feat(auth): add login rate-limiting", lint1.fixed);
check("lint: verdict needs work", lint1.verdict.indexOf("needs work") === 0, lint1.verdict);

const lint2 = cs.lintMessage("fix(auth): handle empty token");
check("lint: clean message ships", lint2.issues.length === 0 && lint2.verdict === "ship it", lint2.verdict);

const lint3 = cs.lintMessage("updated the readme file with a very long explanation of the whole installation and configuration process end to end");
check("lint: missing prefix guessed + length error", lint3.issues.some(i => i.level === "error" && /72/.test(i.text)) && lint3.issues.some(i => i.level === "error" && /Missing type prefix/i.test(i.text)));

// ---- v2.3: run() dispatcher ----
check("run(diff) kind=variants", cs.run(diff1, "diff", false).kind === "variants");
check("run(squash) kind=rows", cs.run(SQ, "squash").kind === "rows");
check("run(lint) kind=lint with fixed rec", cs.run("feat(Auth): Added Login Rate-Limiting.", "lint").rec.msg === "feat(auth): add login rate-limiting");
check("run(changelog) kind=rows", cs.run(CL, "changelog").kind === "rows");
check("run(lint) empty → null", cs.run("   ", "lint") === null);

// ---- English regression (v2.4 CJK layer removed in v3.0 — overseas-only) ----
check("en lint unchanged after v2.4", cs.lintMessage("feat(Auth): Added Login Rate-Limiting.").fixed === "feat(auth): add login rate-limiting");
check("en text unchanged after v2.4", cs.generate("fixed the login crash when token is empty", "text", false).variants[0].subject === "handle empty token in login");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
