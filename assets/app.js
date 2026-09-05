/* commitstyle.online — engine v2.3. Rules in, commits out, nothing leaves this tab. */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    mode: "diff",
    profile: null,
    applyStyle: true,
    fmt: "conventional",
    last: null
  };

  var VERSION = "v2.4";

  var EMOJI = {
    feat: "✨", fix: "🐛", docs: "📝", style: "💄", refactor: "♻️",
    perf: "⚡", test: "✅", build: "📦", ci: "👷", chore: "🔧", revert: "⏪"
  };

  var VALID_TYPES = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"];

  var SAMPLE_DIFF = [
    "diff --git a/src/auth/login.ts b/src/auth/login.ts",
    "index 3f2a1bc..9d8e7f6 100644",
    "--- a/src/auth/login.ts",
    "+++ b/src/auth/login.ts",
    "@@ -12,7 +12,12 @@ export async function handleLogin(req: Request) {",
    "   const body = await req.json();",
    "+  if (!body.token) {",
    "+    throw new AuthError(\"missing or empty session token\");",
    "+  }",
    "+  if (isExpired(body.token)) {",
    "+    throw new AuthError(\"expired session token\");",
    "+  }",
    "   const user = await findUser(body.token);",
    "   return createSession(user);",
    " }"
  ].join("\n");

  var SAMPLE_TEXT = "fixed the login crash when token is empty";

  var SAMPLE_SQUASH = [
    "feat(auth): add login rate limit",
    "fix: handle empty token",
    "feat(auth): add remember-me banner",
    "chore(deps): bump vite to 6.1",
    "fix: guard against null session"
  ].join("\n");

  var SAMPLE_CHANGELOG = [
    "v1.4.0",
    "feat(auth): add login rate limit",
    "feat(api): add webhook retry with backoff",
    "fix: handle empty token",
    "fix(ui): stop button flicker on safari",
    "perf: cache token lookups",
    "chore(deps): bump vite to 6.1",
    "docs: rewrite quickstart"
  ].join("\n");

  var SAMPLE_LINT = "feat(Auth): Added Login Rate-Limiting.";

  /* =====================================================
     MODES
  ===================================================== */

  var MODES = {
    diff: {
      placeholder: "Paste the output of `git diff --staged` here…",
      hint: "unified diff format (git diff / git show)",
      recLabel: "recommended", formats: true,
      samples: ["sample-diff"]
    },
    text: {
      placeholder: "e.g. fixed the login crash when token is empty",
      hint: "one change per line · a plain sentence is enough",
      recLabel: "recommended", formats: true,
      samples: ["sample-text"]
    },
    squash: {
      placeholder: "feat(auth): add login rate limit\nfix: handle empty token\nchore(deps): bump vite to 6.1\n…",
      hint: "one commit subject per line — `git log --oneline` output works as-is",
      recLabel: "squash commit title", formats: false,
      samples: ["sample-squash"]
    },
    changelog: {
      placeholder: "v1.4.0\nfeat(auth): add login rate limit\nfix: handle empty token\nperf: cache token lookups\n…",
      hint: "one subject per line; a first line like v1.4.0 becomes the header",
      recLabel: "changelog.md", formats: false,
      samples: ["sample-changelog"]
    },
    lint: {
      placeholder: "feat(Auth): Added Login Rate-Limiting.\nfix: handle empty token",
      hint: "paste one commit message — checked against the spec",
      recLabel: "corrected message", formats: false,
      samples: ["sample-lint"]
    }
  };

  /* =====================================================
     SHARED TEXT UTILITIES
  ===================================================== */

  var CONV_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

  var PAST_TO_IMPERATIVE = {
    added: "add", fixed: "fix", updated: "update", removed: "remove",
    changed: "change", created: "create", improved: "improve",
    refactored: "refactor", made: "make", implemented: "implement",
    introduced: "introduce", enabled: "enable", adjusted: "adjust",
    moved: "move", renamed: "rename", cleaned: "clean", migrated: "migrate",
    optimized: "optimize", optimised: "optimize", handled: "handle",
    allowed: "allow", prevented: "prevent", bumped: "bump", wrote: "write",
    built: "build", fixes: "fix", adds: "add", updates: "update",
    removes: "remove", crashes: "crash", fails: "fail", supports: "support"
  };

  function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function imperativeWords(s) {
    return s.replace(/[A-Za-z]+/g, function (w) {
      var lower = w.toLowerCase();
      if (PAST_TO_IMPERATIVE[lower]) {
        return w.charAt(0) === w.charAt(0).toUpperCase()
          ? PAST_TO_IMPERATIVE[lower].charAt(0).toUpperCase() + PAST_TO_IMPERATIVE[lower].slice(1)
          : PAST_TO_IMPERATIVE[lower];
      }
      return w;
    });
  }

  function cleanSentence(s) {
    s = s.replace(/^(this commit|this change|this pr|commit)\s+(to\s+|that\s+|which\s+)?/i, "");
    s = s.replace(/^(i|we)\s+/i, "");
    s = s.replace(/[.!?。！？]+$/, "");
    s = imperativeWords(s);
    s = s.replace(/^the\s+/i, "").replace(/^a\s+/i, "").replace(/^an\s+/i, "");
    s = s.replace(/\s{2,}/g, " ").trim();
    var clause = s.split(/[,;]|\s+and\s+then\s+/)[0].trim();
    if (clause.length >= 16) s = clause;
    if (s.length > 72) s = s.slice(0, 69).replace(/\s+\S*$/, "") + "…";
    return s;
  }

  function camelToWords(s) {
    return s.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  }

  function stripEmoji(s) {
    return s.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u, "").trim();
  }

  function parseSubjects(raw) {
    return raw.split("\n")
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l && !/^#/.test(l); })
      .map(function (l) {
        return l.replace(/^[0-9a-f]{7,10}\s+/i, "")   // git log --oneline hash
                .replace(/^[-*•]\s*/, "");             // markdown bullet
      })
      .filter(function (l) { return l && !/^merge (pull request|branch)/i.test(l); });
  }

  function clampSubject(s) {
    var max = 72;
    if (state.profile && state.profile.medianLen) {
      max = Math.max(24, Math.min(72, Math.round(state.profile.medianLen)));
    }
    if (s.length <= max) return s;
    return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  }

  /* =====================================================
     DIFF ENGINE (diff / text modes)
  ===================================================== */

  function parseDiff(text) {
    var files = [];
    var lines = text.split("\n");
    var cur = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (m) {
        cur = { path: m[2], added: [], removed: [] };
        files.push(cur);
        continue;
      }
      m = line.match(/^\+\+\+ b\/(.+)$/);
      if (m && cur) { cur.path = m[1].replace(/^b\//, ""); continue; }
      if (!cur) continue;
      if (/^(index |@@|--- |\+\+\+|new file mode|deleted file mode|old mode|new mode|similarity index|rename )/.test(line)) continue;
      if (/^Binary files /.test(line)) { cur.binary = true; continue; }
      if (line.charAt(0) === "+") cur.added.push(line.slice(1));
      else if (line.charAt(0) === "-") cur.removed.push(line.slice(1));
    }
    return files;
  }

  function classifyFile(path) {
    var p = path.toLowerCase();
    if (/(^|\/)(tests?|spec|__tests__|__snapshots__)\//.test(p) ||
        /\.(test|spec)\.[a-z]+$/.test(p) || /(^|\/)test_[^\/]*\.py$/.test(p) ||
        /\.snap$/.test(p)) return "test";
    if (/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json|poetry\.lock|cargo\.lock|composer\.lock|gemfile\.lock)$/.test(p)) return "lockfile";
    if (/(^|\/)migrations?\//.test(p) || /(^|\/)schema\//.test(p) || /\.(sql|prisma)$/.test(p)) return "migration";
    if (/(^|\/)\.github\/(workflows|actions)\//.test(p) ||
        /(^|\/)\.gitlab-ci\.yml$/.test(p) || /jenkinsfile/.test(p) ||
        /(^|\/)\.circleci\//.test(p)) return "ci";
    if (/(^|\/)docs?\//.test(p) || /\.(md|mdx|rst|adoc)$/.test(p) ||
        /(^|\/)(changelog|license|contributing|code_of_conduct)/.test(p)) return "docs";
    if (/(webpack|vite|rollup|esbuild|babel|tsconfig|jsconfig|jest\.|vitest|eslint|prettier|biome|makefile|dockerfile|docker-compose|\.toml$|\.cfg$|gruntfile|gulpfile)/.test(p) ||
        /(^|\/)(package\.json|requirements\.txt|pipfile|gemfile|go\.(mod|sum)|cargo\.toml)$/.test(p)) return "build";
    return "src";
  }

  function totals(files) {
    var t = { added: 0, removed: 0 };
    files.forEach(function (f) {
      t.added += f.added.length;
      t.removed += f.removed.length;
    });
    return t;
  }

  function isWhitespaceOnly(files) {
    var sawChange = false;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      for (var j = 0; j < f.added.length; j++) {
        if (f.added[j].trim() !== "") return false;
        sawChange = true;
      }
      for (var k = 0; k < f.removed.length; k++) {
        if (f.removed[k].trim() !== "") return false;
        sawChange = true;
      }
    }
    return sawChange;
  }

  function guessScope(files) {
    var counts = {};
    var generic = { src: 1, lib: 1, app: 1, packages: 1, tests: 1, test: 1, spec: 1 };
    files.forEach(function (f) {
      var parts = f.path.split("/");
      var seg = null;
      for (var i = parts.length - 1; i > 0; i--) {
        if (!generic[parts[i - 1]] && parts.length - i <= 3) { seg = parts[i - 1]; break; }
      }
      if (!seg && parts.length > 1) seg = parts[0];
      if (seg) counts[seg] = (counts[seg] || 0) + 1;
    });
    var best = null, bestN = 0;
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > bestN) { best = k; bestN = counts[k]; }
    });
    return best;
  }

  function baseName(path) { return path.split("/").pop().replace(/\.[a-z]+$/i, ""); }

  var RESERVED = {
    const: 1, let: 1, var: 1, function: 1, return: 1, if: 1, else: 1,
    throw: 1, new: 1, error: 1, true: 1, false: 1, null: 1, undefined: 1,
    this: 1, class: 1, await: 1, async: 1, export: 1, import: 1, from: 1,
    type: 1, interface: 1, string: 1, number: 1, boolean: 1
  };

  function collectSignals(files) {
    var sig = { errorMsgs: [], guards: [], funcs: [], exportsAdded: [], exportsRemoved: [], deps: [], identifiers: {} };
    files.forEach(function (f) {
      var kind = classifyFile(f.path);
      f.added.forEach(function (l) {
        var m;
        if (kind === "src") {
          m = l.match(/(?:throw|reject)\s+(?:new\s+)?[A-Za-z]*Error\s*\(\s*["'`]([^"'`]{3,60})["'`]/);
          if (m) sig.errorMsgs.push(m[1]);
          m = l.match(/if\s*\(\s*!?\s*([\w.$]+)\s*\)/);
          if (m) sig.guards.push(m[1]);
          m = l.match(/(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_]\w*)/);
          if (m) sig.funcs.push(m[1]);
          m = l.match(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_]\w*)/);
          if (m) sig.exportsAdded.push(m[1]);
          (l.match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) || []).forEach(function (w) {
            if (!RESERVED[w.toLowerCase()]) sig.identifiers[w] = (sig.identifiers[w] || 0) + 1;
          });
        }
        if (/package\.json$/.test(f.path) || kind === "lockfile") {
          m = l.match(/"([@a-z0-9][@a-z0-9._\/-]*)"\s*:\s*"[~^]?[\d]/i);
          if (m && ["name", "version"].indexOf(m[1]) === -1) sig.deps.push(m[1]);
          m = l.match(/"node_modules\/([^"]+)":\s*\{/);
          if (m) sig.deps.push(m[1].split("/").pop());
        }
      });
      f.removed.forEach(function (l) {
        if (kind !== "src") return;
        var m = l.match(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_]\w*)/);
        if (m) sig.exportsRemoved.push(m[1]);
      });
    });
    return sig;
  }

  function analyzeDiff(files, breakingFlag) {
    var t = totals(files);
    var kinds = {};
    files.forEach(function (f) { kinds[classifyFile(f.path)] = (kinds[classifyFile(f.path)] || 0) + 1; });
    var kindList = Object.keys(kinds);

    var type = null, scope = null, note = "";

    if (files.every(function (f) { return classifyFile(f.path) === "lockfile"; })) {
      type = "chore"; scope = "deps"; note = "lockfile-only diff";
    } else if (kindList.length === 1 && kinds["docs"]) {
      type = "docs"; note = "docs-only diff";
    } else if (kindList.length === 1 && kinds["test"]) {
      type = "test"; note = "test-only diff";
    } else if (kindList.length === 1 && kinds["ci"]) {
      type = "ci"; note = "CI config diff";
    } else if (kindList.every(function (k) { return k === "build" || k === "lockfile"; })) {
      type = "build"; scope = guessScope(files); note = "build/config diff";
    } else if (kinds["migration"]) {
      type = (t.added > t.removed) ? "feat" : "fix"; scope = "db";
      note = "migration/schema files → db scope";
    } else if (isWhitespaceOnly(files)) {
      type = "style"; note = "whitespace-only changes";
    } else if (collectSignals(files).exportsRemoved.length) {
      type = "fix"; breakingFlag = true;
      note = "public API removed — flagged breaking";
    } else if (kinds["src"]) {
      var sig = collectSignals(files);
      if (sig.exportsAdded.length || sig.funcs.length) {
        type = "feat"; note = "new function/export detected";
      } else if (t.added === 0 && t.removed > 0) {
        type = "refactor"; note = "deletions only";
      } else {
        type = "fix"; note = "src change, no new API → fix";
      }
    } else {
      type = "fix"; note = "mixed changes → fix";
    }

    return { type: type, scope: scope, note: note, breaking: breakingFlag, totals: t, files: files, signals: collectSignals(files) };
  }

  var TYPE_RULES = [
    { type: "test",     re: /\b(test|tests|spec|coverage|unit test)\b/i },
    { type: "docs",     re: /\b(docs?|documentation|readme|comment|changelog)\b/i },
    { type: "perf",     re: /\b(faster|performance|optimi[sz]e|speed|latency|memory)\b/i },
    { type: "ci",       re: /\b(ci|pipeline|github actions|workflow|jenkins)\b/i },
    { type: "build",    re: /\b(webpack|vite|build|bundle|tsconfig|eslint|typescript config)\b/i },
    { type: "chore",    re: /\b(chore|upgrade|bump|release|version|maintenance|dependenc)/i },
    { type: "refactor", re: /\b(refactor|restructure|reorganize|clean ?up|extract|split|rename)\b/i },
    { type: "fix",      re: /\b(fix|bug|error|crash|broken|fails?|issue|wrong|incorrect|leak)\b/i },
    { type: "feat",     re: /\b(add|feature|implement|support|introduce|new|enable|create)\b/i }
  ];

  var SCOPE_RULES = [
    { scope: "auth",    re: /\b(login|logout|auth|session|token|password|oauth|sso)\b/i },
    { scope: "api",     re: /\b(api|endpoint|route|request|response|graphql)\b/i },
    { scope: "db",      re: /\b(database|db|sql|query|migration|schema|table)\b/i },
    { scope: "ui",      re: /\b(button|css|style|layout|ui|font|color|modal|menu|nav)\b/i },
    { scope: "deps",    re: /\b(deps?|dependenc|package|bump|upgrade)\b/i },
    { scope: "config",  re: /\b(config|env|settings|flags?)\b/i },
    { scope: "payment", re: /\b(payment|checkout|billing|invoice|stripe|subscription)\b/i },
    { scope: "i18n",    re: /\b(translation|i18n|locale|language)\b/i }
  ];

  function typeFromText(text) {
    for (var i = 0; i < TYPE_RULES.length; i++) {
      if (TYPE_RULES[i].re.test(text)) return TYPE_RULES[i].type;
    }
    return "chore";
  }

  function scopeFromText(text) {
    for (var i = 0; i < SCOPE_RULES.length; i++) {
      if (SCOPE_RULES[i].re.test(text)) return SCOPE_RULES[i].scope;
    }
    return null;
  }

  function diffSubjects(an) {
    var sig = an.signals;
    var list = [];

    if (sig.exportsRemoved.length) {
      list.push({ subject: "remove " + camelToWords(sig.exportsRemoved[0]),
        why: "public export “" + sig.exportsRemoved[0] + "” was deleted", breaking: true });
    }
    if (sig.deps.length) {
      list.push({ subject: "add " + sig.deps.slice(0, 2).join(" and ") + (sig.deps.length > 1 ? " dependencies" : " dependency"),
        why: "new packages in package.json" });
    }
    if (sig.exportsAdded.length) {
      list.push({ subject: "add " + camelToWords(sig.exportsAdded[0]),
        why: "introduces exported " + sig.exportsAdded[0] });
    } else if (sig.funcs.length) {
      list.push({ subject: "add " + camelToWords(sig.funcs[0]),
        why: "new function " + sig.funcs[0] + "()" });
    }
    if (sig.errorMsgs.length) {
      var msg = sig.errorMsgs[0].toLowerCase();
      var startsWithVerb = /^(add|remove|handle|reject|guard|fix|validate|enforce|block|limit|expire)\b/.test(msg);
      list.push({
        subject: startsWithVerb ? msg : "handle " + msg,
        why: "error message found in diff: “" + sig.errorMsgs[0] + "”"
      });
    }
    if (sig.guards.length) {
      list.push({ subject: "guard against invalid " + camelToWords(sig.guards[0].split(".").pop()),
        why: "new null/validity check on " + sig.guards[0] });
    }
    if (!list.length) {
      var target = an.scope || baseName(an.files[0].path);
      list.push({ subject: "update " + target, why: "no strong signal found; kept conservative" });
    }

    var seen = {}, out = [];
    list.forEach(function (s) {
      if (!seen[s.subject]) { seen[s.subject] = 1; out.push(s); }
    });
    return out.slice(0, 3);
  }

  function textVariants(raw, an) {
    var orig = raw.trim();
    var list = [];
    var m;

    m = orig.match(/(\w[\w-]*)\s*(?:crash|crashes|fails?|error|bug|issue)\s+when\s+(?:the\s+)?([\w ]+?)\s+(?:is|are)\s+(empty|missing|null|undefined|invalid|not ?set)/i);
    if (m) {
      var action = m[1].toLowerCase();
      var cond = m[2].trim().split(/\s+/).pop().toLowerCase();
      var adj = m[3].toLowerCase() === "not set" ? "missing" : m[3].toLowerCase();
      list.push({ subject: "handle " + adj + " " + cond + " in " + action,
        why: "re-phrased: condition-first, drops the story" });
    }

    m = orig.match(/\b(?:update[sd]?|upgrade[d]?|bump(?:ed)?)\s+([\w@/.-]+)\s+to\s+(v?[\d][\w.-]*)/i);
    if (m) {
      list.push({ subject: "bump " + m[1] + " to " + m[2], why: "standard dependabot-style phrasing" });
    }

    m = orig.match(/\b(?:add(?:ed)?)\s+(?:the\s+)?([\w @\/.-]{3,40}?)\s+(?:feature|support)\b/i);
    if (m) {
      list.push({ subject: "add " + m[1].trim().toLowerCase(), why: "feature phrasing tightened" });
    }

    m = orig.match(/^(?:the\s+)?([\w @\/.-]{3,40}?)\s+(?:is|was)\s+(?:broken|crashing|failing)/i);
    if (m) {
      list.push({ subject: "fix " + m[1].trim().toLowerCase(), why: "state → action" });
    }

    var faithful = cleanSentence(orig);
    list.push({ subject: faithful, why: "your wording, cleaned to imperative" });

    var seen = {}, out = [];
    list.forEach(function (s) {
      if (!seen[s.subject]) { seen[s.subject] = 1; out.push(s); }
    });
    return out.slice(0, 3);
  }

  function diffBody(an) {
    var t = an.totals;
    var names = an.files.slice(0, 3).map(function (f) { return f.path; }).join(", ");
    var more = an.files.length > 3 ? " (+" + (an.files.length - 3) + " more)" : "";
    var lines = [];
    lines.push(an.files.length + " file" + (an.files.length > 1 ? "s" : "") + " changed: " + names + more);
    lines.push("+".concat(t.added, " / -", t.removed));
    var sig = an.signals;
    if (sig.errorMsgs.length) lines.push("Adds validation: " + sig.errorMsgs.slice(0, 2).map(function (s) { return "“" + s + "”"; }).join(", "));
    else if (sig.exportsAdded.length) lines.push("Introduces exported " + sig.exportsAdded[0] + ".");
    else if (sig.deps.length) lines.push("Adds " + sig.deps.join(", ") + ".");
    return lines.join("\n");
  }

  function textBody(orig) {
    var why = orig.match(/\b(?:because|since|so that|to)\s+(.+)/i);
    var lines = [];
    lines.push("What: " + cleanSentence(orig) + ".");
    if (why) lines.push("Why: " + why[1].replace(/[.!?]+$/, "") + ".");
    return lines.join("\n");
  }

  /* =====================================================
     STYLE PROFILE
  ===================================================== */

  function learnStyle(raw) {
    var subjects = raw.split("\n")
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0 && !/^#/.test(l); });
    if (subjects.length < 3) return null;

    var prof = {
      n: subjects.length, types: {}, scopes: {}, noScope: 0, convCount: 0,
      emojiCount: 0, lowerCount: 0, pastCount: 0, lens: [], medianLen: 0
    };

    subjects.forEach(function (s) {
      var m = s.match(CONV_RE);
      if (m) {
        prof.convCount++;
        prof.types[m[1]] = (prof.types[m[1]] || 0) + 1;
        if (m[2]) prof.scopes[m[2]] = (prof.scopes[m[2]] || 0) + 1;
        else prof.noScope++;
      }
      if (/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)) prof.emojiCount++;
      var body = m ? m[4] : s;
      if (/^[a-z]/.test(body)) prof.lowerCount++;
      if (/\b(added|fixed|updated|removed|changed|created|improved|refactored|made|implemented)\b/i.test(body)) prof.pastCount++;
      prof.lens.push(body.length);
    });

    prof.lens.sort(function (a, b) { return a - b; });
    var mid = Math.floor(prof.lens.length / 2);
    prof.medianLen = prof.lens.length % 2 ? prof.lens[mid] : Math.round((prof.lens[mid - 1] + prof.lens[mid]) / 2);
    return prof;
  }

  function applyProfile(an, subjs) {
    var p = state.profile;
    if (!p) return;
    if (p.convCount >= 5 && p.noScope / p.convCount > 0.6) an.scope = null;
    if (p.convCount >= 5 && p.lowerCount / p.n < 0.2) {
      subjs.forEach(function (s) { s.subject = titleCase(s.subject); });
    }
  }

  /* =====================================================
     GENERATE (diff / text)
  ===================================================== */

  function generate(input, mode, breakingFlag) {
    var an, subjs, bodyBase;

    if (mode === "diff") {
      var files = parseDiff(input);
      if (!files.length) return null;
      an = analyzeDiff(files, breakingFlag);
      subjs = diffSubjects(an);
      bodyBase = diffBody(an);
    } else {
      var text = input.trim();
      if (!text) return null;
      an = { type: typeFromText(text), scope: scopeFromText(text), note: "", breaking: breakingFlag };
      if (/\b(bump|upgrade[d]?|update[sd]?)\s+[\w@/.-]+\s+to\s+v?[\d]/i.test(text)) {
        an.type = "chore"; an.scope = "deps";
      }
      subjs = textVariants(text, an);
      bodyBase = textBody(text);
    }

    if (state.profile && state.applyStyle) applyProfile(an, subjs);

    var labels = ["recommended", "variant B", "variant C"];
    var variants = subjs.slice(0, 3).map(function (s, i) {
      return {
        label: labels[i],
        why: s.why,
        type: an.type,
        scope: s.scope === undefined ? an.scope : s.scope,
        breaking: an.breaking || s.breaking || false,
        subject: clampSubject(s.subject),
        body: i === 0 ? bodyBase : null
      };
    });

    return { analysis: an, variants: variants };
  }

  function renderFormat(v, fmt) {
    var scopePart = v.scope ? "(" + v.scope + ")" : "";
    var bang = v.breaking ? "!" : "";
    var subj = v.subject;
    switch (fmt) {
      case "emoji":
        return EMOJI[v.type] + " " + v.type + scopePart + bang + ": " + subj;
      case "simple":
        return titleCase(subj);
      case "detailed": {
        var out = v.type + scopePart + bang + ": " + subj + "\n\n" + (v.body || titleCase(subj) + ".");
        if (v.breaking) out += "\n\nBREAKING CHANGE: interface or behavior changed incompatibly — review before release.";
        return out;
      }
      default:
        return v.type + scopePart + bang + ": " + subj;
    }
  }

  /* =====================================================
     SQUASH / PR  mode
  ===================================================== */

  function generateSquash(raw) {
    var lines = parseSubjects(raw);
    if (!lines.length) return null;

    var parsed = lines.map(function (s) {
      var clean = stripEmoji(s);
      return { raw: s, m: clean.match(CONV_RE) };
    });

    var feats = parsed.filter(function (p) { return p.m && p.m[1] === "feat"; });
    var fixes = parsed.filter(function (p) { return p.m && p.m[1] === "fix"; });
    var dominant = feats.length ? "feat" : fixes.length ? "fix" : (parsed[0].m ? parsed[0].m[1].toLowerCase() : "chore");
    var leadParsed = parsed.filter(function (p) { return p.m && p.m[1].toLowerCase() === dominant; })[0] || parsed[0];

    var scopes = {};
    parsed.forEach(function (p) {
      if (p.m && p.m[2]) { var k = p.m[2].toLowerCase(); scopes[k] = (scopes[k] || 0) + 1; }
    });
    var topScope = Object.keys(scopes).sort(function (a, b) { return scopes[b] - scopes[a]; })[0] || null;

    var leadSubject = leadParsed.m ? leadParsed.m[4] : cleanSentence(leadParsed.raw);
    var leadType = leadParsed.m ? leadParsed.m[1].toLowerCase() : dominant;
    var title = leadType + (topScope ? "(" + topScope + ")" : "") + ": " + cleanSentence(leadSubject);

    var breaking = parsed.some(function (p) {
      return (p.m && p.m[3]) || /breaking/i.test(p.raw);
    });
    if (breaking) {
      title = leadType + (topScope ? "(" + topScope + ")" : "") + "!: " + cleanSentence(leadSubject);
    }

    var body = parsed.map(function (p) {
      if (p.m) return "- " + p.m[1].toLowerCase() + (p.m[2] ? "(" + p.m[2] + ")" : "") + ": " + p.m[4];
      return "- " + cleanSentence(p.raw);
    }).join("\n");

    var chips = [
      { label: "commits", value: String(lines.length) },
      { label: "dominant", value: dominant }
    ];
    if (topScope) chips.push({ label: "scope", value: topScope });
    if (breaking) chips.push({ label: "breaking", value: "flagged", warn: true });

    return {
      kind: "rows",
      chips: chips,
      recLabel: "squash commit title",
      rec: { msg: title },
      alts: [
        { label: "PR title", why: "same shape works as a PR title — GitHub's auto-squash default is worse", msg: title },
        { label: "squash body", why: "paste into the squash body box, or the PR description", msg: title + "\n\n" + body }
      ]
    };
  }

  /* =====================================================
     CHANGELOG mode
  ===================================================== */

  var CHANGELOG_GROUPS = [
    ["feat", "Features"], ["fix", "Bug Fixes"], ["perf", "Performance"],
    ["revert", "Reverts"], ["refactor", "Refactoring"], ["docs", "Docs"],
    ["test", "Tests"], ["build", "Build"], ["ci", "CI"], ["chore", "Maintenance"]
  ];

  function generateChangelog(raw) {
    var lines = parseSubjects(raw);
    if (!lines.length) return null;

    var version = "Unreleased";
    if (lines.length && /^v?[\d]/i.test(lines[0]) && !CONV_RE.test(lines[0])) {
      version = lines[0].replace(/^v/i, "");
      lines.shift();
    }
    if (!lines.length) return null;

    var date = new Date().toISOString().slice(0, 10);
    var groups = {};
    var breakingCount = 0;
    lines.forEach(function (s) {
      var clean = stripEmoji(s);
      var m = clean.match(CONV_RE);
      var t = m ? m[1].toLowerCase() : "other";
      if (VALID_TYPES.indexOf(t) === -1) t = "other";
      var bullet;
      if (m) {
        var isBreaking = !!m[3] || /breaking/i.test(clean);
        if (isBreaking) breakingCount++;
        var subj = cleanSentence(m[4]);
        bullet = "* " + (m[2] ? "**" + m[2].toLowerCase() + ":** " : "") + subj + (isBreaking ? " ⚠️" : "");
      } else {
        bullet = "* " + cleanSentence(clean);
      }
      (groups[t] = groups[t] || []).push(bullet);
    });

    var md = "## v" + version + " — " + date + "\n";
    CHANGELOG_GROUPS.forEach(function (g) {
      if (groups[g[0]] && groups[g[0]].length) {
        md += "\n### " + g[1] + "\n" + groups[g[0]].join("\n") + "\n";
        delete groups[g[0]];
      }
    });
    if (groups["other"]) {
      md += "\n### Other\n" + groups["other"].join("\n") + "\n";
    }

    var chips = [
      { label: "commits", value: String(lines.length) },
      { label: "version", value: "v" + version }
    ];
    if (breakingCount) chips.push({ label: "breaking", value: String(breakingCount), warn: true });

    return {
      kind: "rows",
      chips: chips,
      recLabel: "changelog.md",
      rec: { msg: md },
      alts: []
    };
  }

  /* =====================================================
     LINT mode
  ===================================================== */

  function lintMessage(raw) {
    var issues = [];
    var text = raw.trim();
    var m = text.split("\n")[0].match(CONV_RE);
    var type = null, scope = null, bang = false, subject = null;

    if (!m) {
      var g = typeFromText(text);
      var raw1 = text.split("\n")[0];
      issues.push({ level: "error", icon: "✗", text: "Missing type prefix — conventional format is “type(scope): subject”" });
      if (raw1.length > 72) {
        issues.push({ level: "error", icon: "✗", text: "Subject is " + raw1.length + " chars — over the 72 limit" });
      }
      type = g; scope = scopeFromText(text);
      subject = cleanSentence(raw1);
      issues.push({ level: "info", icon: "ℹ", text: "Best guess: prefixed with " + g + (scope ? "(" + scope + ")" : "") });
    } else {
      type = m[1].toLowerCase();
      scope = m[2] || null;
      bang = !!m[3];
      subject = m[4].trim();

      if (VALID_TYPES.indexOf(type) === -1) {
        issues.push({ level: "error", icon: "✗", text: "“" + m[1] + "” is not one of the 11 spec types (feat fix docs style refactor perf test build ci chore revert)" });
      }
      if (m[1] !== m[1].toLowerCase()) {
        issues.push({ level: "warn", icon: "⚠", text: "Type should be lowercase" });
      }
      if (scope && !/^[a-z0-9][a-z0-9\/_-]*$/.test(scope)) {
        issues.push({ level: "warn", icon: "⚠", text: "Scope “" + scope + "” should be lowercase, no spaces" });
      }
      if (!subject) {
        issues.push({ level: "error", icon: "✗", text: "Subject is empty" });
      } else {
        if (/^[A-Z][a-z]/.test(subject)) {
          issues.push({ level: "warn", icon: "⚠", text: "Subject starts capitalized — convention is lowercase" });
        }
        var fw = (subject.match(/^[A-Za-z]+/) || [""])[0].toLowerCase();
        if (PAST_TO_IMPERATIVE[fw]) {
          issues.push({ level: "error", icon: "✗", text: "Past tense “" + fw + "” — use imperative “" + PAST_TO_IMPERATIVE[fw] + "”" });
        }
        if (/[.!?\s。！？]$/.test(subject)) {
          issues.push({ level: "warn", icon: "⚠", text: "Drop the period — subjects are headlines" });
        }
        var L = subject.replace(/[.!?]+$/, "").length;
        if (L > 72) issues.push({ level: "error", icon: "✗", text: "Subject is " + L + " chars — over the 72 limit" });
        else if (L > 50) issues.push({ level: "warn", icon: "⚠", text: L + " chars — legal, but ≤50 reads best in git log --oneline" });
      }
    }

    if (bang) issues.push({ level: "info", icon: "ℹ", text: "“!” marks a breaking change — release tools will bump MAJOR" });
    if (/BREAKING CHANGE/i.test(text)) issues.push({ level: "info", icon: "ℹ", text: "BREAKING CHANGE footer present — good, include migration notes" });

    // build corrected
    var fsubj = (subject || "");
    fsubj = fsubj.replace(/[.!?\s]+$/, "");
    fsubj = fsubj.replace(/^[A-Za-z]+/, function (w) {
      var l = w.toLowerCase();
      if (PAST_TO_IMPERATIVE[l]) return PAST_TO_IMPERATIVE[l];
      return w.charAt(0).toLowerCase() + w.slice(1);
    });
    fsubj = fsubj.split(/\s+/).map(function (w, i) {
      if (i === 0 || !/[a-z]/.test(w)) return w; // keep first word + ALL-CAPS acronyms
      return w.replace(/(^|-)([A-Z])(?=[a-z])/g, function (_, sep, c) {
        return sep + c.toLowerCase();
      });
    }).join(" ");
    if (fsubj.length > 72) fsubj = fsubj.slice(0, 71) + "…";
    var fixed = (VALID_TYPES.indexOf(type) > -1 ? type : "chore") +
      (scope ? "(" + scope.toLowerCase() + ")" : "") +
      (bang ? "!" : "") + ": " + fsubj;

    var errors = issues.filter(function (i) { return i.level === "error"; }).length;
    var warns = issues.filter(function (i) { return i.level === "warn"; }).length;
    var verdict = errors ? "needs work — " + errors + " error" + (errors > 1 ? "s" : "")
      : warns ? "close — " + warns + " nit" + (warns > 1 ? "s" : "")
      : "ship it";

    return { issues: issues, fixed: fixed, verdict: verdict };
  }

  /* =====================================================
     UNIFIED RUN
  ===================================================== */

  function run(input, mode, breakingFlag) {
    if (mode === "diff" || mode === "text") {
      var r = generate(input, mode, breakingFlag);
      if (!r) return null;
      r.kind = "variants";
      r.recLabel = "recommended";
      return r;
    }
    if (mode === "squash") return generateSquash(input);
    if (mode === "changelog") return generateChangelog(input);
    if (mode === "lint") {
      if (!input.trim()) return null;
      var res = lintMessage(input);
      return {
        kind: "lint",
        chips: [{ label: "verdict", value: res.verdict, warn: res.verdict.indexOf("ship") === -1 }],
        recLabel: "corrected message",
        rec: { msg: res.fixed },
        issues: res.issues,
        alts: []
      };
    }
    return null;
  }

  /* =====================================================
     HISTORY
  ===================================================== */

  var HIST_KEY = "cs_history";

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; }
    catch (e) { return []; }
  }

  function pushHistory(rec) {
    var h = loadHistory();
    h.unshift({ ts: Date.now(), text: rec.split("\n")[0] });
    if (h.length > 20) h.length = 20;
    try { localStorage.setItem(HIST_KEY, JSON.stringify(h)); } catch (e) {}
    renderHistory();
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderHistory() {
    var h = loadHistory();
    var section = document.querySelector(".history");
    if (!h.length) { if (section) section.remove(); return; }
    if (!section) {
      section = document.createElement("section");
      section.className = "history wrap";
      var main = document.querySelector("main");
      var faq = document.querySelector(".faq");
      main.insertBefore(section, faq);
    }
    var html = "<h2>Recent commits</h2><p class='h-note'>last " + h.length + " · stored in this browser · click to copy</p>";
    h.forEach(function (item, i) {
      var d = new Date(item.ts);
      var time = ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) + " " +
                 ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
      html += "<div class='hist-item' data-i='" + i + "'><time>" + time + "</time><code>" +
        escapeHtml(item.text) + "</code></div>";
    });
    section.innerHTML = html;
    Array.prototype.forEach.call(section.querySelectorAll(".hist-item"), function (el) {
      el.addEventListener("click", function () {
        copyText(h[+el.dataset.i].text);
        toast("copied to clipboard");
      });
    });
  }

  /* =====================================================
     CLIPBOARD + TOAST
  ===================================================== */

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
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

  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1600);
  }

  /* =====================================================
     UI
  ===================================================== */

  function showError(msg) {
    var el = $("error");
    el.textContent = msg;
    el.hidden = false;
  }
  function clearError() { $("error").hidden = true; }

  function chipHtml(c) {
    return "<span class='chip" + (c.warn ? " chip-warn" : " neutral") + "'><b>" +
      escapeHtml(c.label) + "</b> " + escapeHtml(c.value) + "</span>";
  }

  function renderResult(r) {
    var chipsEl = $("analysis");
    if (r.chips && r.chips.length) {
      chipsEl.innerHTML = r.chips.map(chipHtml).join("");
      chipsEl.hidden = false;
    } else if (r.analysis) {
      var an = r.analysis;
      var chipsHtml = "";
      chipsHtml += chipHtml({ label: "type", value: an.type });
      if (an.scope) chipsHtml += chipHtml({ label: "scope", value: an.scope });
      if (state.mode === "diff") {
        chipsHtml += chipHtml({ label: "files", value: String(an.files.length) });
        chipsHtml += chipHtml({ label: "lines", value: "+" + an.totals.added + " / -" + an.totals.removed });
      }
      if (an.breaking) chipsHtml += chipHtml({ label: "breaking", value: "flagged", warn: true });
      if (an.note) chipsHtml += chipHtml({ label: "note", value: an.note });
      chipsEl.innerHTML = chipsHtml;
      chipsEl.hidden = false;
    } else {
      chipsEl.hidden = true;
    }

    // format switch visibility
    var showFmt = r.kind === "variants";
    $("fmt-switch").hidden = !showFmt;

    // recommended
    $("rec-label").textContent = r.recLabel || "recommended";
    var recMsg;
    if (r.kind === "variants") {
      recMsg = renderFormat(r.variants[0], state.fmt);
    } else {
      recMsg = r.rec.msg;
    }
    $("rec-msg").textContent = recMsg;
    $("rec-block").hidden = false;

    // alternatives / lint issues
    var altsEl = $("alts");
    var html = "";

    if (r.kind === "lint" && r.issues) {
      r.issues.forEach(function (iss) {
        html += "<div class='alt-row lint-row lv-" + iss.level + "'>" +
          "<div class='alt-side'><span class='alt-label'>" + iss.icon + " " + iss.level + "</span></div>" +
          "<div class='alt-why plain'>" + escapeHtml(iss.text) + "</div>" +
          "<span></span></div>";
      });
    } else if (r.alts && r.alts.length) {
      r.alts.forEach(function (a, i) {
        html += "<div class='alt-row'>" +
          "<div class='alt-side'><span class='alt-label'>" + escapeHtml(a.label) + "</span>" +
          "<span class='alt-why'>" + escapeHtml(a.why || "") + "</span></div>" +
          "<code class='alt-msg'>" + escapeHtml(a.msg) + "</code>" +
          "<button class='copy' data-idx='" + i + "'>copy</button>" +
          "</div>";
      });
    }

    if (html) {
      altsEl.innerHTML = html;
      altsEl.hidden = false;
      Array.prototype.forEach.call(altsEl.querySelectorAll(".copy"), function (btn) {
        btn.addEventListener("click", function () {
          var item = r.alts[+btn.dataset.idx];
          copyText(item.msg);
          btn.classList.add("done");
          btn.textContent = "copied";
          setTimeout(function () { btn.classList.remove("done"); btn.textContent = "copy"; }, 1400);
          pushHistory(item.msg);
        });
      });
    } else {
      altsEl.hidden = true;
    }

    $("results").hidden = false;
  }

  function doGenerate() {
    clearError();
    var input = $("input").value;
    if (!input.trim()) {
      showError("Paste something first — diff, description, or commit subjects.");
      return;
    }
    var breaking = $("breaking").checked;
    var result = run(input, state.mode, breaking);
    if (!result) {
      showError(MODES[state.mode].hint);
      return;
    }
    state.last = result;
    renderResult(result);
    var recMsg = result.kind === "variants"
      ? renderFormat(result.variants[0], state.fmt)
      : result.rec.msg;
    pushHistory(recMsg);
  }

  function setFmt(fmt) {
    state.fmt = fmt;
    Array.prototype.forEach.call(document.querySelectorAll(".fmt-btn"), function (b) {
      b.classList.toggle("is-active", b.dataset.fmt === fmt);
    });
    if (state.last && state.last.kind === "variants") renderResult(state.last);
  }

  function setMode(mode) {
    state.mode = mode;
    var cfg = MODES[mode];
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.classList.toggle("is-active", t.dataset.mode === mode);
    });
    $("input").placeholder = cfg.placeholder;
    $("diff-hint").textContent = cfg.hint;
    $("rec-label").textContent = cfg.recLabel;
    $("fmt-switch").hidden = !cfg.formats;

    // sample links visibility
    ["sample-diff", "sample-text", "sample-squash", "sample-changelog", "sample-lint"].forEach(function (id) {
      var el = $(id);
      if (el) el.hidden = cfg.samples.indexOf(id) === -1;
    });
    $("breaking-wrap").hidden = (mode !== "diff" && mode !== "text");

    clearError();
    $("results").hidden = true;
  }

  var SAMPLES = {
    "sample-diff": function () { return SAMPLE_DIFF; },
    "sample-text": function () { return SAMPLE_TEXT; },
    "sample-squash": function () { return SAMPLE_SQUASH; },
    "sample-changelog": function () { return SAMPLE_CHANGELOG; },
    "sample-lint": function () { return SAMPLE_LINT; }
  };

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (tab) {
      tab.addEventListener("click", function () { setMode(tab.dataset.mode); });
    });

    $("input").addEventListener("input", function () {
      $("char-count").textContent = this.value.length + " chars";
      clearError();
    });

    $("input").addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        doGenerate();
      }
    });

    $("generate").addEventListener("click", doGenerate);

    Array.prototype.forEach.call(document.querySelectorAll(".fmt-btn"), function (b) {
      b.addEventListener("click", function () { setFmt(b.dataset.fmt); });
    });

    $("rec-copy").addEventListener("click", function () {
      if (!state.last) return;
      copyText($("rec-msg").textContent);
      toast("copied to clipboard");
    });

    Object.keys(SAMPLES).forEach(function (id) {
      var el = $(id);
      if (el) {
        el.addEventListener("click", function (e) {
          e.preventDefault();
          var text = SAMPLES[id]();
          $("input").value = text;
          $("char-count").textContent = text.length + " chars";
          doGenerate();
        });
      }
    });

    // style learner
    try {
      var saved = localStorage.getItem("cs_style_profile");
      if (saved) {
        state.profile = JSON.parse(saved);
        renderProfile(state.profile);
      }
    } catch (e) {}

    var learnBtn = $("learn");
    if (learnBtn) learnBtn.addEventListener("click", function () {
      var prof = learnStyle($("style-input").value);
      if (!prof) { toast("paste at least 3 commit subjects"); return; }
      state.profile = prof;
      try { localStorage.setItem("cs_style_profile", JSON.stringify(prof)); } catch (e) {}
      renderProfile(prof);
      toast("style learned — stays in this browser");
    });

    var scBtn = $("style-clear");
    if (scBtn) scBtn.addEventListener("click", function () {
      state.profile = null;
      localStorage.removeItem("cs_style_profile");
      $("profile").hidden = true;
      $("style-clear").hidden = true;
      $("apply-wrap").hidden = true;
      $("style-input").value = "";
      toast("style profile wiped");
    });

    var asWrap = $("apply-style");
    if (asWrap) asWrap.addEventListener("change", function () {
      state.applyStyle = this.checked;
    });

    var ch = $("clear-history");
    if (ch) {
      ch.addEventListener("click", function () {
        localStorage.removeItem(HIST_KEY);
        renderHistory();
        toast("history cleared");
      });
    }

    renderHistory();
  }

  function renderProfile(prof) {
    var chips = [];
    chips.push(prof.n + " commits learned");
    var typeParts = Object.keys(prof.types)
      .sort(function (a, b) { return prof.types[b] - prof.types[a]; })
      .slice(0, 4)
      .map(function (t) { return t + " " + Math.round(prof.types[t] / prof.n * 100) + "%"; });
    if (typeParts.length) chips.push(typeParts.join(" · "));
    var scopeKeys = Object.keys(prof.scopes);
    if (scopeKeys.length) {
      chips.push("scopes: " + scopeKeys.sort(function (a, b) { return prof.scopes[b] - prof.scopes[a]; }).slice(0, 4).join(", "));
    } else if (prof.convCount && prof.noScope / prof.convCount > 0.6) {
      chips.push("rarely uses scopes");
    }
    chips.push("median " + prof.medianLen + " chars");
    if (prof.emojiCount / prof.n > 0.4) chips.push("uses emoji");
    if (prof.pastCount / prof.n > 0.5) chips.push("past-tense voice");
    else if (prof.convCount >= 5) chips.push("imperative voice");

    var el = $("profile-chips");
    el.innerHTML = "";
    chips.forEach(function (c, i) {
      var span = document.createElement("span");
      span.className = "chip" + (i === 0 ? " neutral" : "");
      span.textContent = c;
      el.appendChild(span);
    });
    $("profile").hidden = false;
    $("style-clear").hidden = false;
    $("apply-wrap").hidden = false;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // test hook (no-op in normal use)
  if (typeof window !== "undefined") {
    window.__cs = {
      parseDiff: parseDiff,
      generate: generate,
      learnStyle: learnStyle,
      renderFormat: renderFormat,
      run: run,
      lintMessage: lintMessage,
      generateSquash: generateSquash,
      generateChangelog: generateChangelog,
      parseSubjects: parseSubjects,
      typeFromText: typeFromText,
      scopeFromText: scopeFromText
    };
  }
})();
