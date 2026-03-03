"""
Seed Data Script — quickly enroll test students via the running ML service.

Usage:
  1. Start the ML service:   cd ml-service && python -m app.main
  2. Place test face images in tests/sample_faces/ with naming convention:
       student_001_a.jpg, student_001_b.jpg  (multiple images per student)
       student_002_a.jpg
       group_photo.jpg  (for recognition testing)
  3. Run this script:  python -m tests.seed_data

If you don't have face images, this script can also generate a synthetic
FAISS index for testing the matching logic without real faces.
"""
import os
import sys
import argparse
import requests
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

ML_URL = "http://localhost:8000/api/ml"
SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "sample_faces")


def seed_synthetic(num_students=50):
    """Create a synthetic FAISS index directly (no real images needed)."""
    from app.services.faiss_index import FAISSIndexManager
    from app.config import EMBEDDING_DIM

    print(f"\n Seeding FAISS index with {num_students} synthetic students...\n")

    manager = FAISSIndexManager()
    np.random.seed(42)

    embeddings = np.random.randn(num_students, EMBEDDING_DIM).astype(np.float32)
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    embeddings = embeddings / norms

    student_ids = [f"STU_{i:04d}" for i in range(num_students)]

    manager.build_index(embeddings, student_ids)

    print(f" Created index with {manager.total_embeddings} embeddings")
    print(f"   Stored at: {manager.index}")
    print(f"\n   You can now start the ML service and it will load this index.\n")


def seed_real_images():
    """Enroll real face images via the running API."""
    if not os.path.exists(SAMPLE_DIR):
        print(f" Directory not found: {SAMPLE_DIR}")
        print(f"   Create it and add face images named like:")
        print(f"   student_001_a.jpg, student_001_b.jpg, student_002_a.jpg, etc.")
        return

    # Group images by student ID
    student_images = {}
    for f in sorted(os.listdir(SAMPLE_DIR)):
        if not f.lower().endswith(('.jpg', '.jpeg', '.png')):
            continue
        if f.startswith('group'):
            continue  # skip group photos

        # Expected format: student_XXX_Y.ext
        parts = f.rsplit('.', 1)[0].split('_')
        if len(parts) >= 2:
            student_id = '_'.join(parts[:2])  # e.g. "student_001"
        else:
            student_id = parts[0]

        if student_id not in student_images:
            student_images[student_id] = []
        student_images[student_id].append(os.path.join(SAMPLE_DIR, f))

    if not student_images:
        print(f" No student images found in {SAMPLE_DIR}")
        return

    print(f"\n Enrolling {len(student_images)} students via API...\n")

    # Check ML service is running
    try:
        resp = requests.get(f"{ML_URL}/health", timeout=5)
        print(f"   ML service status: {resp.json()}")
    except requests.ConnectionError:
        print(f" Cannot connect to ML service at {ML_URL}")
        print(f"   Start it first: cd ml-service && python -m app.main")
        return

    for student_id, image_paths in student_images.items():
        files = [
            ('images', (os.path.basename(p), open(p, 'rb'), 'image/jpeg'))
            for p in image_paths
        ]
        data = {'student_id': student_id}

        try:
            resp = requests.post(f"{ML_URL}/enroll", data=data, files=files, timeout=30)
            if resp.status_code == 200:
                result = resp.json()
                print(f"    {student_id}: {result['embeddings_added']} embeddings added")
            else:
                print(f"   {student_id}: {resp.status_code} — {resp.text}")
        except Exception as e:
            print(f"    {student_id}: {e}")
        finally:
            for _, (_, fh, _) in files:
                fh.close()

    print(f"\n Seeding complete!\n")


def test_recognition():
    """Test recognition with a group photo."""
    group_photos = []
    if os.path.exists(SAMPLE_DIR):
        group_photos = [
            os.path.join(SAMPLE_DIR, f)
            for f in os.listdir(SAMPLE_DIR)
            if f.lower().startswith('group')
        ]

    if not group_photos:
        print(f"\n  No group photo found for recognition test.")
        print(f"   Place a group_photo.jpg in {SAMPLE_DIR}")
        return

    print(f"\n Testing recognition with {group_photos[0]}...\n")

    with open(group_photos[0], 'rb') as f:
        files = {'image': (os.path.basename(group_photos[0]), f, 'image/jpeg')}
        resp = requests.post(f"{ML_URL}/recognize", files=files, timeout=60)

    if resp.status_code == 200:
        result = resp.json()
        print(f"   Total detected:    {result['total_detected']}")
        print(f"   High-confidence:   {len(result['matches'])}")
        print(f"   Low-confidence:    {len(result['low_confidence'])}")
        print(f"   Unknown faces:     {result['unknown_faces']}")
        for m in result['matches']:
            print(f"      {m['student_id']}: confidence={m['confidence']:.4f}")
        for m in result['low_confidence']:
            print(f"       {m['student_id']}: confidence={m['confidence']:.4f} [REVIEW]")
    else:
        print(f"    Recognition failed: {resp.status_code} — {resp.text}")

    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed test data for ML service")
    parser.add_argument("--mode", choices=["synthetic", "real", "test"],
                        default="synthetic",
                        help="synthetic: fake FAISS index | real: enroll via API | test: recognition test")
    parser.add_argument("--count", type=int, default=50,
                        help="Number of synthetic students (default: 50)")
    args = parser.parse_args()

    if args.mode == "synthetic":
        seed_synthetic(args.count)
    elif args.mode == "real":
        seed_real_images()
    elif args.mode == "test":
        test_recognition()
