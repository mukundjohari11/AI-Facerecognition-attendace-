import os
from pathlib import Path

# Paths 
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
FAISS_INDEX_PATH = DATA_DIR / "faiss_index.bin"
ID_MAP_PATH = DATA_DIR / "id_map.json"

# Ensure data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)

#  Model Settings
EMBEDDING_DIM = 512
FACENET_PRETRAINED = "vggface2"

# Detection Settings 
MIN_FACE_SIZE = 40          # Minimum face size in pixels(iska kuch krna padega)
DETECTION_THRESHOLDS = [0.6, 0.7, 0.7]   # MTCNN stage thresholds
MAX_FACES_PER_IMAGE = 200

#  Matching Settings 
SIMILARITY_THRESHOLD = 0.65      # Cosine similarity threshold for a valid match
LOW_CONFIDENCE_LOWER = 0.55      # Below this → unknown
LOW_CONFIDENCE_UPPER = 0.65      # Between lower and upper → flagged for review
TOP_K = 5                        # Number of nearest neighbors to retrieve

# Server Settings
HOST = os.getenv("ML_HOST", "0.0.0.0")
PORT = int(os.getenv("ML_PORT", "8000"))
