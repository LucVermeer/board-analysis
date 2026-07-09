"""Compute content-similarity neighbours from the Climb2Vec embeddings (the
content export) and write a neighbours JSONL the TS loader
(`packages/db/scripts/load-similarity.ts`) upserts into board_climb_similar.

Cosine top-K is computed within each (layoutId, angle) group — different layouts
are different walls, different angles are different problems. numpy BLAS makes the
m×m matmul trivial even for the largest groups, where a pure-JS loop stalls.

Run (from ml/climb2vec/):
  python similarity_export.py --content data/kilter-content.jsonl --out data/kilter-similar.jsonl --k 25
"""

import argparse
import json
from collections import defaultdict

import numpy as np


def load_content(path):
    rows = []
    with open(path) as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--content", default="data/kilter-content.jsonl")
    parser.add_argument("--out", default="data/kilter-similar.jsonl")
    parser.add_argument("--k", type=int, default=25)
    args = parser.parse_args()

    rows = [row for row in load_content(args.content) if row.get("embedding") and row.get("layoutId") is not None]
    print(f"[similarity] {len(rows)} embedded climb-angles")

    groups = defaultdict(list)
    for idx, row in enumerate(rows):
        groups[(row["layoutId"], row["angle"])].append(idx)

    # Row-blocked so the biggest (layout, angle) group can't allocate an m×m
    # matrix (a full Kilter angle is tens of thousands of climbs → 10s of GB).
    block = 2000
    written = 0
    with open(args.out, "w") as out:
        for (layout_id, angle), members in groups.items():
            m = len(members)
            if m < 2:
                continue
            matrix = np.array([rows[i]["embedding"] for i in members], dtype=np.float32)
            matrix = matrix / np.clip(np.linalg.norm(matrix, axis=1, keepdims=True), 1e-9, None)
            k = min(args.k, m - 1)
            for start in range(0, m, block):
                sims = matrix[start : start + block] @ matrix.T  # [b, m]
                for i in range(sims.shape[0]):
                    sims[i, start + i] = -np.inf  # exclude self
                part = np.argpartition(-sims, kth=k - 1, axis=1)[:, :k]
                for i in range(sims.shape[0]):
                    order = part[i][np.argsort(-sims[i, part[i]])]
                    neighbours = [[rows[members[j]]["climbUuid"], round(float(sims[i, j]), 5)] for j in order]
                    out.write(
                        json.dumps(
                            {"climbUuid": rows[members[start + i]]["climbUuid"], "angle": angle, "neighbours": neighbours}
                        )
                        + "\n"
                    )
                    written += 1
    print(f"[similarity] wrote {written} climb neighbour lists → {args.out}")


if __name__ == "__main__":
    main()
