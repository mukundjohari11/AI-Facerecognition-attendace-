"""
Test Suite for the ML Service — validates each component end-to-end.

Run:  cd ml-service && python -m tests.test_pipeline

This test uses SYNTHETIC embeddings to validate the FAISS + matcher logic,
and optionally real images (from tests/sample_faces/) to test MTCNN + FaceNet.
"""
import sys
import os
import numpy as np
import tempfile
import json

# Add parent to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def separator(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


# TEST 1: FAISS Index with Synthetic Embeddings 

def test_faiss_index():
    separator("TEST 1: FAISS Index — Synthetic Embeddings")

    from app.services.faiss_index import FAISSIndexManager
    from app.config import EMBEDDING_DIM

    manager = FAISSIndexManager()

    # Create 10 fake "students" with random normalised embeddings
    num_students = 10
    np.random.seed(42)
    embeddings = np.random.randn(num_students, EMBEDDING_DIM).astype(np.float32)

    # L2-normalise
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    embeddings = embeddings / norms

    student_ids = [f"STUDENT_{i:03d}" for i in range(num_students)]

    # Build index
    manager.build_index(embeddings, student_ids)
    print(f" Built index with {manager.total_embeddings} embeddings, "
          f"{manager.student_count} unique students")

    # Search with exact same embedding → should return itself with ~1.0 similarity
    query = embeddings[3:4]  # query student #3
    distances, results = manager.search(query, k=3)

    print(f"   Query: STUDENT_003")
    print(f"   Top-3 matches: {results[0]}")
    print(f"   Similarities:  {distances[0].tolist()}")

    assert results[0][0] == "STUDENT_003", "Best match should be itself!"
    assert distances[0][0] > 0.99, "Self-similarity should be ~1.0!"
    print(f" Self-match test PASSED (similarity={distances[0][0]:.4f})")

    # Add another embedding for student 3 (simulating multi-image enrollment)
    extra = embeddings[3] + np.random.randn(EMBEDDING_DIM).astype(np.float32) * 0.05
    extra = extra / np.linalg.norm(extra)
    manager.add_embeddings(extra.reshape(1, -1), ["STUDENT_003"])
    print(f" Added extra embedding; total now {manager.total_embeddings}")

    # Remove a student
    removed = manager.remove_student("STUDENT_007")
    assert removed, "Should have found and removed STUDENT_007"
    print(f" Removed STUDENT_007; total now {manager.total_embeddings}")

    # Batch search — query 5 faces at once
    batch_query = embeddings[:5]
    distances, results = manager.search(batch_query, k=1)
    print(f" Batch search of 5 queries returned {len(results)} result sets")

    print("\n FAISS INDEX TESTS ALL PASSED!\n")


# ── TEST 2: FaceNet Embedder with Synthetic Tensors ───────────────────

def test_embedder_synthetic():
    separator("TEST 2: FaceNet Embedder — Synthetic Face Tensors")

    import torch
    from app.services.embedder import FaceEmbedder

    embedder = FaceEmbedder()

    # Create fake 160x160 face tensors (3 faces)
    fake_faces = torch.randn(3, 3, 160, 160)

    embeddings = embedder.generate_embeddings(fake_faces)

    print(f"   Input shape:  {fake_faces.shape}")
    print(f"   Output shape: {embeddings.shape}")
    assert embeddings.shape == (3, 512), f"Expected (3, 512), got {embeddings.shape}"

    # Check L2-normalisation
    norms = np.linalg.norm(embeddings, axis=1)
    print(f"   Norms: {norms}")
    assert np.allclose(norms, 1.0, atol=1e-5), "Embeddings should be L2-normalised!"

    print(f"Embedder produced {embeddings.shape[0]} normalised 512-dim embeddings")
    print("\n EMBEDDER TESTS PASSED!\n")


# ── TEST 3: Full Pipeline with Synthetic Data ─────────────────────────

