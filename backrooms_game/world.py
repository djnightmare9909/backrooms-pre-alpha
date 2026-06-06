import os
import random
import pickle
from settings import *
from utils import get_sector_seed, distance

# In-memory chunk cache to simulate PS2 RAM constraints (we save offloaded chunks to disk)
world_chunks = {}

def get_tile_classification(gx, gz):
    """
    Classifies a global tile (gx, gz) in feet/tiles into:
    - "room" (walkable open room space)
    - "hallway" (walkable hallway space)
    - "pillar" (solid pillar block)
    - "wall" (solid interior partition wall)
    - "outside" (solid void/fill separating structures)
    
    This is calculated using O(1) mathematical geometry by hashing and checking nearby
    sector structure definitions, ensuring infinite coverage without seam artifacts.
    """
    # 1. Determine local sector coordinates
    sx = gx // SECTOR_SIZE
    sz = gz // SECTOR_SIZE

    # Check a 3x3 of sectors of safety around the coordinates to resolve overlaps/junctions
    for osx in range(sx - 1, sx + 2):
        for osz in range(sz - 1, sz + 2):
            # Seed deterministic RNG for this specific sector
            seed = get_sector_seed(osx, osz, WORLD_SEED)
            rng = random.Random(seed)
            
            # Generate Sector Room properties:
            # Rooms are capped to 100x100 max as described in our PS2 specification sheet
            room_w = rng.randint(20, min(80, MAX_ROOM_SIZE))
            room_h = rng.randint(20, min(80, MAX_ROOM_SIZE))
            
            # Bounds of Room inside the 128x128 sector
            padding = 10
            room_x = osx * SECTOR_SIZE + rng.randint(padding, SECTOR_SIZE - room_w - padding)
            room_z = osz * SECTOR_SIZE + rng.randint(padding, SECTOR_SIZE - room_h - padding)
            
            room_x2 = room_x + room_w
            room_z2 = room_z + room_h
            
            room_cx = room_x + room_w // 2
            room_cz = room_z + room_h // 2

            # --- Check if coordinate falls inside Room ---
            if room_x <= gx < room_x2 and room_z <= gz < room_z2:
                # Inside a Room! Now calculate inner obstacles (Pillars & Partition Walls):
                
                # Check for Pillars (Columns). Pillars cannot spawn within 4 ft.
                # Placing them on a deterministic 10x10 grid inside the room ensures spacing.
                grid_spacing = 10
                for px in range(room_x + 8, room_x2 - 8, grid_spacing):
                    for pz in range(room_z + 8, room_z2 - 8, grid_spacing):
                        # Generate local deterministic properties for this specific offset
                        p_hash = (px * 31 + pz * 17 + seed) & 0xFFFFFFFF
                        prng = random.Random(p_hash)
                        
                        # Apply small physical jitter (cannot exceed 2 tiles to maintain min spacing of 6 ft)
                        jx = prng.randint(-2, 2)
                        jz = prng.randint(-2, 2)
                        final_px = px + jx
                        final_pz = pz + jz
                        
                        # Decide if this pillar spawns (e.g. 50% probability)
                        if prng.random() < 0.50:
                            # Is our tile this pillar? Let's make it a solid 2x2 pillar (massive structural look)
                            if final_px <= gx < final_px + 2 and final_pz <= gz < final_pz + 2:
                                return "pillar", True

                # Check for Partition Walls. These generate randomly inside open room space.
                num_walls = rng.randint(2, 5) # 2 to 5 walls per room
                for _ in range(num_walls):
                    wall_dir = rng.choice(["H", "V"])
                    wall_len = rng.randint(5, 15)
                    wx = rng.randint(room_x + 4, room_x2 - 16)
                    wz = rng.randint(room_z + 4, room_z2 - 16)
                    
                    if wall_dir == "H":
                        if wz == gz and wx <= gx < wx + wall_len:
                            return "wall", True
                    else: # "V"
                        if wx == gx and wz <= gz < wz + wall_len:
                            return "wall", True

                # No obstacle matched; it is plain walkable room floor
                return "room", False

    # 2. If not inside a room, check if tile is inside any interconnecting Hallway.
    # L-shaped corridors connect sector (osx, osz) to (osx + 1, osz) & (osx, osz + 1)
    for osx in range(sx - 1, sx + 2):
        for osz in range(sz - 1, sz + 2):
            seed = get_sector_seed(osx, osz, WORLD_SEED)
            rng = random.Random(seed)
            
            # Extract centers and coordinates of rooms to link them
            room_w = rng.randint(20, min(80, MAX_ROOM_SIZE))
            room_h = rng.randint(20, min(80, MAX_ROOM_SIZE))
            padding = 10
            room_x = osx * SECTOR_SIZE + rng.randint(padding, SECTOR_SIZE - room_w - padding)
            room_z = osz * SECTOR_SIZE + rng.randint(padding, SECTOR_SIZE - room_h - padding)
            ax = room_x + room_w // 2
            az = room_z + room_h // 2
            
            # Neighbor room centers to link
            # East Neighbor
            east_rng = random.Random(get_sector_seed(osx + 1, osz, WORLD_SEED))
            en_w = east_rng.randint(20, min(80, MAX_ROOM_SIZE))
            en_h = east_rng.randint(20, min(80, MAX_ROOM_SIZE))
            en_x = (osx + 1) * SECTOR_SIZE + east_rng.randint(padding, SECTOR_SIZE - en_w - padding)
            en_z = osz * SECTOR_SIZE + east_rng.randint(padding, SECTOR_SIZE - en_h - padding)
            bx = en_x + en_w // 2
            bz = en_z + en_h // 2
            
            # South Neighbor
            south_rng = random.Random(get_sector_seed(osx, osz + 1, WORLD_SEED))
            sn_w = south_rng.randint(20, min(80, MAX_ROOM_SIZE))
            sn_h = south_rng.randint(20, min(80, MAX_ROOM_SIZE))
            sn_x = osx * SECTOR_SIZE + south_rng.randint(padding, SECTOR_SIZE - sn_w - padding)
            sn_z = (osz + 1) * SECTOR_SIZE + south_rng.randint(padding, SECTOR_SIZE - sn_h - padding)
            cx = sn_x + sn_w // 2
            cz = sn_z + sn_h // 2

            # Determine hallway widths (Max width 10 ft as requested!)
            hall_w_h = rng.randint(4, min(10, MAX_HALLWAY_WIDTH))
            hall_w_h = max(4, hall_w_h)
            hall_w_v = rng.randint(4, min(10, MAX_HALLWAY_WIDTH))
            hall_w_v = max(4, hall_w_v)

            # --- Check Horizontal link (ax to bx at height az) ---
            half_w_h = hall_w_h // 2
            min_x_h, max_x_h = min(ax, bx), max(ax, bx)
            if min_x_h <= gx <= max_x_h and az - half_w_h <= gz < az - half_w_h + hall_w_h:
                return "hallway", False

            # --- Check Vertical link (az to cz at width ax) ---
            half_w_v = hall_w_v // 2
            min_z_v, max_z_v = min(az, cz), max(az, cz)
            if min_z_v <= gz <= max_z_v and ax - half_w_v <= gx < ax - half_w_v + hall_w_v:
                return "hallway", False

    # 3. If neither room nor hallway, this tile is solid filled outer wall
    return "outside", True


