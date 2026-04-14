"""FastAPI application entry point."""

import logging
import os

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import FileResponse

from config import MODELS, COLORS, DEFAULT_API_VERSION, DEFAULT_ITERATIONS, DEFAULT_MAX_TOKENS
from routes.api import router as api_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

app = FastAPI(title="Azure OpenAI Latency Benchmark")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

# Serve Next.js static export if available, otherwise fall back to Jinja2 templates
NEXT_OUT = os.path.join(os.path.dirname(__file__), "frontend", "out")

if os.path.isdir(NEXT_OUT) and os.path.isdir(os.path.join(NEXT_OUT, "_next")):
    # Next.js build available — serve as the main UI
    app.mount("/static", StaticFiles(directory="static"), name="static")
    app.mount("/_next", StaticFiles(directory=os.path.join(NEXT_OUT, "_next")), name="next_static")

    @app.get("/")
    async def index_next():
        return FileResponse(os.path.join(NEXT_OUT, "index.html"))

else:
    # Fallback to legacy Jinja2 templates
    app.mount("/static", StaticFiles(directory="static"), name="static")
    templates = Jinja2Templates(directory="templates")

    @app.get("/")
    async def index(request: Request):
        return templates.TemplateResponse(
            "index.html",
            {
                "request": request,
                "models": MODELS,
                "colors": COLORS,
                "default_api_version": DEFAULT_API_VERSION,
                "default_iterations": DEFAULT_ITERATIONS,
                "default_max_tokens": DEFAULT_MAX_TOKENS,
            },
        )


if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8088, reload=True)