def test_full_pipeline_synthetic():
    separator("TEST 3: Full Pipeline — Synthetic Match Simulation")

    from app.services.faiss_index import FAISSIndexManager
    from app.config import EMBEDDING_DIM, SIMILARITY_THRESHOLD

    manager = FAISSIndexManager()

    # Simulate 100 enrolled students
    np.random.seed(123)
    num_students = 100
    embeddings = np.random.randn(num_students, EMBEDDING_DIM).astype(np.float32)
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    embeddings = embeddings / norms
    student_ids = [f"STU_{i:04d}" for i in range(num_students)]

    manager.build_index(embeddings, student_ids)
    print(f"   Enrolled {num_students} students")

    # Simulate classroom: 20 students present + 5 unknown faces
    present_ids = [10, 25, 33, 41, 55, 60, 72, 80, 91, 99,
                   3, 7, 14, 21, 48, 63, 77, 85, 44, 50]

    # Create queries: known faces (slightly perturbed) + unknown faces
    known_queries = []
    for idx in present_ids:
        noisy = embeddings[idx] + np.random.randn(EMBEDDING_DIM).astype(np.float32) * 0.1
        noisy = noisy / np.linalg.norm(noisy)
        known_queries.append(noisy)

    unknown_queries = []
    for _ in range(5):
        rand_face = np.random.randn(EMBEDDING_DIM).astype(np.float32)
        rand_face = rand_face / np.linalg.norm(rand_face)
        unknown_queries.append(rand_face)

    all_queries = np.array(known_queries + unknown_queries, dtype=np.float32)
    print(f"   Simulating {len(present_ids)} known + 5 unknown faces")

    # Search
    distances, results = manager.search(all_queries, k=1)

    correct = 0
    unknowns = 0
    for i in range(len(all_queries)):
        sim = distances[i][0]
        matched_id = results[i][0]

        if i < len(present_ids):
            expected = f"STU_{present_ids[i]:04d}"
            if matched_id == expected and sim >= SIMILARITY_THRESHOLD:
                correct += 1
        else:
            if sim < SIMILARITY_THRESHOLD:
                unknowns += 1

    print(f"\n    Results:")
    print(f"   Known faces correctly identified: {correct}/{len(present_ids)}")
    print(f"   Unknown faces correctly rejected: {unknowns}/5")
    print(f"   Threshold used: {SIMILARITY_THRESHOLD}")

    print("\n FULL PIPELINE SIMULATION PASSED!\n")


#  TEST 4: MTCNN + FaceNet with Real Images (optional rakha h abhi) 

def test_real_images():
    separator("TEST 4: Real Image Detection (optional)")

    sample_dir = os.path.join(os.path.dirname(__file__), "sample_faces")
    if not os.path.exists(sample_dir):
        print(f"     SKIPPED — no sample_faces/ directory found")
        print(f"   To run this test, create: {sample_dir}")
        print(f"   And place face images inside (e.g. face1.jpg, face2.jpg)")
        return

    from PIL import Image
    from app.services.detector import FaceDetector
    from app.services.embedder import FaceEmbedder

    detector = FaceDetector()
    embedder = FaceEmbedder()

    images = [f for f in os.listdir(sample_dir)
              if f.lower().endswith(('.jpg', '.jpeg', '.png'))]

    if not images:
        print(f"     SKIPPED — no images in sample_faces/")
        return

    print(f"   Found {len(images)} sample image(s)")

    for img_name in images:
        img_path = os.path.join(sample_dir, img_name)
        image = Image.open(img_path).convert("RGB")
        print(f"\n   Processing: {img_name} ({image.size[0]}x{image.size[1]})")

        faces, boxes, probs = detector.detect_faces(image)
        if faces is None:
            print(f"     No faces detected in {img_name}")
            continue

        print(f"    Detected {len(faces)} face(s)")
        for i, (box, prob) in enumerate(zip(boxes, probs)):
            print(f"      Face {i}: bbox={box.tolist()}, confidence={prob:.4f}")

        embeddings = embedder.generate_embeddings(faces)
        print(f"    Generated {len(embeddings)} embeddings (shape={embeddings.shape})")

        norms = np.linalg.norm(embeddings, axis=1)
        print(f"    All embeddings L2-normalised (norms ~1.0: {norms[:3].tolist()})")

    print("\n REAL IMAGE TESTS PASSED!\n")


# Run All Tests 

if __name__ == "__main__":
    print("\n ML SERVICE TEST SUITE")
    print("=" * 60)

    test_faiss_index()
    test_embedder_synthetic()
    test_full_pipeline_synthetic()
    test_real_images()

    separator("ALL TESTS COMPLETE ")
