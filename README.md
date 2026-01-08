## Babel Tower (Chrome Extension)

Babel Tower 是一个“认知翻译层”的插件：用户在网页中选中价格等文本后，弹出轻量卡片，用你熟悉的货币体系和认知单位（例如“地铁”“奶茶”）进行解释与锚定，帮助快速理解与比较。

### 特性
- 安静模式：默认不打扰，右键“解释选中内容”或点图标触发。
- 特性优先：在音箱/蛋白粉等产品页，优先解释“卖点/特性”（使用者/购买者视角），不跑去讲包装尺寸。
- 尺码与包装：衣物“实际尺寸”两行固定结构；服装/音频/补剂等页面的“packing 尺寸”不出卡，装备才展示“体积 + 直觉对比 + 占比”。
- 多币种识别：支持常见货币符号/代码与本地化数字（1,234.56 / 1.234,56 / 199,-）。价格走本地启发式（更快更稳）。
- 实时汇率：后台并行多源获取并缓存，离线回退近似汇率。
- 目标货币可选：设置页选择展示货币（默认 CNY）。
- 自定义认知单位：设置“单位名 + 单位成本”（如“地铁：5.00 CNY”），卡片显示“约等于 X 单位”。
- LLM 可选：提供商选择 + 一键测试 + 本地 Key 保存；用于“特性/术语/装备packing”的认知解释。
- 页面意图：若启发式不确定，仅在本页首次调用一次小体量 LLM 分类，缓存后复用，减少 Token。
- 卡片体验：可拖拽移动；底部可选“翻译”行（默认开启，可在设置关闭）。

### 安装与加载
1. 打开 Chrome，访问 `chrome://extensions`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序（Load unpacked）”，选择本文件夹 `babel_tower_mvp`。
4. 建议固定扩展图标到工具栏，点击可快速打开设置。

### 使用
- 选中文本 → 右键菜单 “Babel Tower: 解释选中内容”；或点击工具栏图标（安静模式下）。
- 卡片两行结构：Insight（要点）+ Anchor（提示/注意点）；底部可选显示“翻译”。

### 设置项（Options）
- 目标货币：覆盖 `profile.json` 的 `user_context.currency` 用于卡片主展示。
- 实时汇率：显示最近更新时间，支持“一键刷新”。
- 认知单位（自定义）：输入单位名（不带“次/杯”等量词）与单位成本（按当前目标货币计价）。
- 交互方式：安静模式（仅用户触发时显示）。
- 文本翻译：显示/隐藏“翻译”行（默认开启），并可选择翻译语言（中文/English/中英双语）。
- LLM 设置（可选）：
  - 提供商选择（OpenAI/DeepSeek/Moonshot/Groq/Together/Perplexity/自定义），自动填 Endpoint/Model；仅需填写 Key。
  - 一键“测试 LLM”。
  - “非价格场景优先用大模型”开关（尺码/术语/卖点）。
- 身体数据（用于尺码解释）：身高/体重/脚长/版型偏好。
  - 隐私：身体数据仅保存在浏览器 `chrome.storage.local`（本机），不会上传；可随时清除。
  - LLM Key 同样仅存本机 `chrome.storage.local`。
  {
    "llm": {
      "provider": "openai",
      "endpoint": "https://api.openai.com/v1/chat/completions",
      "api_key": "YOUR_API_KEY",
      "model": "gpt-4o-mini"
    }
  }
  注意：把密钥放在内容脚本会暴露到网页上下文，生产建议改为 Service Worker 代理或你自己的后端代理。

### 目录结构（关键文件）
- `manifest.json`：扩展清单（MV3）。
- `content.js`：内容脚本，识别选区、页面上下文/意图、展示卡片、读取配置/汇率/LLM、启发式/LLM 解释。
- `styles.css`：卡片样式。
- `background.js`：后台 Service Worker，定时并行拉取汇率，写入 `chrome.storage`。
- `options.html` / `options.js`：设置页（目标货币、刷新汇率、交互与翻译开关、自定义认知单位、LLM 提供商选择与测试、身体数据）。
- `profile.json`：示例用户配置与基准锚点（也可放 LLM 配置）。
- `icons/`：扩展图标（`icon16/19/32/38/48/128.png`）。

### 汇率数据
- 多源并行，先返回者用之：
  - exchangerate.host
  - api.frankfurter.app
  - open.er-api.com
  - jsdelivr currency-api 镜像
  - Cloudflare Pages currency-api 镜像
- 每 4 小时自动刷新；设置页支持手动刷新。

### 常见问题
- 选中后不弹卡片：
  - 重新加载扩展后，刷新页面；
  - 确认选区包含货币符号或代码（仅数字可能不触发）；
  - 打开控制台应看到 `Babel Tower: content script loaded` 与 `Profile loaded` 日志。
- 重新加载扩展后报“Extension context invalidated”：刷新当前标签页重载内容脚本。
- 网络差导致汇率刷新失败：稍后再试；已做超时与多源并行，通常可恢复。

### 发布到 GitHub
在仓库根（`babel_tower_mvp`）执行：

```
# 初始化与首次提交
cd babel_tower_mvp
git init
git add .
git commit -m "feat: initial MVP Chrome extension"

# 方式 A：GitHub CLI 一键创建并推送
gh auth login
gh repo create Babel-Tower-MVP --public --source=. --remote=origin --push

# 方式 B：手动添加远程再推送
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

### 开发提示
- 修改代码后，回到 `chrome://extensions` 点击“重新加载”，并刷新目标页即可。
- 若对 LLM 安全敏感，建议改为：内容脚本 → `chrome.runtime.sendMessage` → 后台 Service Worker → 你的后端代理（持密钥）。

—
如需更换图标：把原始图片放到 `icons/source_tower.jpg`，可一键生成各尺寸 PNG 并覆盖 manifest 配置所指向的图标。
