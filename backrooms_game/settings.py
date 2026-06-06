# ==========================================
# settings.py - Core configuration for the infinite Backrooms RPG
# Optimized to run on low-end hardware (retro-grade/PS2 constraint emulation)
# ==========================================

# Seeding & Coordinates
WORLD_SEED = 12345          # Global seed for generator
LOAD_DISTANCE = 3           # Chunks load distance (radius) around the player
CHUNK_SIZE = 16             # Tiles per chunk side (PS2 budget: 16x16 chunk sizes are cache friendly)
TILE_SIZE_FT = 1            # 1 tile = 1 sq ft (PS2 level-0 physics simulation scale)

# procedural limits
SECTOR_SIZE = 128           # 8x8 Chunks = 1 Sector (128x128 ft). Used for structure division.
MAX_ROOM_SIZE = 100         # Maximum width/length of any generated room (in ft/tiles)
MAX_HALLWAY_WIDTH = 10      # Maximum width of any hallway (in ft/tiles)
PILLAR_MIN_DIST = 4         # Pillars cannot spawn closer than 4 ft apart

# Player Starting Settings
PLAYER_START_X = 64.0       # Start in the middle of sector (0,0) room space
PLAYER_START_Z = 64.0       # Start in the middle of sector (0,0) room space
MOVE_SPEED = 8.0            # Foot per second (Player walk velocity)
PLAYER_RADIUS = 0.4         # Collision radius (feet) for circle-to-box checking
