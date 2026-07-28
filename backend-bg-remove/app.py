import asyncio
import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError
from rembg import new_session, remove


MAX_FILE_SIZE = 12 * 1024 * 1024
MAX_STAMP_ANALYSIS_SIDE = 1800
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
    "stamp": {
        "model": None,
        "engine": "local-color-separation",
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
    if mode == "stamp":
        return {"status": "ready", "mode": mode, "engine": config["engine"]}
    get_session(config["model"])
    return {"status": "ready", "mode": mode, "model": config["model"]}


@app.post("/api/remove-background")
async def remove_background(
    file: UploadFile = File(...),
    mode: str = Form("standard"),
    stamp_color: str = Form("auto"),
    stamp_strength: int = Form(58),
):
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
        if mode == "stamp":
            output = remove_stamp_background(
                content,
                stamp_color=stamp_color,
                strength=stamp_strength,
            )
        else:
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


def remove_stamp_background(content: bytes, stamp_color: str = "auto", strength: int = 58) -> bytes:
    """Extract red, blue or black stamp ink from a neutral paper background.

    This is a lightweight self-hosted pipeline: local illumination correction,
    ink-color separation and a soft alpha matte. It intentionally preserves the
    broken ink, particles and feathered edges of a physical stamp impression.
    """

    source = ImageOps.exif_transpose(Image.open(BytesIO(content))).convert("RGB")
    original_size = source.size
    max_side = max(original_size)
    scale = min(1.0, MAX_STAMP_ANALYSIS_SIDE / max_side) if max_side else 1.0
    if scale < 1.0:
        analysis = source.resize(
            (max(1, round(original_size[0] * scale)), max(1, round(original_size[1] * scale))),
            Image.Resampling.LANCZOS,
        )
    else:
        analysis = source.copy()

    width, height = analysis.size
    blur_radius = max(8, round(max(width, height) * 0.035))
    paper = analysis.filter(ImageFilter.GaussianBlur(radius=blur_radius))

    pixels = np.asarray(analysis, dtype=np.float32) / 255.0
    paper_pixels = np.asarray(paper, dtype=np.float32) / 255.0
    normalized = np.clip(pixels / (paper_pixels + 0.035), 0.0, 1.35)

    red = normalized[:, :, 0]
    green = normalized[:, :, 1]
    blue = normalized[:, :, 2]
    darkness = np.clip(1.0 - (red + green + blue) / 3.0, 0.0, 1.0)
    saturation = np.max(normalized, axis=2) - np.min(normalized, axis=2)
    red_chroma = np.clip(((red - green) + (red - blue)) * 0.5, 0.0, 1.0)
    blue_chroma = np.clip(((blue - red) + (blue - green)) * 0.5, 0.0, 1.0)

    ink = normalize_stamp_color(stamp_color, red_chroma, blue_chroma)
    strength_value = int(np.clip(strength, 20, 90))
    strength_ratio = strength_value / 100.0

    if ink == "red":
        chroma = red_chroma
        score = chroma * (0.85 + 0.60 * darkness) + 0.08 * darkness * np.clip(chroma * 12.0, 0.0, 1.0)
    elif ink == "blue":
        chroma = blue_chroma
        score = chroma * (0.85 + 0.60 * darkness) + 0.08 * darkness * np.clip(chroma * 12.0, 0.0, 1.0)
    else:
        chroma = None
        score = np.clip(darkness - 0.22 * saturation, 0.0, 1.0)

    lower = 0.055 - strength_ratio * 0.045
    upper = 0.29 - strength_ratio * 0.10
    normalized_score = np.clip((score - lower) / max(0.04, upper - lower), 0.0, 1.0)
    alpha = normalized_score * normalized_score * (3.0 - 2.0 * normalized_score)

    if chroma is not None:
        faint_floor = 0.006 + 0.012 * (1.0 - strength_ratio)
        faint = np.clip((chroma - faint_floor) / 0.12, 0.0, 1.0)
        alpha = np.maximum(alpha, faint * 0.48)

    alpha = np.clip(alpha, 0.0, 1.0)
    alpha_image = Image.fromarray((alpha * 255.0).astype(np.uint8), mode="L")
    alpha_image = alpha_image.filter(ImageFilter.MedianFilter(size=3))
    alpha_image = alpha_image.filter(ImageFilter.GaussianBlur(radius=0.35))
    if analysis.size != original_size:
        alpha_image = alpha_image.resize(original_size, Image.Resampling.LANCZOS)

    alpha_values = np.asarray(alpha_image, dtype=np.uint8)
    alpha_values = np.where(alpha_values < 5, 0, alpha_values).astype(np.uint8)
    alpha_image = Image.fromarray(alpha_values, mode="L")

    ink_rgb = estimate_stamp_rgb(pixels, alpha, ink)
    output = Image.new("RGBA", original_size, ink_rgb + (0,))
    output.putalpha(alpha_image)

    buffer = BytesIO()
    output.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def normalize_stamp_color(value: str, red_chroma: np.ndarray, blue_chroma: np.ndarray) -> str:
    requested = (value or "auto").strip().lower()
    if requested in {"red", "blue", "black"}:
        return requested

    red_mass = float(np.mean(np.power(red_chroma, 1.4)))
    blue_mass = float(np.mean(np.power(blue_chroma, 1.4)))
    if red_mass > 0.004 and red_mass >= blue_mass * 1.18:
        return "red"
    if blue_mass > 0.004 and blue_mass >= red_mass * 1.18:
        return "blue"
    return "black"


def estimate_stamp_rgb(pixels: np.ndarray, alpha: np.ndarray, ink: str) -> tuple[int, int, int]:
    strong = alpha > 0.58
    if int(np.count_nonzero(strong)) >= 24:
        sample = pixels[strong] * 255.0
        candidate = np.percentile(sample, 35, axis=0)
    else:
        candidate = np.array([155.0, 10.0, 20.0] if ink == "red" else [25.0, 60.0, 165.0])

    if ink == "red":
        red = int(np.clip(max(candidate[0], 105.0), 105.0, 180.0))
        green = int(np.clip(min(candidate[1], red * 0.30), 5.0, 52.0))
        blue = int(np.clip(min(candidate[2], red * 0.36), 7.0, 62.0))
        return red, green, blue
    if ink == "blue":
        blue = int(np.clip(max(candidate[2], 110.0), 110.0, 185.0))
        red = int(np.clip(min(candidate[0], blue * 0.32), 8.0, 58.0))
        green = int(np.clip(min(candidate[1], blue * 0.48), 18.0, 82.0))
        return red, green, blue

    gray = int(np.clip(float(np.mean(candidate)), 24.0, 72.0))
    return gray, gray, gray


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
