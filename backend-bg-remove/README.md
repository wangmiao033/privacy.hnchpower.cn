# 在线抠图后端服务

这是 `tools/bg-remove/` 的独立抠图 API 服务，不作为 `privacy.hnchpower.cn` 静态页面部署。

## 本地启动

```bash
cd backend-bg-remove
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

健康检查：

```bash
curl http://localhost:8000/health
```

抠图接口：

```bash
curl -X POST http://localhost:8000/api/remove-background \
  -F "file=@/path/to/image.png" \
  -F "mode=standard" \
  --output bg-removed.png
```

`mode` 可选：

- `standard`：通用图片，速度较快。
- `fine`：启用 alpha matting，适合发丝、半透明边缘。
- `anime`：插画/二次元/游戏海报素材优先。

## Docker 启动

```bash
cd backend-bg-remove
docker build -t hn-bg-remove .
docker run --rm -p 8000:8000 hn-bg-remove
```

## Render 一键部署（推荐）

仓库根目录已有 **`render.yaml`**（Blueprint）。

1. 打开 [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**。
2. 连接 GitHub 仓库 **`wangmiao033/privacy.hnchpower.cn`**（或你 fork 的地址），选中分支 **`main`**。
3. **Apply**，等待 Docker 构建完毕（首次约 10～20 分钟，镜像较大）。
4. 服务就绪后会得到 **`https://xxxx.onrender.com`**，浏览器访问 `https://xxxx.onrender.com/health` 应看见 `{"status":"ok"}`。
5. 打开本站 **`tools/bg-remove/bg-remove-config.js`**，设置：
   ```javascript
   global.BG_REMOVE_API_BASE_URL = "https://xxxx.onrender.com";
   ```
6. 提交并部署静态站；抠图页即可使用该 API。

说明：免费实例冷启动可能较慢；首次抠图会下载 ONNX 模型，有可能超时，可多试一次。

### Vercel 托管前端时（推荐做法）

仓库根目录已提供 **`npm run build`**（执行 `scripts/inject-bg-remove-config.js`），构建时会按环境变量写入抠图 API 地址。

1. 在 [Vercel](https://vercel.com) 打开本项目 → **Settings → Environment Variables**。
2. 新增 **`BG_REMOVE_API_BASE_URL`**，值为抠图服务的 HTTPS 根地址（无末尾 `/`），作用域勾选 **Production**（Preview 如需单独测试可再加）。
3. **Save** 后在 **Deployments** 里对最新部署 **Redeploy**。

勿把带真实 API 地址的 `bg-remove-config.js` 生成结果误提交到 Git；本地跑 `npm run build` 前若未设置该变量，会写入空字符串（与开发默认一致）。

## 部署说明

- 静态站继续部署到 `privacy.hnchpower.cn`。
- 本目录需要单独部署到 **Render、Koyeb、Railway、自有 VPS + Docker** 等，并确保公网 **HTTPS** 可访问健康检查 `GET /health`。
- 部署完成后，在静态站仓库里编辑 **`tools/bg-remove/bg-remove-config.js`**，将 `BG_REMOVE_API_BASE_URL` 设为你的服务根地址（无末尾斜杠），例如 `https://hn-bg-remove.onrender.com`。
- 公网用户浏览器**不能**访问你个人电脑上的 `http://localhost:8000`；未配置时，线上页面会显示「未配置」而不是误连本机。

### 同域反代（可选）

若希望 API 与主站同域（如 `https://privacy.hnchpower.cn/bg-api`），在 Nginx 等反代到本服务后，将 `bg-remove-config.js` 中地址写成该前缀即可（仍须为 HTTPS）。
