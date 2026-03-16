"""
ML Service — FastAPI Application Entrypoint.

Initialises MTCNN, FaceNet, FAISS, and exposes the recognition API.
"""
import logging

import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import HOST, PORT
from app.services.detector import FaceDetector
from app.services.embedder import FaceEmbedder
from app.services.faiss_index import FAISSIndexManager
from app.services.matcher import FaceMatcher
from app.routes.recognize import router as recognize_router, init_router

# Logging 
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


app = FastAPI(
    title="Attendance ML Service",
    description="Face detection, embedding & recognition powered by MTCNN, FaceNet and FAISS",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    """Load models and build pipeline on startup."""
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    device_name = str(device)
    logger.info("Using device: %s", device_name)

    logger.info("Loading MTCNN face detector…")
    detector = FaceDetector(device=device)

    logger.info("Loading FaceNet embedder…")
    embedder = FaceEmbedder(device=device)

    logger.info("Loading FAISS index…")
    index_manager = FAISSIndexManager()

    matcher = FaceMatcher(detector, embedder, index_manager)

    # Inject into router
    init_router(matcher, device_name)
    logger.info(
        "ML Service ready — index has %d embeddings for %d students",
        index_manager.total_embeddings,
        index_manager.student_count,
    )


# Mount routes
app.include_router(recognize_router, prefix="/api/ml", tags=["ML"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=False)
