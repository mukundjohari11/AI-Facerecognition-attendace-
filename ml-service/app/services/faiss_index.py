"""
FAISS Index Manager — manages the vector index for fast similarity search.
"""
import json
import logging
from typing import Dict, List, Optional, Tuple

import faiss
import numpy as np

from app.config import EMBEDDING_DIM, FAISS_INDEX_PATH, ID_MAP_PATH, TOP_K

logger = logging.getLogger(__name__)


class FAISSIndexManager:
    """
    Manages a FAISS IndexFlatIP (inner product ≡ cosine similarity
    when embeddings are L2-normalised).
    """

    def __init__(self):
        self.index: faiss.IndexFlatIP = faiss.IndexFlatIP(EMBEDDING_DIM)
        # Maps internal FAISS position → student_id string
        self._id_map: List[str] = []
        self._load_if_exists()

    # ── Build / Modify ─────────────────────────────────────────────────

    def build_index(
        self, embeddings: np.ndarray, student_ids: List[str]
    ) -> None:
        """
        Build a fresh index from a matrix of embeddings.

        Parameters
        ----------
        embeddings : ndarray  (N, 512) — must be L2-normalised
        student_ids : list[str]  — parallel list of student IDs
        """
        assert embeddings.shape[0] == len(student_ids), (
            "embeddings and student_ids must have the same length"
        )
        assert embeddings.shape[1] == EMBEDDING_DIM

        self.index = faiss.IndexFlatIP(EMBEDDING_DIM)
        self.index.add(embeddings.astype(np.float32))
        self._id_map = list(student_ids)
        self._persist()
        logger.info(
            "Built FAISS index with %d embeddings", self.index.ntotal
        )

    def add_embeddings(
        self, embeddings: np.ndarray, student_ids: List[str]
    ) -> None:
        """Add one or more embeddings to the existing index."""
        self.index.add(embeddings.astype(np.float32))
        self._id_map.extend(student_ids)
        self._persist()
        logger.info(
            "Added %d embeddings; total now %d",
            len(student_ids),
            self.index.ntotal,
        )

    def remove_student(self, student_id: str) -> bool:
        """
        Remove all embeddings for a student and rebuild the index.
        Returns True if the student was found and removed.
        """
        indices = [
            i for i, sid in enumerate(self._id_map) if sid == student_id
        ]
        if not indices:
            return False

        # Reconstruct all vectors, remove target, rebuild
        all_vecs = self._reconstruct_all()
        keep_mask = np.ones(len(self._id_map), dtype=bool)
        keep_mask[indices] = False

        new_vecs = all_vecs[keep_mask]
        new_ids = [
            sid for i, sid in enumerate(self._id_map) if keep_mask[i]
        ]

        self.build_index(new_vecs, new_ids)
        logger.info("Removed student %s (%d embeddings)", student_id, len(indices))
        return True

    # ── Search ─────────────────────────────────────────────────────────

    def search(
        self,
        query_embeddings: np.ndarray,
        k: int = TOP_K,
    ) -> Tuple[np.ndarray, List[List[str]]]:
        """
        Batch nearest-neighbour search.

        Parameters
        ----------
        query_embeddings : ndarray (M, 512)
        k : int

        Returns
        -------
        distances : ndarray (M, k)  — cosine similarities
        student_ids : list[list[str]]  — matched IDs per query
        """
        if self.index.ntotal == 0:
            logger.warning("FAISS index is empty, returning no matches")
            empty = np.zeros((len(query_embeddings), k), dtype=np.float32)
            return empty, [[""] * k for _ in range(len(query_embeddings))]

        actual_k = min(k, self.index.ntotal)
        distances, indices = self.index.search(
            query_embeddings.astype(np.float32), actual_k
        )

        student_ids: List[List[str]] = []
        for row in indices:
            row_ids = []
            for idx in row:
                if 0 <= idx < len(self._id_map):
                    row_ids.append(self._id_map[idx])
                else:
                    row_ids.append("")
            student_ids.append(row_ids)

        return distances, student_ids

    # ── Persistence ────────────────────────────────────────────────────

    def _persist(self) -> None:
        faiss.write_index(self.index, str(FAISS_INDEX_PATH))
        with open(ID_MAP_PATH, "w") as f:
            json.dump(self._id_map, f)
        logger.debug("Index persisted to disk")

    def _load_if_exists(self) -> None:
        if FAISS_INDEX_PATH.exists() and ID_MAP_PATH.exists():
            self.index = faiss.read_index(str(FAISS_INDEX_PATH))
            with open(ID_MAP_PATH, "r") as f:
                self._id_map = json.load(f)
            logger.info(
                "Loaded FAISS index with %d embeddings", self.index.ntotal
            )

    def _reconstruct_all(self) -> np.ndarray:
        n = self.index.ntotal
        return np.array(
            [self.index.reconstruct(i) for i in range(n)], dtype=np.float32
        )

    # ── Info ───────────────────────────────────────────────────────────

    @property
    def total_embeddings(self) -> int:
        return self.index.ntotal

    @property
    def student_count(self) -> int:
        return len(set(self._id_map))

    def get_student_ids(self) -> List[str]:
        return list(set(self._id_map))