def generate_chunk(cx, cz):
    """
    Generates a 16x16 chunk of tiles.
    Returns a 2D list of boolean collision flags (True=Solid wall, False=Walkable floor).
    """
    chunk = [[True for _ in range(CHUNK_SIZE)] for _ in range(CHUNK_SIZE)]
    for local_x in range(CHUNK_SIZE):
        for local_z in range(CHUNK_SIZE):
            world_x = cx * CHUNK_SIZE + local_x
            world_z = cz * CHUNK_SIZE + local_z
            _, solid = get_tile_classification(world_x, world_z)
            chunk[local_x][local_z] = solid
    return chunk


def get_chunk(cx, cz):
    """
    Retrieves a cached chunk, loads it from disk, or seeds and lazy-generates it.
    """
    if (cx, cz) not in world_chunks:
        filename = f"save_data/chunk_{cx}_{cz}.dat"
        if os.path.exists(filename):
            try:
                with open(filename, "rb") as f:
                    world_chunks[(cx, cz)] = pickle.load(f)
            except Exception:
                world_chunks[(cx, cz)] = generate_chunk(cx, cz)
        else:
            world_chunks[(cx, cz)] = generate_chunk(cx, cz)
    return world_chunks[(cx, cz)]


def is_solid(world_x, world_z):
    """
    High-level binary collision query: Returns True if the absolute coordinate is solid.
    Handles floats by mapping them directly to discrete tile integers.
    """
    gx = int(math.floor(world_x))
    gz = int(math.floor(world_z))
    
    cx = gx // CHUNK_SIZE
    cz = gz // CHUNK_SIZE
    local_x = gx % CHUNK_SIZE
    local_z = gz % CHUNK_SIZE
    
    chunk = get_chunk(cx, cz)
    return chunk[local_x][local_z]


def save_chunk(cx, cz):
    """
    Serializes a chunk to save_data directory to conserve memory (replicating console VM offloading).
    """
    if (cx, cz) in world_chunks:
        os.makedirs("save_data", exist_ok=True)
        filename = f"save_data/chunk_{cx}_{cz}.dat"
        try:
            with open(filename, "wb") as f:
                pickle.dump(world_chunks[(cx, cz)], f)
        except Exception:
            pass
