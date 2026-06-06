import math

def distance(ax, az, bx, bz):
    """
    Standard Euclidean distance between two points (ax, az) and (bx, bz).
    Used for check distance calculations like player collision or pillar spacing.
    """
    return math.sqrt((ax - bx) ** 2 + (az - bz) ** 2)

def pillar_too_close(new_x, new_z, existing_pillars, min_dist):
    """
    Checks if a newly proposed pillar coordinate is within min_dist of any existing pillar.
    """
    for (px, pz) in existing_pillars:
        if distance(px, pz, new_x, new_z) < min_dist:
            return True
    return False

def get_sector_seed(sx, sz, world_seed):
    """
    A robust, fast mathematical hash to combine sector coordinates with the world seed.
    Useful for creating deterministic local random streams.
    """
    # Large primes used for spatial hashing to avoid coordinate correlation patterns
    p1 = 73856093
    p2 = 19349663
    return int((sx * p1) ^ (sz * p2) ^ world_seed) & 0xFFFFFFFF
