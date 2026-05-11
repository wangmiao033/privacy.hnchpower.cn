"""抠图 API 入口：CORS、额外路由；供 uvicorn main:app 启动。"""
from fastapi.middleware.cors import CORSMiddleware

from app import app

ALLOWED_ORIGINS = [
    "https://privacy.hnchpower.cn",
    "https://www.privacy.hnchpower.cn",
    "https://privacy.hnchpower-cn.onrender.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok", "service": "bg-remove-api"}


@app.get("/health")
def health():
    return {"status": "ok"}
