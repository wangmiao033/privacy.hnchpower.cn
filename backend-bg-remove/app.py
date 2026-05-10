from io import BytesIO

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
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


app = FastAPI(title="HN Tools Background Remove API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


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


def get_session(model_name: str):
    if model_name not in SESSION_CACHE:
        SESSION_CACHE[model_name] = new_session(model_name)
    return SESSION_CACHE[model_name]
