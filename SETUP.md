# UnitDoctor（unitdoctor.online）— 一次性配置手册

> 目标：配置做完这一次，以后**所有更新都只需要一条命令**（push 到 GitHub），
> 测试自动跑、部署自动执行、版本自动生效。你不需要再碰 Cloudflare 或代码细节。

---

## 第一步：买域名 + DNS 搬家（15 分钟）— ✅ 域名已在腾讯云购买 2026-09-05

域名在哪家买都行，但 **Workers 绑定域名要求 DNS 托管在 Cloudflare**，所以要做一次免费的 DNS 搬家（不改注册商，域名还是腾讯云的）：

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com) → 首页 **Add a site（添加站点）** → 输入 `unitdoctor.online`
2. 套餐选 **Free**（最下面那个，$0/年）
3. Cloudflare 会自动扫描现有 DNS 记录，直接下一步
4. Cloudflare 给你 **2 个 nameserver 地址**（形如 `xxx.ns.cloudflare.com`），复制下来
5. 回腾讯云控制台 → **域名注册 → 我的域名** → 找到 unitdoctor.online → **管理 → 修改 DNS 服务器** → 把默认的 DNSPod（`*.dnspod.net`）换成 Cloudflare 给的那 2 个 → 保存
6. 回 Cloudflare 点 **Check nameservers**，生效一般 10 分钟～2 小时（不影响下一步操作，可以并行做后面几步）

## 第二步：建 GitHub 仓库（5 分钟）

1. GitHub → New repository → 名称 `unitdoctor`，Public（Private 也行，Actions 免费额度够用）
2. 不要初始化 README

## 第三步：本地首次推送（我来做，或你复制粘贴）

在 `v1` 目录下执行：

```bash
git init
git add -A
git commit -m "v3.0: systemd toolbox + commit tools, 149 tests green"
git branch -M main
git remote add origin https://github.com/<你的用户名>/unitdoctor.git
git push -u origin main
```

## 第四步：Cloudflare 一次性授权（10 分钟，最关键的一步）

1. Cloudflare Dashboard → 右侧栏复制 **Account ID**
2. 右上角头像 → **My Profile → API Tokens → Create Token**
   - 模板选 **Edit Cloudflare Workers**
   - Account Resources 选你的账户
   - 创建后**立刻复制 Token**（只显示一次）
3. GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**，加两条：
   - `CLOUDFLARE_API_TOKEN` = 刚才的 Token
   - `CLOUDFLARE_ACCOUNT_ID` = 你的 Account ID

## 第五步：绑定域名（5 分钟）

1. Cloudflare Dashboard → **Workers & Pages → unitdoctor（部署成功后出现）→ Settings → Domains & Routes → Add → Custom domain** → 填 `unitdoctor.online`
2. 再加一个 `www.unitdoctor.online`
3. DNS 记录 Cloudflare 会自动创建，等证书生效（约 1-5 分钟）

## 第六步：提交 Google 收录（10 分钟，docx 原则）

1. [Google Search Console](https://search.google.com/search-console) → Add property → Domain → 填 `unitdoctor.online`
2. 按提示把 TXT 记录加到 Cloudflare DNS 验证
3. 验证后 → Sitemaps → 提交 `https://unitdoctor.online/sitemap.xml`
4. Plausible（可选，docx 推荐的无 Cookie 统计）：注册 plausible.io（付费）或自托管；先把 GSC 跑起来也够用

---

## ✅ 配置完成后的日常操作（只需这一条）

以后任何改动（我改完代码并跑绿测试后）：

```bash
git add -A && git commit -m "说明" && git push
```

推送后 GitHub Actions 自动执行：
1. 跑 `test_engine.js`（65 条断言，commit 四件套）
2. 跑 `test_systemd.js`（84 条断言，systemd 四件套）
3. 逐个 `node --check` 全部页面脚本
4. **全部绿 → wrangler deploy → 线上 1 分钟内更新**
5. 任何一条红 → 不部署，线上保持上一个可用版本

「加新工具 = 繁衍」：一个新 HTML 页 + 引擎函数 + 首页瓦片 + sitemap 一行，
push 即上线，无需任何人工审批环节。

## 应急手动部署

GitHub Actions 挂了或想立即上线：在 v1 目录 `npx wrangler deploy`（需本地 `wrangler login` 一次）。
