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

## 部署说明

- 静态站继续部署到 `privacy.hnchpower.cn`。
- 本目录需要单独部署到 **Render、Koyeb、Railway、自有 VPS + Docker** 等，并确保公网 **HTTPS** 可访问健康检查 `GET /health`。
- 部署完成后，在静态站仓库里编辑 **`tools/bg-remove/bg-remove-config.js`**，将 `BG_REMOVE_API_BASE_URL` 设为你的服务根地址（无末尾斜杠），例如 `https://hn-bg-remove.onrender.com`。
- 公网用户浏览器**不能**访问你个人电脑上的 `http://localhost:8000`；未配置时，线上页面会显示「未配置」而不是误连本机。

### 同域反代（可选）

若希望 API 与主站同域（如 `https://privacy.hnchpower.cn/bg-api`），在 Nginx 等反代到本服务后，将 `bg-remove-config.js` 中地址写成该前缀即可（仍须为 HTTPS）。
