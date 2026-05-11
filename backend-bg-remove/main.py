"""抠图 API 入口：挂载额外路由后供 uvicorn main:app 启动。"""
from app import app


@app.get("/")
def root():
    return {"status": "ok", "service": "bg-remove-api"}


@app.get("/health")
def health():
    return {"status": "ok"}
