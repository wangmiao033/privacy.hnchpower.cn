import asyncio
import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError
from rembg import new_session, remove


MAX_FILE_SIZE = 12 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}
MODE_CONFIG = {
    "standard": {
        "model": "u2net",
        "alpha_matting": False,
        "post_process_mask": True,
    },
    "fine": {
        "model": "isnet-general-use",
        "alpha_matting": True,
        "alpha_matting_foreground_threshold": 240,
        "alpha_matting_background_threshold": 10,
        "alpha_matting_erode_size": 4,
        "post_process_mask": True,
    },
    "anime": {
        "model": "isnet-anime",
        "alpha_matting": False,
        "post_process_mask": True,
    },
}
SESSION_CACHE = {}

MAX_SPREADSHEET_SIZE = 20 * 1024 * 1024
ALLOWED_SPREADSHEET_EXTENSIONS = {".xlsx", ".xls", ".xlsm", ".ods", ".csv"}
LIBREOFFICE_BINARY = shutil.which("libreoffice") or shutil.which("soffice")


app = FastAPI(title="HN Tools Processing API")


@app.get("/api/warmup")
def warmup(mode: str = "standard"):
    config = MODE_CONFIG.get(mode)
    if not config:
        raise HTTPException(status_code=400, detail="Unsupported warmup mode.")
    get_session(config["model"])
    return {"status": "ready", "mode": mode, "model": config["model"]}


@app.post("/api/remove-background")
async def remove_background(file: UploadFile = File(...), mode: str = Form("standard")):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, JPEG and WEBP images are supported.")

    config = MODE_CONFIG.get(mode)
    if not config:
        raise HTTPException(status_code=400, detail="Unsupported remove mode.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Image must be 12MB or smaller.")

    try:
        image = Image.open(BytesIO(content))
        image.verify()
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Failed to read uploaded image.") from exc

    try:
        session = get_session(config["model"])
        output = remove(
            content,
            session=session,
            alpha_matting=config["alpha_matting"],
            alpha_matting_foreground_threshold=config.get("alpha_matting_foreground_threshold", 240),
            alpha_matting_background_threshold=config.get("alpha_matting_background_threshold", 10),
            alpha_matting_erode_size=config.get("alpha_matting_erode_size", 10),
            post_process_mask=config["post_process_mask"],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Background removal failed.") from exc

    return Response(
        content=output,
        media_type="image/png",
        headers={"Content-Disposition": 'attachment; filename="bg-removed.png"'},
    )


@app.post("/api/spreadsheet-to-pdf")
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

    try:
        output = await asyncio.to_thread(_convert_spreadsheet_to_pdf, content, suffix)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="表格转换超时，请稍后重试。") from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="转换失败，请确认文件可以在 Excel 或 WPS 中正常打开。",
        ) from exc

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
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=150,
            check=False,
        )

        pdf_files = sorted(output_dir.glob("*.pdf"))
        if result.returncode != 0 or not pdf_files:
            raise RuntimeError(
                "LibreOffice conversion failed: "
                + (result.stderr.strip() or result.stdout.strip() or "unknown error")
            )

        return pdf_files[0].read_bytes()


def get_session(model_name: str):
    if model_name not in SESSION_CACHE:
        SESSION_CACHE[model_name] = new_session(model_name)
    return SESSION_CACHE[model_name]
