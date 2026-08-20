"""Challonge placement scoring, ported from backend/src/lib/challongePoints.ts.

Points depend on both the finishing rank and how large the bracket was, so a
win in a 50-player event is worth far more than a win in a 6-player one. The
tables are the ones the community agreed on; they are data, not a formula.
"""

# (minimum participant count, [(max rank, points), ...]) ordered from the
# largest bracket down. The first bracket size that fits is the one used.
_TABLES: list[tuple[int, list[tuple[int, int]]]] = [
    (49, [(1, 400), (2, 280), (3, 160), (4, 120), (8, 90), (12, 65), (16, 50), (24, 40), (32, 30), (48, 15), (10**9, 10)]),
    (33, [(1, 350), (2, 240), (3, 140), (4, 110), (8, 80), (12, 55), (16, 40), (24, 30), (32, 15), (10**9, 10)]),
    (25, [(1, 300), (2, 200), (3, 120), (4, 90), (8, 70), (12, 45), (16, 30), (24, 15), (10**9, 10)]),
    (17, [(1, 250), (2, 160), (3, 100), (4, 80), (8, 60), (12, 30), (16, 15), (10**9, 10)]),
    (13, [(1, 200), (2, 120), (3, 80), (4, 60), (8, 30), (12, 15), (10**9, 10)]),
    (8, [(1, 150), (2, 80), (3, 60), (4, 40), (8, 20), (10**9, 10)]),
    (6, [(1, 100), (2, 70), (3, 50), (4, 30), (10**9, 10)]),
]


def calculate_challonge_points(rank: int | None, total: int | None) -> int:
    """Points for finishing `rank` out of `total`. Zero if either is missing."""
    if not rank or not total:
        return 0

    for minimum, table in _TABLES:
        if total >= minimum:
            for max_rank, points in table:
                if rank <= max_rank:
                    return points
            return 0

    # Fewer than six participants scores nothing.
    return 0
