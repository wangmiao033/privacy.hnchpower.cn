"""HN Tools 处理 API 入口。

表格转 PDF 保持轻量启动；只有收到通用抠图请求时才加载 rembg / onnxruntime，
避免 LibreOffice 与 AI 模型同时占用 Render 小规格实例的内存。
"""

import asyncio
import gc
import importlib
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response


ALLOWED_ORIGINS = [
    "https://privacy.hnchpower.cn",
    "https://www.privacy.hnchpower.cn",
    "https://privacy-hnchpower-cn.onrender.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

MAX_SPREADSHEET_SIZE = 20 * 1024 * 1024
ALLOWED_SPREADSHEET_EXTENSIONS = {".xlsx", ".xls", ".xlsm", ".ods", ".csv"}
LIBREOFFICE_BINARY = shutil.which("libreoffice") or shutil.which("soffice")

# Render 免费实例内存有限：抠图和 LibreOffice 转换串行执行。
HEAVY_TASK_LOCK = asyncio.Lock()
_BACKGROUND_APP = None
_BACKGROUND_MODULE = None

core_app = FastAPI(title="HN Tools Processing API")


@core_app.get("/")
def root():
    return {"status": "ok", "service": "hn-tools-processing-api"}


@core_app.get("/health")
def health():
    return {
        "status": "ok",
        "spreadsheet_to_pdf": bool(LIBREOFFICE_BINARY),
    }


@core_app.post("/api/spreadsheet-to-pdf")
async def spreadsheet_to_pdf(file: UploadFile = File(...)):
    original_name = Path(file.filename or "spreadsheet.xlsx").name
    suffix = Path(original_name).suffix.lower()

    if suffix not in ALLOWED_SPREADSHEET_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="仅支持 XLSX、XLS、XLSM、ODS 和 CSV 表格文件。",
        )

    content = await file.read()
    await file.close()

    if not content:
        raise HTTPException(status_code=400, detail="上传的表格文件为空。")

    if len(content) > MAX_SPREADSHEET_SIZE:
        raise HTTPException(status_code=413, detail="表格文件不能超过 20MB。")

    if not LIBREOFFICE_BINARY:
        raise HTTPException(status_code=503, detail="转换服务缺少 LibreOffice，请联系管理员。")

    async with HEAVY_TASK_LOCK:
        _release_background_model_memory()
        try:
            output = await asyncio.to_thread(_convert_spreadsheet_to_pdf, content, suffix)
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail="表格转换超时，请稍后重试。") from exc
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail="转换失败，请确认文件可以在 Excel 或 WPS 中正常打开。",
            ) from exc
        finally:
            gc.collect()

    download_name = f"{Path(original_name).stem}.pdf"
    encoded_name = quote(download_name)
    return Response(
        content=output,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                'attachment; filename="spreadsheet.pdf"; '
                f"filename*=UTF-8''{encoded_name}"
            ),
            "Cache-Control": "no-store",
        },
    )


def _convert_spreadsheet_to_pdf(content: bytes, suffix: str) -> bytes:
    with tempfile.TemporaryDirectory(prefix="hn-sheetpdf-") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / f"input{suffix}"
        output_dir = temp_path / "output"
        profile_dir = temp_path / "libreoffice-profile"
        output_dir.mkdir()
        profile_dir.mkdir()
        input_path.write_bytes(content)

        command = [
            LIBREOFFICE_BINARY,
            "--headless",
            "--invisible",
            "--nologo",
            "--nodefault",
            "--nolockcheck",
            "--nofirststartwizard",
            f"-env:UserInstallation={profile_dir.as_uri()}",
            "--convert-to",
            "pdf:calc_pdf_Export",
            "--outdir",
            str(output_dir),
            str(input_path),
        ]
        conversion_env = os.environ.copy()
        conversion_env.update(
            {
                "HOME": str(temp_path),
                "TMPDIR": str(temp_path),
                "SAL_DISABLE_JAVA": "1",
                "SAL_USE_VCLPLUGIN": "gen",
            }
        )
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=150,
            check=False,
            env=conversion_env,
        )

        pdf_files = sorted(output_dir.glob("*.pdf"))
        if result.returncode != 0 or not pdf_files:
            raise RuntimeError(
                "LibreOffice conversion failed: "
                + (result.stderr.strip() or result.stdout.strip() or "unknown error")
            )

        return pdf_files[0].read_bytes()


def _release_background_model_memory() -> None:
    """释放已缓存的 ONNX 会话，为 LibreOffice 留出内存。"""
    if _BACKGROUND_MODULE is not None:
        session_cache = getattr(_BACKGROUND_MODULE, "SESSION_CACHE", None)
        if isinstance(session_cache, dict):
            session_cache.clear()
    gc.collect()


async def _get_background_app():
    global _BACKGROUND_APP, _BACKGROUND_MODULE
    if _BACKGROUND_APP is None:
        # 延迟导入：普通表格转换不会加载 rembg / onnxruntime。
        _BACKGROUND_MODULE = importlib.import_module("app")
        _BACKGROUND_APP = _BACKGROUND_MODULE.app
    return _BACKGROUND_APP


class ProcessingDispatcher:
    """按请求路径把抠图流量转给延迟加载的原有 FastAPI 应用。"""

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "") if scope.get("type") == "http" else ""
        if path in {"/api/remove-background", "/api/warmup"}:
            async with HEAVY_TASK_LOCK:
                background_app = await _get_background_app()
                await background_app(scope, receive, send)
            return

        await core_app(scope, receive, send)


app = CORSMiddleware(
    ProcessingDispatcher(),
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
