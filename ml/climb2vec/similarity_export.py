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

    written = 0
    with open(args.out, "w") as out:
        for (layout_id, angle), members in groups.items():
            if len(members) < 2:
                continue
            matrix = np.array([rows[i]["embedding"] for i in members], dtype=np.float32)
            norms = np.linalg.norm(matrix, axis=1, keepdims=True)
            matrix = matrix / np.clip(norms, 1e-9, None)
            sims = matrix @ matrix.T
            np.fill_diagonal(sims, -np.inf)
            k = min(args.k, len(members) - 1)
            # Top-k neighbour indices per row (argpartition, then order the k).
            top = np.argpartition(-sims, kth=k - 1, axis=1)[:, :k]
            for local_i, member_idx in enumerate(members):
                order = top[local_i][np.argsort(-sims[local_i, top[local_i]])]
                neighbours = [[rows[members[j]]["climbUuid"], round(float(sims[local_i, j]), 5)] for j in order]
                out.write(
                    json.dumps(
                        {
                            "climbUuid": rows[member_idx]["climbUuid"],
                            "angle": angle,
                            "neighbours": neighbours,
                        }
                    )
                    + "\n"
                )
                written += 1
    print(f"[similarity] wrote {written} climb neighbour lists → {args.out}")


if __name__ == "__main__":
    main()
