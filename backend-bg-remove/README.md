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
  --output bg-removed.png
```

## Docker 启动

```bash
cd backend-bg-remove
docker build -t hn-bg-remove .
docker run --rm -p 8000:8000 hn-bg-remove
```

## 部署说明

- 静态站继续部署到 `privacy.hnchpower.cn`。
- 本目录需要单独部署到 Render、Koyeb、Railway 或 Docker 服务器。
- 前端 API 地址配置在 `tools/bg-remove/bg-remove.js` 顶部：

```js
const API_BASE_URL = window.BG_REMOVE_API_BASE_URL || "http://localhost:8000";
```

上线后可以改成：

```js
const API_BASE_URL = window.BG_REMOVE_API_BASE_URL || "https://bgapi.hnchpower.cn";
```
