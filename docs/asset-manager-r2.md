# 素材管理 R2 部署说明

## 1. 创建 Cloudflare R2 Bucket

1. 登录 Cloudflare Dashboard。
2. 进入 R2 Object Storage。
3. 创建 bucket：`asset-manager`。
4. 如需公开访问，绑定自定义域名：`assets.hnchpower.cn`。

## 2. 部署 Worker

复制示例配置：

```bash
cp workers/wrangler.toml.example workers/wrangler.toml
```

安装并登录 Wrangler 后部署：

```bash
cd workers
wrangler login
wrangler secret put ASSET_MANAGER_TOKEN
wrangler deploy
```

`ASSET_MANAGER_TOKEN` 是前端上传、编辑、删除时使用的管理 Token，不要写进仓库。

## 3. wrangler.toml 关键配置

```toml
name = "asset-manager-worker"
main = "asset-manager-worker.js"
compatibility_date = "2026-05-11"

[[r2_buckets]]
binding = "ASSETS_BUCKET"
bucket_name = "asset-manager"

[vars]
R2_PUBLIC_BASE_URL = "https://assets.hnchpower.cn"
ALLOWED_ORIGINS = "https://privacy.hnchpower.cn,http://localhost:8080"
```

## 4. 环境变量

- `ASSET_MANAGER_TOKEN`：管理 Token，通过 `wrangler secret put` 设置。
- `R2_PUBLIC_BASE_URL`：R2 公开访问域名，例如 `https://assets.hnchpower.cn`。
- `ALLOWED_ORIGINS`：允许访问 Worker API 的前端域名，逗号分隔。
- `ASSETS_BUCKET`：R2 bucket binding。

## 5. 前端配置 Worker API 地址

打开：

```txt
https://privacy.hnchpower.cn/tools/asset-manager/
```

在页面顶部填写：

- Worker API 地址，例如 `https://asset-manager-worker.xxx.workers.dev`
- 管理 Token

保存后进入 R2 云端模式。未配置 API 地址时，页面会进入本地演示模式。

## 6. 本地测试

```bash
cd /Users/Admin/Downloads/在线抠图
python3 -m http.server 8080
```

访问：

```txt
http://localhost:8080/tools/asset-manager/
```

不配置 Worker API 时可测试：

- 上传素材
- 读取图片尺寸
- 自动分类
- 搜索筛选
- CSV 导出

## 7. 常见错误

- `Unauthorized`：Token 错误或未填写。
- `CORS`：检查 `ALLOWED_ORIGINS` 是否包含当前前端域名。
- 上传成功但打不开公开链接：检查 R2 自定义域名 `assets.hnchpower.cn` 是否绑定并启用公开访问。
- 列表为空：确认 Worker binding 名称是 `ASSETS_BUCKET`，bucket 名称是 `asset-manager`。
