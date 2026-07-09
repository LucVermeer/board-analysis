"""Load + featurize the Climb2Vec training matrix (JSONL from
packages/db/scripts/extract-training-matrix.ts).

Leakage rule: the per-hold `hd`/`fd` fields in the extract were fit on ALL grades,
so they are NOT used as model inputs here — that would leak the label. Models learn
hold effects from the TRAIN split only (a learned pid embedding / a train-fit ridge
coefficient). Only label-free geometry + hold identity feed the models.
"""

import json
import math
import random

import numpy as np

# Per-hold geometry node features (all label-free): nx, ny, edge, nbr, sin(pull),
# cos(pull), kickboard, foot-set, is-hand, is-foot.
GEOM_DIM = 10


def load_rows(path):
    rows = []
    with open(path) as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def group_split(rows, val_frac=0.2, seed=13):
    """Split by climb so a climb's angles never straddle train/val."""
    climbs = sorted({row["climbUuid"] for row in rows})
    rng = random.Random(seed)
    rng.shuffle(climbs)
    n_val = max(1, int(len(climbs) * val_frac))
    val_climbs = set(climbs[:n_val])
    train = [row for row in rows if row["climbUuid"] not in val_climbs]
    val = [row for row in rows if row["climbUuid"] in val_climbs]
    return train, val


def _num(value):
    return float(value) if value is not None else 0.0


def hold_geom(hold):
    pull = hold.get("pull")
    sin_p = math.sin(math.radians(pull)) if pull is not None else 0.0
    cos_p = math.cos(math.radians(pull)) if pull is not None else 0.0
    return [
        _num(hold.get("nx")),
        _num(hold.get("ny")),
        _num(hold.get("edge")),
        _num(hold.get("nbr")),
        sin_p,
        cos_p,
        1.0 if hold.get("kb") else 0.0,
        1.0 if hold.get("footSet") else 0.0,
        1.0 if hold["role"] == "hand" else 0.0,
        1.0 if hold["role"] == "foot" else 0.0,
    ]


def holdset_key(row):
    """Angle-independent identity of a climb's holds — duplicates share it."""
    return (row.get("layoutId"), frozenset((hold["pid"], hold["role"]) for hold in row["holds"]))


def weight(row):
    return math.sqrt(max(1.0, float(row.get("ascents", 1))))


def build_pid_vocab(train_rows):
    """pid -> dense index (1..N); 0 is the UNK/padding slot for holds unseen in train."""
    pids = set()
    for row in train_rows:
        for hold in row["holds"]:
            pids.add(hold["pid"])
    return {pid: index + 1 for index, pid in enumerate(sorted(pids))}


def climb_geom_vector(row):
    """Label-free per-climb aggregate, for the geometry-similarity baseline + GBM."""
    holds = row["holds"]
    hands = [h for h in holds if h["role"] == "hand"]
    foots = [h for h in holds if h["role"] == "foot"]

    def col(subset, key):
        vals = [float(h[key]) for h in subset if h.get(key) is not None]
        return np.array(vals, dtype=np.float64) if vals else np.array([0.0])

    feats = [len(holds), len(hands), len(foots)]
    for subset in (hands, foots):
        for key in ("nx", "ny", "edge", "nbr"):
            arr = col(subset, key)
            feats += [float(arr.mean()), float(arr.std())]
    nx = col(holds, "nx")
    ny = col(holds, "ny")
    feats += [float(nx.max() - nx.min()), float(ny.max() - ny.min())]
    feats += [
        float(sum(1 for h in holds if h.get("kb"))),
        float(sum(1 for h in holds if h.get("footSet"))),
    ]
    pull_sin = np.mean([math.sin(math.radians(h["pull"])) for h in holds if h.get("pull") is not None] or [0.0])
    pull_cos = np.mean([math.cos(math.radians(h["pull"])) for h in holds if h.get("pull") is not None] or [0.0])
    feats += [float(pull_sin), float(pull_cos)]
    return np.array(feats, dtype=np.float32)


def unique_climbs(rows):
    """One representative row per climbUuid (holds are identical across its angles)."""
    seen = {}
    for row in rows:
        seen.setdefault(row["climbUuid"], row)
    return list(seen.values())
