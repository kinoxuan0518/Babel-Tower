## Babel Tower – MVP (Chrome Extension)

Babel Tower 是一个“认知翻译层”MVP：用户在网页中选中价格等文本后，弹出轻量卡片，用你熟悉的货币体系和认知单位（例如“地铁”“奶茶”）进行解释与锚定，帮助快速理解与比较。

### 特性
- 选区触发卡片：在任意页面选中类似 “$19.99 / 49,90 € / £540 / HK$199” 的价格，自动识别并弹出解释卡片。
- 多币种识别：支持常见货币符号/代码与本地化数字格式（1,234.56 / 1.234,56 / 199,- 等）。
- 实时汇率：后台从多个公开数据源并行获取汇率并缓存，内容脚本自动应用（网络不佳时回退内置近似汇率）。
- 目标货币可选：在设置页选择你擅长的展示货币（默认 CNY）。
- 自定义认知单位：在设置页定义单位名与单位成本（例如“地铁：5.00 CNY”），卡片会显示“约等于 X 地铁（1 地铁 ≈ CNY 5.00）”。
- LLM 可选：可在 `profile.json` 中配置 LLM 接口，优先走 LLM 生成认知解释，失败或未配置则回退启发式。

### 安装与加载
1. 打开 Chrome，访问 `chrome://extensions`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序（Load unpacked）”，选择本文件夹 `babel_tower_mvp`。
4. 建议固定扩展图标到工具栏，点击可快速打开设置。

### 使用
- 在任意页面选中价格文本，几百毫秒后会出现卡片。
- 卡片右下角齿轮可直接打开设置页；或点击工具栏图标打开设置。

### 设置项（Options）
- 目标货币：覆盖 `profile.json` 中的 `user_context.currency`，用于卡片主展示。
- 实时汇率：显示最近更新时间，支持“一键刷新”。
- 认知单位（自定义）：输入单位名（不带“次/杯”等量词）与单位成本（按当前目标货币计价）。
- LLM（可选）：在 `profile.json` 写入
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
- `content.js`：内容脚本，识别价格、展示卡片、读取配置/汇率。
- `styles.css`：卡片样式。
- `background.js`：后台 Service Worker，定时并行拉取汇率，写入 `chrome.storage`。
- `options.html` / `options.js`：设置页（目标货币、刷新汇率、自定义认知单位）。
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

