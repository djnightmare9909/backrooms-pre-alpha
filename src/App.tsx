/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Compass, 
  Settings, 
  FileText, 
  Copy, 
  ChevronRight, 
  Info,
  Maximize2,
  Minimize2,
  Flame,
  ArrowRight,
  Briefcase,
  BookOpen
} from "lucide-react";

// ============================================================================
// 1. DETERMINISTIC SEEDED RANDOM NUMBER GENERATOR (Mulberry32 Algorithm)
// This generator maintains synchronization with our Python Seeded RNG layout,
// ensuring the exact same random streams represent equivalent coordinates.
// ============================================================================
class SeededRandomNumberGenerator {
  private currentInternalSeedState: number;

  constructor(providedInitialSeed: number) {
    this.currentInternalSeedState = providedInitialSeed >>> 0;
  }

  // Returns a pseudo-random decimal number in the range [0.0, 1.0)
  generateNextRandomFraction(): number {
    let transformationValue = (this.currentInternalSeedState += 0x6D2B79F5);
    transformationValue = Math.imul(transformationValue ^ (transformationValue >>> 15), transformationValue | 1);
    transformationValue ^= transformationValue + Math.imul(transformationValue ^ (transformationValue >>> 7), transformationValue | 61);
    return ((transformationValue ^ (transformationValue >>> 14)) >>> 0) / 4294967296;
  }

  // Generates an integer value inside the inclusive range [minimumValue, maximumValue]
  range(minimumValue: number, maximumValue: number): number {
    return Math.floor(this.generateNextRandomFraction() * (maximumValue - minimumValue + 1)) + minimumValue;
  }

  // Chooses a random element from the provided array of typed items
  choose<T>(sourceArray: T[]): T {
    const selectedIndex = Math.floor(this.generateNextRandomFraction() * sourceArray.length);
    return sourceArray[selectedIndex];
  }
}

// Combines local sector grid coordinates with a global world seed using high-entropy prime multipliers
function getSectorDeterministicSeed(sectorCoordinateX: number, sectorCoordinateZ: number, globalWorldSeed: number): number {
  const largePrimeMultiplierX = 73856093;
  const largePrimeMultiplierZ = 19349663;
  return ((sectorCoordinateX * largePrimeMultiplierX) ^ (sectorCoordinateZ * largePrimeMultiplierZ) ^ globalWorldSeed) >>> 0;
}

// Determines a guaranteed walkable tile location in Sector (0,0) to prevent spawning stuck in a solid wall
export function getSafeCenterOfSector00(globalWorldSeed: number): { x: number; z: number } {
  const sectorZeroSeed = getSectorDeterministicSeed(0, 0, globalWorldSeed);
  const sectorZeroRandomizer = new SeededRandomNumberGenerator(sectorZeroSeed);
  const roomWidthInFeet = sectorZeroRandomizer.range(20, Math.min(80, 100));
  const roomHeightInFeet = sectorZeroRandomizer.range(20, Math.min(80, 100));
  const boundaryPaddingDistance = 10;
  const roomOffsetFromLeftBorder = sectorZeroRandomizer.range(boundaryPaddingDistance, 128 - roomWidthInFeet - boundaryPaddingDistance);
  const roomOffsetFromTopBorder = sectorZeroRandomizer.range(boundaryPaddingDistance, 128 - roomHeightInFeet - boundaryPaddingDistance);
  return {
    x: roomOffsetFromLeftBorder + Math.floor(roomWidthInFeet / 2) + 0.5,
    z: roomOffsetFromTopBorder + Math.floor(roomHeightInFeet / 2) + 0.5,
  };
}

// ============================================================================
// 2. WORLD STRUCTURE AND DESIGN TILES CLASSIFICATION ENGINE
// Calculates coordinates relative to adjacent sectors, building rooms and hallway corridors
// ============================================================================
export interface TileClassification {
  type: "room" | "hallway" | "pillar" | "wall" | "outside";
  solid: boolean;
  isImportOs?: boolean;
  isExit?: boolean;
}

export function getBaseTileClassification(globalTileCoordinateX: number, globalTileCoordinateZ: number, globalWorldSeed: number): TileClassification {
  const SINGLE_SECTOR_SIZE = 128; // The length of one side of a sector in feet/tiles
  const MAX_ROOM_SIZE_LIMIT = 100; // Capped size to conform to layout specifications
  const MAX_HALLWAY_WIDTH_LIMIT = 10; // Maximum allowed connection width of hallway passages
  
  const currentSectorCoordinateX = Math.floor(globalTileCoordinateX / SINGLE_SECTOR_SIZE);
  const currentSectorCoordinateZ = Math.floor(globalTileCoordinateZ / SINGLE_SECTOR_SIZE);

  // Check 3x3 grid of sectors surrounding current position to resolve local overlaps & boundary connections
  for (let offsetSectorX = currentSectorCoordinateX - 1; offsetSectorX <= currentSectorCoordinateX + 1; offsetSectorX++) {
    for (let offsetSectorZ = currentSectorCoordinateZ - 1; offsetSectorZ <= currentSectorCoordinateZ + 1; offsetSectorZ++) {
      const targetedSectorSeed = getSectorDeterministicSeed(offsetSectorX, offsetSectorZ, globalWorldSeed);
      const sectorRandomizer = new SeededRandomNumberGenerator(targetedSectorSeed);

      // Procedural dimensions of the room spawned in this sector
      const currentRoomWidth = sectorRandomizer.range(20, Math.min(80, MAX_ROOM_SIZE_LIMIT));
      const currentRoomHeight = sectorRandomizer.range(20, Math.min(80, MAX_ROOM_SIZE_LIMIT));

      // Minimum spacing offset to keep clear of sector borders
      const sectorBoundaryMarginPadding = 10;
      const roomLeftBoundGlobalX = offsetSectorX * SINGLE_SECTOR_SIZE + sectorRandomizer.range(sectorBoundaryMarginPadding, SINGLE_SECTOR_SIZE - currentRoomWidth - sectorBoundaryMarginPadding);
      const roomTopBoundGlobalZ = offsetSectorZ * SINGLE_SECTOR_SIZE + sectorRandomizer.range(sectorBoundaryMarginPadding, SINGLE_SECTOR_SIZE - currentRoomHeight - sectorBoundaryMarginPadding);

      const roomRightBoundGlobalX = roomLeftBoundGlobalX + currentRoomWidth;
      const roomBottomBoundGlobalZ = roomTopBoundGlobalZ + currentRoomHeight;

      // Check if global query coordinates fall inside the bounds of this sector's room
      if (globalTileCoordinateX >= roomLeftBoundGlobalX && globalTileCoordinateX < roomRightBoundGlobalX && globalTileCoordinateZ >= roomTopBoundGlobalZ && globalTileCoordinateZ < roomBottomBoundGlobalZ) {
        
        // Render periodic columns (pillars) placed deterministically on a 10x10 foot layout grid
        const periodicPillarGridSpacing = 10;
        for (let basePillarAnchorX = roomLeftBoundGlobalX + 8; basePillarAnchorX < roomRightBoundGlobalX - 8; basePillarAnchorX += periodicPillarGridSpacing) {
          for (let basePillarAnchorZ = roomTopBoundGlobalZ + 8; basePillarAnchorZ < roomBottomBoundGlobalZ - 8; basePillarAnchorZ += periodicPillarGridSpacing) {
            // High-entropy combination state seed for this specific pillar coordinates
            const pillarDeterministicHash = ((basePillarAnchorX * 31 + basePillarAnchorZ * 17 + targetedSectorSeed) & 0xFFFFFFFF) >>> 0;
            const pillarSpecificRandomizer = new SeededRandomNumberGenerator(pillarDeterministicHash);

            // Jitter displacements to prevent completely static grid layouts
            const pillarJitterX = pillarSpecificRandomizer.range(-2, 2);
            const pillarJitterZ = pillarSpecificRandomizer.range(-2, 2);
            const finalPillarLeftBoundX = basePillarAnchorX + pillarJitterX;
            const finalPillarTopBoundZ = basePillarAnchorZ + pillarJitterZ;

            // Spawns with 50% probability
            if (pillarSpecificRandomizer.generateNextRandomFraction() < 0.50) {
              // Thick solid 2x2 pillar supporting columns
              if (globalTileCoordinateX >= finalPillarLeftBoundX && globalTileCoordinateX < finalPillarLeftBoundX + 2 && globalTileCoordinateZ >= finalPillarTopBoundZ && globalTileCoordinateZ < finalPillarTopBoundZ + 2) {
                return { type: "pillar", solid: true };
              }
            }
          }
        }

        // Check for interior partition procedural maze wall segments
        const totalProceduralInteriorWallsCount = sectorRandomizer.range(2, 5);
        for (let wallIndex = 0; wallIndex < totalProceduralInteriorWallsCount; wallIndex++) {
          const wallAlignmentDirection = sectorRandomizer.choose(["H", "V"]);
          const wallProceduralSpanLength = sectorRandomizer.range(5, 15);
          const wallStartingAnchorX = sectorRandomizer.range(roomLeftBoundGlobalX + 4, roomRightBoundGlobalX - 16);
          const wallStartingAnchorZ = sectorRandomizer.range(roomTopBoundGlobalZ + 4, roomBottomBoundGlobalZ - 16);

          if (wallAlignmentDirection === "H") {
            if (globalTileCoordinateZ === wallStartingAnchorZ && globalTileCoordinateX >= wallStartingAnchorX && globalTileCoordinateX < wallStartingAnchorX + wallProceduralSpanLength) {
              return { type: "wall", solid: true };
            }
          } else { // Vertical partition wall alignment "V"
            if (globalTileCoordinateX === wallStartingAnchorX && globalTileCoordinateZ >= wallStartingAnchorZ && globalTileCoordinateZ < wallStartingAnchorZ + wallProceduralSpanLength) {
              return { type: "wall", solid: true };
            }
          }
        }

        // walkable room open floor matching base layout
        return { type: "room", solid: false };
      }
    }
  }

  // Check interconnecting Hallway paths for sector connections on-the-fly
  for (let offsetSectorX = currentSectorCoordinateX - 1; offsetSectorX <= currentSectorCoordinateX + 1; offsetSectorX++) {
    for (let offsetSectorZ = currentSectorCoordinateZ - 1; offsetSectorZ <= currentSectorCoordinateZ + 1; offsetSectorZ++) {
      const targetedSectorSeed = getSectorDeterministicSeed(offsetSectorX, offsetSectorZ, globalWorldSeed);
      const sectorRandomizer = new SeededRandomNumberGenerator(targetedSectorSeed);

      const adjacentRoomWidth = sectorRandomizer.range(20, Math.min(80, MAX_ROOM_SIZE_LIMIT));
      const adjacentRoomHeight = sectorRandomizer.range(20, Math.min(80, MAX_ROOM_SIZE_LIMIT));
      const sectorBoundaryMarginPadding = 10;

      const adjacentRoomLeftBoundX = offsetSectorX * SINGLE_SECTOR_SIZE + sectorRandomizer.range(sectorBoundaryMarginPadding, SINGLE_SECTOR_SIZE - adjacentRoomWidth - sectorBoundaryMarginPadding);
      const adjacentRoomTopBoundZ = offsetSectorZ * SINGLE_SECTOR_SIZE + sectorRandomizer.range(sectorBoundaryMarginPadding, SINGLE_SECTOR_SIZE - adjacentRoomHeight - sectorBoundaryMarginPadding);

      const roomCenterX = adjacentRoomLeftBoundX + Math.floor(adjacentRoomWidth / 2);
      const roomCenterZ = adjacentRoomTopBoundZ + Math.floor(adjacentRoomHeight / 2);

      // East neighbor room center coordinates query
      const eastNeighborSectorSeed = getSectorDeterministicSeed(offsetSectorX + 1, offsetSectorZ, globalWorldSeed);
      const eastNeighborSectorRandomizer = new SeededRandomNumberGenerator(eastNeighborSectorSeed);
      const eastNeighborRoomWidth = eastNeighborSectorRandomizer.range(20, Math.min(80, MAX_ROOM_SIZE_LIMIT));
      const eastNeighborRoomHeight = eastNeighborSectorRandomizer.range(20, Math.min(80, MAX_ROOM_SIZE_LIMIT));
      const eastNeighborRoomLeftBoundX = (offsetSectorX + 1) * SINGLE_SECTOR_SIZE + eastNeighborSectorRandomizer.range(sectorBoundaryMarginPadding, SINGLE_SECTOR_SIZE - eastNeighborRoomWidth - sectorBoundaryMarginPadding);
      const eastNeighborRoomTopBoundZ = offsetSectorZ * SINGLE_SECTOR_SIZE + eastNeighborSectorRandomizer.range(sectorBoundaryMarginPadding, SINGLE_SECTOR_SIZE - eastNeighborRoomHeight - sectorBoundaryMarginPadding);
      const eastNeighborRoomCenterX = eastNeighborRoomLeftBoundX + Math.floor(eastNeighborRoomWidth / 2);
      const eastNeighborRoomCenterZ = eastNeighborRoomTopBoundZ + Math.floor(eastNeighborRoomHeight / 2);

      // South neighbor room center coordinates query
      const southNeighborSectorSeed = getSectorDeterministicSeed(offsetSectorX, offsetSectorZ + 1, globalWorldSeed);
      const southNeighborSectorRandomizer = new SeededRandomNumberGenerator(southNeighborSectorSeed);
      const southNeighborRoomWidth = southNeighborSectorRandomizer.range(20, Math.min(80, MAX_ROOM_SIZE_LIMIT));
      const southNeighborRoomHeight = southNeighborSectorRandomizer.range(20, Math.min(80, MAX_ROOM_SIZE_LIMIT));
      const southNeighborRoomLeftBoundX = offsetSectorX * SINGLE_SECTOR_SIZE + southNeighborSectorRandomizer.range(sectorBoundaryMarginPadding, SINGLE_SECTOR_SIZE - southNeighborRoomWidth - sectorBoundaryMarginPadding);
      const southNeighborRoomTopBoundZ = (offsetSectorZ + 1) * SINGLE_SECTOR_SIZE + southNeighborSectorRandomizer.range(sectorBoundaryMarginPadding, SINGLE_SECTOR_SIZE - southNeighborRoomHeight - sectorBoundaryMarginPadding);
      const southNeighborRoomCenterX = southNeighborRoomLeftBoundX + Math.floor(southNeighborRoomWidth / 2);
      const southNeighborRoomCenterZ = southNeighborRoomTopBoundZ + Math.floor(southNeighborRoomHeight / 2);

      // Width ranges of generated passageways
      const horizontalHallwayWidth = sectorRandomizer.range(3, Math.min(10, MAX_HALLWAY_WIDTH_LIMIT));
      const verticalHallwayWidth = sectorRandomizer.range(3, Math.min(10, MAX_HALLWAY_WIDTH_LIMIT));

      // Horizontal link (connecting current center to East neighbor room center across height corridor)
      const halfHorizontalHallwayWidth = Math.floor(horizontalHallwayWidth / 2);
      const minimumXCoordinateForHorizontalHallway = Math.min(roomCenterX, eastNeighborRoomCenterX);
      const maximumXCoordinateForHorizontalHallway = Math.max(roomCenterX, eastNeighborRoomCenterX);
      if (globalTileCoordinateX >= minimumXCoordinateForHorizontalHallway && globalTileCoordinateX <= maximumXCoordinateForHorizontalHallway && globalTileCoordinateZ >= roomCenterZ - halfHorizontalHallwayWidth && globalTileCoordinateZ < roomCenterZ - halfHorizontalHallwayWidth + horizontalHallwayWidth) {
        return { type: "hallway", solid: false };
      }

      // Vertical link (connecting current center to South neighbor room center across width corridor)
      const halfVerticalVerticalHallwayWidth = Math.floor(verticalHallwayWidth / 2);
      const minimumZCoordinateForVerticalHallway = Math.min(roomCenterZ, southNeighborRoomCenterZ);
      const maximumZCoordinateForVerticalHallway = Math.max(roomCenterZ, southNeighborRoomCenterZ);
      if (globalTileCoordinateZ >= minimumZCoordinateForVerticalHallway && globalTileCoordinateZ <= maximumZCoordinateForVerticalHallway && globalTileCoordinateX >= roomCenterX - halfVerticalVerticalHallwayWidth && globalTileCoordinateX < roomCenterX - halfVerticalVerticalHallwayWidth + verticalHallwayWidth) {
        return { type: "hallway", solid: false };
      }
    }
  }

  // Not matching rooms or hallway structures; this represents solid yellow void background walls
  return { type: "outside", solid: true };
}

export function getTileClassification(
  globalTileCoordinateX: number,
  globalTileCoordinateY: number, // (preserved for matching other variables)
  globalWorldSeed: number,
  collectedCount?: number,
  spawnedCount?: number
): TileClassification {
  const baseResult = getBaseTileClassification(globalTileCoordinateX, globalTileCoordinateY, globalWorldSeed);
  
  if (baseResult.solid) {
    // 🎲 Deterministic spatial hash across infinite wall coordinates
    const wallTileHash = ((globalTileCoordinateX * 73856093 + globalTileCoordinateY * 19349663 + globalWorldSeed) & 0xFFFFFFFF) >>> 0;
    
    // "I told you if equals 15 means roll a d20."
    const isAnomalousPotential = (wallTileHash % 300) === 15;
    
    if (isAnomalousPotential) {
      // "If the d20 lands 15 to 20 a wall becomes an anomaly."
      const d20Roll = (Math.floor(wallTileHash / 300) % 20) + 1;
      const isImportOsAnomaly = d20Roll >= 15; // Lands 15, 16, 17, 18, 19, or 20 (30% chance / 6 out of 20)
      
      if (isImportOsAnomaly) {
        // "where one in three anomalies is the real exit"
        const isRealExit = (Math.floor(wallTileHash / 6000) % 3) === 0; // 1-in-3 deterministic fraction
        
        return {
          type: baseResult.type,
          solid: !isRealExit, // Walkable only if it's a real exit!
          isImportOs: true,
          isExit: isRealExit
        };
      }
    }
  }
  
  return baseResult;
}

// Check collision bubble overlap between player bounding sphere and solid environment block coordinates
function checkCollision(
  targetPlayerX: number, 
  targetPlayerZ: number, 
  collisionBubbleRadius: number, 
  globalWorldSeed: number,
  collectedCount?: number,
  spawnedCount?: number
): boolean {
  const minimumContainingTileX = Math.floor(targetPlayerX - collisionBubbleRadius);
  const maximumContainingTileX = Math.floor(targetPlayerX + collisionBubbleRadius);
  const minimumContainingTileZ = Math.floor(targetPlayerZ - collisionBubbleRadius);
  const maximumContainingTileZ = Math.floor(targetPlayerZ + collisionBubbleRadius);

  for (let gridTileX = minimumContainingTileX; gridTileX <= maximumContainingTileX; gridTileX++) {
    for (let gridTileZ = minimumContainingTileZ; gridTileZ <= maximumContainingTileZ; gridTileZ++) {
      const tileProperties = getTileClassification(gridTileX, gridTileZ, globalWorldSeed, collectedCount, spawnedCount);
      if (tileProperties.solid) {
        // Find closest point on the 1x1 solid tile box to player's center coordinates
        const closestPointOnSolidTileBoundaryX = Math.max(gridTileX, Math.min(targetPlayerX, gridTileX + 1));
        const closestPointOnSolidTileBoundaryZ = Math.max(gridTileZ, Math.min(targetPlayerZ, gridTileZ + 1));

        const displacementX = targetPlayerX - closestPointOnSolidTileBoundaryX;
        const displacementZ = targetPlayerZ - closestPointOnSolidTileBoundaryZ;
        const totalDistanceToTileBoundary = Math.sqrt(displacementX * displacementX + displacementZ * displacementZ);
        if (totalDistanceToTileBoundary < collisionBubbleRadius) {
          return true; // Overlap event detected! Bounding sphere collided with wall structure.
        }
      }
    }
  }
  return false;
}

// Hardcoded copy-paste contents for target python project explorer
const PYTHON_CODES = {
  "random_os.py": `# ==========================================
# random_os.py - Cryptographically Secure Anomaly Generator
# ==========================================
import os

def get_true_random_int(min_val, max_val):
    """
    Generates a cryptographically secure, OS-level random integer.
    """
    # Calculate the range size
    range_size = max_val - min_val + 1
    
    # Read 4 random bytes from the OS
    random_bytes = os.urandom(4)
    
    # Convert bytes to a large integer and map to your specific range
    large_int = int.from_bytes(random_bytes, "big")
    return min_val + (large_int % range_size)

# Example usage: simulate a 20-sided die
print("Rolling secure D20:", get_true_random_int(1, 20))

# 🎲 Spatial seed hash probability:
# 1/300 wall coordinate cells (index matching modulo 300 == 15) trigger rolling a secure D20.
# If the D20 lands 15 to 20, the wall becomes an anomaly ("import os").
# Out of these anomalies, 1 in every 3 is a real physical walkable exit.
`,
  "settings.py": `# ==========================================
# settings.py - Core configuration for the infinite Backrooms RPG
# Optimized to run on low-end hardware (retro-grade/PS2 constraint emulation)
# ==========================================

# Seeding & Coordinates
WORLD_SEED = 12345          # Global seed for generator
LOAD_DISTANCE = 3           # Chunks load distance (radius) around the player
CHUNK_SIZE = 16             # Tiles per chunk side (PS2 budget: 16x16 chunks are cache friendly)
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
PLAYER_RADIUS = 0.4         # Collision radius (feet) for circle-to-box checking`,

  "utils.py": `import math

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
    return int((sx * p1) ^ (sz * p2) ^ world_seed) & 0xFFFFFFFF`,

  "world.py": `import os
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

            # Determine hallway widths (between 3 and 10 ft)
            hall_w_h = rng.randint(3, min(10, MAX_HALLWAY_WIDTH))
            hall_w_v = rng.randint(3, min(10, MAX_HALLWAY_WIDTH))

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
    chunk = [[True for _ in range(CHUNK_SIZE)] for _ in range(CHUNK_SIZE)]
    for local_x in range(CHUNK_SIZE):
        for local_z in range(CHUNK_SIZE):
            world_x = cx * CHUNK_SIZE + local_x
            world_z = cz * CHUNK_SIZE + local_z
            _, solid = get_tile_classification(world_x, world_z)
            chunk[local_x][local_z] = solid
    return chunk`,

  "player.py": `import math
from settings import PLAYER_START_X, PLAYER_START_Z, MOVE_SPEED, PLAYER_RADIUS
import world

class Player:
    def __init__(self):
        self.x = PLAYER_START_X
        self.z = PLAYER_START_Z
        self.radius = PLAYER_RADIUS

    def collision_at(self, px, pz):
        """
        Calculates if the player's circle collision boundary (radius) 
        overlaps with any solid grids.
        """
        # Calculate the bounding box in tiles overlapping the player's circle
        min_x = int(math.floor(px - self.radius))
        max_x = int(math.floor(px + self.radius))
        min_z = int(math.floor(pz - self.radius))
        max_z = int(math.floor(pz + self.radius))

        for tx in range(min_x, max_x + 1):
            for tz in range(min_z, max_z + 1):
                if world.is_solid(tx, tz):
                    # Find the closest point in the solid [tx, tx+1] x [tz, tz+1] tile box to player
                    closest_x = max(tx, min(px, tx + 1))
                    closest_z = max(tz, min(pz, tz + 1))
                    
                    # Calculate distance from player's center to this closest point
                    dist = math.sqrt((px - closest_x) ** 2 + (pz - closest_z) ** 2)
                    if dist < self.radius:
                        return True # Overlap! Collision detected.
        return False

    def try_move(self, dx, dz, dt):
        """
        Saves movement vector (dx, dz) with delta-time (dt) scaling.
        Enforces separate axis checks to enable smooth 'sliding' collision responses.
        """
        if dx == 0 and dz == 0:
            return

        # Normalize direction vector so diagonal traveling is not artificially faster
        mag = math.sqrt(dx * dx + dz * dz)
        ndx = dx / mag
        ndz = dz / mag

        # Calculate proposed displacements
        proposed_dx = ndx * MOVE_SPEED * dt
        proposed_dz = ndz * MOVE_SPEED * dt

        # Slide check X-axis
        new_x = self.x + proposed_dx
        if not self.collision_at(new_x, self.z):
            self.x = new_x

        # Slide check Z-axis
        new_z = self.z + proposed_dz
        if not self.collision_at(self.x, new_z):
            self.z = new_z`,

  "main.py": `import sys
import time
import math
from settings import *
import world
from player import Player

try:
    import pygame
    PYGAME_AVAILABLE = True
except ImportError:
    PYGAME_AVAILABLE = False

def load_area(px, pz):
    center_cx = int(px // CHUNK_SIZE)
    center_cz = int(pz // CHUNK_SIZE)
    for dx in range(-LOAD_DISTANCE, LOAD_DISTANCE + 1):
        for dz in range(-LOAD_DISTANCE, LOAD_DISTANCE + 1):
            world.get_chunk(center_cx + dx, center_cz + dz)

    chunks_to_unload = []
    for (cx, cz) in list(world.world_chunks.keys()):
        if (abs(cx - center_cx) > LOAD_DISTANCE + 1 or 
            abs(cz - center_cz) > LOAD_DISTANCE + 1):
            world.save_chunk(cx, cz)
            chunks_to_unload.append((cx, cz))

    for key in chunks_to_unload:
        del world.world_chunks[key]

# Launch pygame or ASCII terminal fallback depending on environment
if __name__ == "__main__":
    player = Player()
    load_area(player.x, player.z)
    if PYGAME_AVAILABLE:
        # Code details within actual package
        pass
    else:
        # Fallback ascii loops...
        pass`,

  "journal.py": `# ==========================================
# journal.py - Procedural Backpack & Journal Spawner
# Seeding-based deterministic lore generator with zero RAM/LLM footprint.
# ==========================================
import random

subjects = [
    "the floor", "the ceiling", "a wall", "my reflection", "the static", 
    "a door that wasn't there", "the humming", "my own shadow", 
    "a stain on the carpet", "the flickering light"
]

verbs = [
    "folds into", "copies", "eats", "erases", "repeats", "whispers", 
    "bleeds into", "forgets", "multiplies", "breathes", "sweats", 
    "inverts", "splits", "mirrors"
]

objects = [
    "itself", "a previous room", "nothing", "a sound I made 3 hours ago",
    "my footsteps", "the number 7", "a memory of the Frontrooms", 
    "an exit that leads deeper", "a clone of me", "a pool of almond water"
]

adverbs = ["slowly", "silently", "infinitely", "wrongly", "backwards", "in 4/4 time"]
adjectives = ["sticky", "mute", "inverted", "fractal", "hungry", "liminal"]

locations = ["Level 0", "Level 1", "the crimson forest", "the poolrooms", "the hub", "an unnumbered level"]
time_phrases = ["for 17 hours", "since I noclipped", "after the 9th turn", "before the lights changed"]

def make_sentence():
    template = random.choice([
        f"{random.choice(subjects)} {random.choice(verbs)} {random.choice(objects)} {random.choice(adverbs)}.",
        f"In {random.choice(locations)}, {random.choice(adjectives)} {random.choice(subjects)} {random.choice(verbs)} {random.choice(objects)}.",
        f"{random.choice(time_phrases).capitalize()}, {random.choice(subjects)} {random.choice(verbs)} {random.choice(objects)}.",
        f"The {random.choice(adjectives)} {random.choice(['air','darkness','silence'])} {random.choice(verbs)} {random.choice(objects)}.",
        f"I realize: {random.choice(subjects)} {random.choice(verbs)} {random.choice(objects)}. It shouldn't."
    ])
    return template

def generate_paragraph(sentences_min=3, sentences_max=6):
    para = []
    for _ in range(random.randint(sentences_min, sentences_max)):
        para.append(make_sentence())
    return " ".join(para)

def generate_journal_entry():
    entry = []
    for _ in range(random.randint(1, 3)):
        entry.append(generate_paragraph())
    return "\\n\\n".join(entry)

def create_backpack():
    return {
        "item": "canvas backpack",
        "contents": {
            "journal": {
                "pages": random.randint(1, 12),
                "latest_entry": generate_journal_entry()
            }
        }
    }

if __name__ == "__main__":
    print("[low-end bridge active] Memory usage minimal, no LLM loaded.")
    backpack = create_backpack()
    print("\\n=== Backpack acquired ===")
    print(f"{backpack['item']} ({backpack['contents']['journal']['pages']} pages)\\n")
    print("--- Journal Entry ---")
    print(backpack['contents']['journal']['latest_entry'])
    print("--- End of entry ---\\n")`
};

// ==========================================
// 1.5 DETERMINISTIC BACKPACK & JOURNAL SEEDED GENERATION (TS Translation)
// ==========================================
const subjects = [
  "the floor", "the ceiling", "a wall", "my reflection", "the static", 
  "a door that wasn't there", "the humming", "my own shadow", 
  "a stain on the carpet", "the flickering light"
];

const verbs = [
  "folds into", "copies", "eats", "erases", "repeats", "whispers", 
  "bleeds into", "forgets", "multiplies", "breathes", "sweats", 
  "inverts", "splits", "mirrors"
];

const objects = [
  "itself", "a previous room", "nothing", "a sound I made 3 hours ago",
  "my footsteps", "the number 7", "a memory of the Frontrooms", 
  "an exit that leads deeper", "a clone of me", "a pool of almond water"
];

const adverbs = ["slowly", "silently", "infinitely", "wrongly", "backwards", "in 4/4 time"];
const adjectives = ["sticky", "mute", "inverted", "fractal", "hungry", "liminal"];

const locations = ["Level 0", "Level 1", "the crimson forest", "the poolrooms", "the hub", "an unnumbered level"];
const time_phrases = ["for 17 hours", "since I noclipped", "after the 9th turn", "before the lights changed"];

function makeSentence(randomizer: SeededRandomNumberGenerator): string {
  const templateIdx = Math.floor(randomizer.generateNextRandomFraction() * 5);
  switch (templateIdx) {
    case 0:
      return `${randomizer.choose(subjects)} ${randomizer.choose(verbs)} ${randomizer.choose(objects)} ${randomizer.choose(adverbs)}.`;
    case 1:
      return `In ${randomizer.choose(locations)}, ${randomizer.choose(adjectives)} ${randomizer.choose(subjects)} ${randomizer.choose(verbs)} ${randomizer.choose(objects)}.`;
    case 2: {
      const phrase = randomizer.choose(time_phrases);
      const capPhrase = phrase.charAt(0).toUpperCase() + phrase.slice(1);
      return `${capPhrase}, ${randomizer.choose(subjects)} ${randomizer.choose(verbs)} ${randomizer.choose(objects)}.`;
    }
    case 3:
      return `The ${randomizer.choose(adjectives)} ${randomizer.choose(['air', 'darkness', 'silence'])} ${randomizer.choose(verbs)} ${randomizer.choose(objects)}.`;
    case 4:
    default:
      return `I realize: ${randomizer.choose(subjects)} ${randomizer.choose(verbs)} ${randomizer.choose(objects)}. It shouldn't.`;
  }
}

function generateParagraph(randomizer: SeededRandomNumberGenerator, sentences_min = 3, sentences_max = 6): string {
  const count = randomizer.range(sentences_min, sentences_max);
  const para: string[] = [];
  for (let i = 0; i < count; i++) {
    para.push(makeSentence(randomizer));
  }
  return para.join(" ");
}

function generateJournalEntry(randomizer: SeededRandomNumberGenerator): string {
  const paras = randomizer.range(1, 3);
  const entry: string[] = [];
  for (let i = 0; i < paras; i++) {
    entry.push(generateParagraph(randomizer));
  }
  return entry.join("\n\n");
}

export interface BackpackItem {
  sx: number;
  sz: number;
  gx: number;
  gz: number;
  item: string;
  pages: number;
  latest_entry: string;
}

export function getBackpackInSector(sectorX: number, sectorZ: number, globalWorldSeed: number): BackpackItem | null {
  const seed = getSectorDeterministicSeed(sectorX, sectorZ, globalWorldSeed);
  const spawnRNG = new SeededRandomNumberGenerator(seed + 8888);
  
  // 6.5% chance per sector. Let's make it extremely rare but predictable.
  if (spawnRNG.generateNextRandomFraction() > 0.065) {
    return null;
  }

  // Find center coordinates using matching layout RNG states
  const roomRNG = new SeededRandomNumberGenerator(seed);
  const room_width = roomRNG.range(20, Math.min(80, 100)); // MAX_ROOM_SIZE
  const room_height = roomRNG.range(20, Math.min(80, 100));
  
  const sectorPadding = 10;
  const roomLeftX = sectorX * 128 + roomRNG.range(sectorPadding, 128 - room_width - sectorPadding);
  const roomTopZ = sectorZ * 128 + roomRNG.range(sectorPadding, 128 - room_height - sectorPadding);

  const globalPacksX = roomLeftX + Math.floor(room_width / 2);
  const globalPacksZ = roomTopZ + Math.floor(room_height / 2);

  const statsRNG = new SeededRandomNumberGenerator(seed + 9999);
  const totalPagesCount = statsRNG.range(1, 12);
  const generatedDiaryText = generateJournalEntry(statsRNG);

  return {
    sx: sectorX,
    sz: sectorZ,
    gx: globalPacksX,
    gz: globalPacksZ,
    item: "canvas backpack",
    pages: totalPagesCount,
    latest_entry: generatedDiaryText
  };
}

// Helper to retrieve all uncollected backpacks (both procedural & spawned) in a specific sector
function getUncollectedBackpacksInSector(
  sx: number,
  sz: number,
  worldSeed: number,
  collected: BackpackItem[],
  spawned: BackpackItem[]
): BackpackItem[] {
  const result: BackpackItem[] = [];

  // 1. Procedural Backpack
  const bpack = getBackpackInSector(sx, sz, worldSeed);
  if (bpack) {
    const isCollected = collected.some(
      c => Math.abs(c.gx - bpack.gx) < 0.1 && Math.abs(c.gz - bpack.gz) < 0.1
    );
    if (!isCollected) {
      result.push(bpack);
    }
  }

  // 2. Spawned Backpacks (within sector boundaries)
  for (const b of spawned) {
    if (b.sx === sx && b.sz === sz) {
      const isCollected = collected.some(
        c => Math.abs(c.gx - b.gx) < 0.1 && Math.abs(c.gz - b.gz) < 0.1
      );
      if (!isCollected) {
        result.push(b);
      }
    }
  }

  return result;
}

// Helper to determine relative distance and pointing direction to nearest backpack
function getNearestBackpack(
  px: number,
  pz: number,
  seed: number,
  collected: BackpackItem[],
  spawned: BackpackItem[]
) {
  const sx = Math.floor(px / 128);
  const sz = Math.floor(pz / 128);
  let closest: BackpackItem | null = null;
  let minDist = 999999;

  // Scan a 7x7 sector area around player (radius of 3 sectors)
  for (let osx = sx - 3; osx <= sx + 3; osx++) {
    for (let osz = sz - 3; osz <= sz + 3; osz++) {
      const items = getUncollectedBackpacksInSector(osx, osz, seed, collected, spawned);
      for (const bpack of items) {
        const dx = bpack.gx - px;
        const dz = bpack.gz - pz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDist) {
          minDist = dist;
          closest = bpack;
        }
      }
    }
  }

  if (closest) {
    const dx = closest.gx - px;
    const dz = closest.gz - pz;
    const angle = Math.atan2(dz, dx);
    return { bpack: closest, dist: minDist, angle };
  }
  return null;
}

export default function App() {
  // Config & Seed
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 899999) + 10000);
  const [viewMode, setViewMode] = useState<"2D" | "3D">("3D");
  const [speed, setSpeed] = useState<number>(8);
  const [isHumming, setIsHumming] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<keyof typeof PYTHON_CODES>("random_os.py"); // open random_os.py by default so the user immediately sees it
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [hasEscaped, setHasEscaped] = useState<boolean>(false);

    // Backpack & Journal State variables
  const [activeBackpack, setActiveBackpackReal] = useState<BackpackItem | null>(null);
  const activeBackpackRef = useRef<BackpackItem | null>(null);
  const setActiveBackpack = (b: BackpackItem | null) => {
    setActiveBackpackReal(b);
    activeBackpackRef.current = b;
  };
  const [collectedBackpacks, setCollectedBackpacks] = useState<BackpackItem[]>([]);
  const collectedBackpacksRef = useRef<BackpackItem[]>([]);
  const [selectedJournal, setSelectedJournal] = useState<BackpackItem | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<"code" | "lore" | "dev">("code");

  // 🛠️ Spawned Backpacks & Interactive Pickup Animation States
  const [spawnedBackpacks, setSpawnedBackpacks] = useState<BackpackItem[]>([]);
  const spawnedBackpacksRef = useRef<BackpackItem[]>([]);
  const setSpawnedBackpacksState = (arr: BackpackItem[]) => {
    setSpawnedBackpacks(arr);
    spawnedBackpacksRef.current = arr;
  };

  const [pickupAnim, setPickupAnim] = useState<{
    active: boolean;
    bpack: BackpackItem | null;
    phase: "inactive" | "approaching" | "extracting" | "opening" | "opened";
  }>({
    active: false,
    bpack: null,
    phase: "inactive",
  });
  const pickupAnimActiveRef = useRef<boolean>(false);
  const setPickupAnimState = (anim: typeof pickupAnim) => {
    setPickupAnim(anim);
    pickupAnimActiveRef.current = anim.active;
  };

  const [isPointerLocked, setIsPointerLocked] = useState<boolean>(false);
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredBackpackRef = useRef<BackpackItem | null>(null);

  // Widget function to spawn test backpack 2 tiles/feet in front of player
  const handleSpawnBackpack = () => {
    const px = playerXRef.current;
    const pz = playerZRef.current;
    const angle = playerAngleRef.current;
    const spawnX = px + Math.cos(angle) * 2;
    const spawnZ = pz + Math.sin(angle) * 2;
    
    // Generate randomized logs using deterministic mulberry RNG but seeded on current timestamp
    const devBeaconRandomizer = new SeededRandomNumberGenerator(Math.floor(Date.now() + Math.random() * 10000));
    const pages = devBeaconRandomizer.range(1, 15);
    const latest_entry = `[DEV TELEMETRY BEACON DEPLOYED]\n\n${generateJournalEntry(devBeaconRandomizer)}`;
    
    const b: BackpackItem = {
      sx: Math.floor(spawnX / 128),
      sz: Math.floor(spawnZ / 128),
      gx: spawnX,
      gz: spawnZ,
      item: "canvas backpack",
      pages,
      latest_entry,
    };
    
    setSpawnedBackpacksState([...spawnedBackpacks, b]);
  };

  const startBackpackPickupAnimation = (bpack: BackpackItem) => {
    setPickupAnimState({
      active: true,
      bpack,
      phase: "approaching",
    });
    
    // Smooth step-by-step timed cinematics
    setTimeout(() => {
      setPickupAnimState({
        active: true,
        bpack,
        phase: "extracting",
      });
    }, 1000);

    setTimeout(() => {
      setPickupAnimState({
        active: true,
        bpack,
        phase: "opening",
      });
    }, 2000);

    setTimeout(() => {
      setPickupAnimState({
        active: false,
        bpack: null,
        phase: "inactive",
      });
      // Stash diary in archive
      collectBackpack(bpack);
      // Open the journal sheet overlay immediately
      setActiveBackpack(bpack);
    }, 3000);
  };

  const collectBackpack = (bpack: BackpackItem) => {
    const updated = [...collectedBackpacks, bpack];
    setCollectedBackpacks(updated);
    collectedBackpacksRef.current = updated;
    if (!selectedJournal) {
      setSelectedJournal(bpack);
    }
  };
  
  // Real-time variables for UI binding
  const [hudStats, setHudStats] = useState({
    x: 64.0,
    z: 64.0,
    heading: 0.0,
    cx: 4,
    cz: 4,
    tileType: "room" as TileClassification["type"],
    sectorX: 0,
    sectorZ: 0,
    chunkCacheSize: 49,
    fps: 60,
  });

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Keyboard and Game loop tracking Refs to avoid React re-renders
  const playerXRef = useRef<number>(64.0); // start at exact middle of opening sector-0 room
  const playerZRef = useRef<number>(64.0);
  const playerAngleRef = useRef<number>(1.57); // facing North/South default
  const keysPressedRef = useRef<{ [key: string]: boolean }>({});
  
  // Web Audio Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const humOscRef = useRef<OscillatorNode | null>(null);
  const humGainRef = useRef<GainNode | null>(null);

  // Handle keypad clicks
  const handleKeyPad = (dir: string) => {
    const angle = playerAngleRef.current;
    let dx = 0;
    let dz = 0;
    if (viewMode === "3D") {
      if (dir === "forward") { dx = Math.cos(angle); dz = Math.sin(angle); }
      if (dir === "backward") { dx = -Math.cos(angle); dz = -Math.sin(angle); }
      if (dir === "left") { playerAngleRef.current -= 0.15; }
      if (dir === "right") { playerAngleRef.current += 0.15; }
    } else {
      if (dir === "forward") { dz = -1.2; }
      if (dir === "backward") { dz = 1.2; }
      if (dir === "left") { dx = -1.2; }
      if (dir === "right") { dx = 1.2; }
    }
    
    if (dx !== 0 || dz !== 0) {
      // Small tick
      const radius = 0.4;
      const mag = Math.sqrt(dx * dx + dz * dz);
      const ndx = dx / mag;
      const ndz = dz / mag;
      const proposed_dx = ndx * 1.5;
      const proposed_dz = ndz * 1.5;

      const next_x = playerXRef.current + proposed_dx;
      if (!checkCollision(next_x, playerZRef.current, radius, seed)) {
        playerXRef.current = next_x;
      }
      const next_z = playerZRef.current + proposed_dz;
      if (!checkCollision(playerXRef.current, next_z, radius, seed)) {
        playerZRef.current = next_z;
      }
    }
  };

  // Sound Hum control
  useEffect(() => {
    if (isHumming) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioCtxRef.current = ctx;

        // Base 60Hz hum oscillator (replicating alternating current leakage in old building fixtures)
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = 60; // 60Hz hum

        // Lowpass filter to avoid high-end buzz fatigue
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 110;

        // Volume control
        const gain = ctx.createGain();
        gain.gain.value = 0.04; // low ambient vibration

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        humOscRef.current = osc;
        humGainRef.current = gain;
      } catch (err) {
        console.error("Audio failed:", err);
      }
    } else {
      if (humOscRef.current) {
        try { humOscRef.current.stop(); } catch (e) {}
        humOscRef.current = null;
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
        audioCtxRef.current = null;
      }
    }

    return () => {
      if (humOscRef.current) {
        try { humOscRef.current.stop(); } catch (e) {}
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
      }
    };
  }, [isHumming]);

  // Handle Copy function
  const handleCopy = (fileName: keyof typeof PYTHON_CODES) => {
    navigator.clipboard.writeText(PYTHON_CODES[fileName]);
    setCopiedText(fileName);
    setTimeout(() => setCopiedText(null), 2000);
  };

    // Keyboard & Mouse looking listener registration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent scrolling on arrows/space
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
      keysPressedRef.current[e.key.toLowerCase()] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current[e.key.toLowerCase()] = false;
    };

    const handleLockChange = () => {
      const isLocked = document.pointerLockElement === canvasRef.current;
      setIsPointerLocked(isLocked);
    };

    const handleMouseMoveGaze = (e: MouseEvent) => {
      if (document.pointerLockElement === canvasRef.current && viewMode === "3D") {
        // Precise Horizontal Camera rotation by mouse movement while locked
        const sensitivity = 0.003;
        playerAngleRef.current += e.movementX * sensitivity;

        // Keep angle bounds comfortable
        if (playerAngleRef.current < 0) playerAngleRef.current += Math.PI * 2;
        if (playerAngleRef.current > Math.PI * 2) playerAngleRef.current -= Math.PI * 2;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    document.addEventListener("pointerlockchange", handleLockChange);
    window.addEventListener("mousemove", handleMouseMoveGaze);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("pointerlockchange", handleLockChange);
      window.removeEventListener("mousemove", handleMouseMoveGaze);
    };
  }, [viewMode]);

  // Align player to a safe, walkable position in Sector 0 whenever seed changes
  useEffect(() => {
    const center = getSafeCenterOfSector00(seed);
    playerXRef.current = center.x;
    playerZRef.current = center.z;
    playerAngleRef.current = 1.57; // Default face direction
  }, [seed]);

  // Frame Game Loop Handler (Standard dynamic ticker running at locked 30fps)
  useEffect(() => {
    let systemFrameAnimationrequestId: number;
    let highResolutionTimeOffsetNow = performance.now();
    let lastRenderFrameTimeOffsetNow = performance.now();
    const frameRenderIntervalCapMilliseconds = 1000 / 30; // Clean locked 30fps target interval (33.3ms)
    
    let renderedFramesTrackerCount = 0;
    let elapsedSecondsAccumulator = 0;
    let computedAverageFramesPerSecondValue = 30;

    const executeGameExecutionTick = (absoluteSystemTimestampNow: number) => {
      systemFrameAnimationrequestId = requestAnimationFrame(executeGameExecutionTick);

      const computedElapsedMillisecondsSinceLastFrame = absoluteSystemTimestampNow - lastRenderFrameTimeOffsetNow;
      if (computedElapsedMillisecondsSinceLastFrame < frameRenderIntervalCapMilliseconds) {
        return; // Target exactly 30 frames per second limit to guarantee target physics cadence
      }

      // Adjust last frame boundary to sustain stable timing and absorb system variance
      lastRenderFrameTimeOffsetNow = absoluteSystemTimestampNow - (computedElapsedMillisecondsSinceLastFrame % frameRenderIntervalCapMilliseconds);

      // 🎒 Check if active backpack journal is open or if pickup animation is active, freeze frame if so
      if (activeBackpackRef.current || pickupAnimActiveRef.current) {
        highResolutionTimeOffsetNow = absoluteSystemTimestampNow;
        return;
      }

      const deltaTimeScaleInSeconds = Math.min(0.1, (absoluteSystemTimestampNow - highResolutionTimeOffsetNow) / 1000.0); // scale speed dynamically to deltaTimeScaleInSeconds, cap to prevent large gaps
      highResolutionTimeOffsetNow = absoluteSystemTimestampNow;

      // Handle fps counter
      renderedFramesTrackerCount++;
      elapsedSecondsAccumulator += deltaTimeScaleInSeconds;
      if (elapsedSecondsAccumulator >= 1.0) {
        computedAverageFramesPerSecondValue = renderedFramesTrackerCount;
        renderedFramesTrackerCount = 0;
        elapsedSecondsAccumulator = 0;
      }

      // Read key states
      const activeKeysKeyboardStateReference = keysPressedRef.current;
      let lateralVelocityComponentX = 0;
      let forwardVelocityComponentZ = 0;
      const currentAngleRadians = playerAngleRef.current;
      const rotationSpeedScalarInRadiansPerSecond = 2.4; // rads per sec

      if (viewMode === "3D") {
        // First-person rotational/forward scheme
        if (activeKeysKeyboardStateReference["w"] || activeKeysKeyboardStateReference["arrowup"]) {
          lateralVelocityComponentX = Math.cos(currentAngleRadians);
          forwardVelocityComponentZ = Math.sin(currentAngleRadians);
        }
        if (activeKeysKeyboardStateReference["s"] || activeKeysKeyboardStateReference["arrowdown"]) {
          lateralVelocityComponentX = -Math.cos(currentAngleRadians);
          forwardVelocityComponentZ = -Math.sin(currentAngleRadians);
        }
        if (activeKeysKeyboardStateReference["a"] || activeKeysKeyboardStateReference["arrowleft"]) {
          playerAngleRef.current -= rotationSpeedScalarInRadiansPerSecond * deltaTimeScaleInSeconds;
        }
        if (activeKeysKeyboardStateReference["d"] || activeKeysKeyboardStateReference["arrowright"]) {
          playerAngleRef.current += rotationSpeedScalarInRadiansPerSecond * deltaTimeScaleInSeconds;
        }
      } else {
        // Cartesian top down scheme
        if (activeKeysKeyboardStateReference["w"] || activeKeysKeyboardStateReference["arrowup"]) {
          forwardVelocityComponentZ = -1;
        }
        if (activeKeysKeyboardStateReference["s"] || activeKeysKeyboardStateReference["arrowdown"]) {
          forwardVelocityComponentZ = 1;
        }
        if (activeKeysKeyboardStateReference["a"] || activeKeysKeyboardStateReference["arrowleft"]) {
          lateralVelocityComponentX = -1;
        }
        if (activeKeysKeyboardStateReference["d"] || activeKeysKeyboardStateReference["arrowright"]) {
          lateralVelocityComponentX = 1;
        }
      }

      // Enforce collision and displacement
      const playerBoundingRadiusFeet = 0.4;
      if (lateralVelocityComponentX !== 0 || forwardVelocityComponentZ !== 0) {
        const velocityCombinationMagnitude = Math.sqrt(lateralVelocityComponentX * lateralVelocityComponentX + forwardVelocityComponentZ * forwardVelocityComponentZ);
        const normalizedMovementDeltaX = lateralVelocityComponentX / velocityCombinationMagnitude;
        const normalizedMovementDeltaZ = forwardVelocityComponentZ / velocityCombinationMagnitude;
        const configuredMovementSpeedScalar = speed;

        const proposedMovementDistanceDeltaX = normalizedMovementDeltaX * configuredMovementSpeedScalar * deltaTimeScaleInSeconds;
        const proposedMovementDistanceDeltaZ = normalizedMovementDeltaZ * configuredMovementSpeedScalar * deltaTimeScaleInSeconds;

        const collectedQty = collectedBackpacksRef.current.length;
        const spawnedQty = spawnedBackpacksRef.current.length;

        // Slide check on X coordinate
        const provisionalPlayerPositionX = playerXRef.current + proposedMovementDistanceDeltaX;
        if (!checkCollision(provisionalPlayerPositionX, playerZRef.current, playerBoundingRadiusFeet, seed, collectedQty, spawnedQty)) {
          playerXRef.current = provisionalPlayerPositionX;
        }

        // Slide check on Z coordinate
        const provisionalPlayerPositionZ = playerZRef.current + proposedMovementDistanceDeltaZ;
        if (!checkCollision(playerXRef.current, provisionalPlayerPositionZ, playerBoundingRadiusFeet, seed, collectedQty, spawnedQty)) {
          playerZRef.current = provisionalPlayerPositionZ;
        }
      }

      // 🎒 PROXIMITY AND INTERACTION DETECT LOOP (No longer stashes auto, requires manual hover & click)
      const current_px = playerXRef.current;
      const current_pz = playerZRef.current;


      // Keep angle bounds comfortable
      if (playerAngleRef.current < 0) playerAngleRef.current += Math.PI * 2;
      if (playerAngleRef.current > Math.PI * 2) playerAngleRef.current -= Math.PI * 2;

      // Update state data for HUD readout (throttle UI slightly if needed, but react works ok at 60fps for simple bindings)
      const px = playerXRef.current;
      const pz = playerZRef.current;
      const chunkGridCoordinateX = Math.floor(px / 16);
      const chunkGridCoordinateZ = Math.floor(pz / 16);
      
      const collectedQty = collectedBackpacksRef.current.length;
      const spawnedQty = spawnedBackpacksRef.current.length;
      const classification = getTileClassification(Math.floor(px), Math.floor(pz), seed, collectedQty, spawnedQty);

      // Check if player noclipped or entered the exit tile
      if (classification.isExit) {
        setHasEscaped(true);
      }
      
      // Calculate fake PS2 heap loaded chunks based on loading distance radius of 3 (7x7 chunks = 49)
      const cachedChunks = 49; 

      setHudStats({
        x: px,
        z: pz,
        heading: playerAngleRef.current,
        cx: chunkGridCoordinateX,
        cz: chunkGridCoordinateZ,
        tileType: classification.type,
        sectorX: Math.floor(px / 128),
        sectorZ: Math.floor(pz / 128),
        chunkCacheSize: cachedChunks,
        fps: computedAverageFramesPerSecondValue,
      });

      // RENDER TRIGGER
      renderCanvas();
    };

    systemFrameAnimationrequestId = requestAnimationFrame(executeGameExecutionTick);
    return () => cancelAnimationFrame(systemFrameAnimationrequestId);
  }, [viewMode, speed, seed]);

  // Reset player start coordinates to a safe walkable room tile
  const handleReset = () => {
    const center = getSafeCenterOfSector00(seed);
    playerXRef.current = center.x;
    playerZRef.current = center.z;
    playerAngleRef.current = 1.57;
  };

  // Draw simulation viewport (either 2D or 3D) on HTML5 Canvas
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const px = playerXRef.current;
    const pz = playerZRef.current;
    const pAngle = playerAngleRef.current;

    // Cache getTileClassification per-frame to eliminate millions of redundant SeededRNG allocations
    const tileCache = new Map<string, TileClassification>();
    const getCachedTile = (tx: number, tz: number) => {
      const key = `${tx},${tz}`;
      let cached = tileCache.get(key);
      if (cached === undefined) {
        const collectedQty = collectedBackpacksRef.current.length;
        const spawnedQty = spawnedBackpacksRef.current.length;
        cached = getTileClassification(tx, tz, seed, collectedQty, spawnedQty);
        tileCache.set(key, cached);
      }
      return cached;
    };

    if (viewMode === "2D") {
      // ==========================================
      // RENDER 2D TOP-DOWN CHUNK RADAR MAP
      // ==========================================
      ctx.fillStyle = "#161614"; // background slate
      ctx.fillRect(0, 0, width, height);

      // Scale: meters to pixel spacing
      const scale = 14; 
      const centerX = width / 2;
      const centerY = height / 2;

      const camX_px = px * scale;
      const camZ_px = pz * scale;

      // Scan tile coordinates around the camera and render
      const tileRadiusX = Math.ceil(width / (scale * 2)) + 2;
      const tileRadiusZ = Math.ceil(height / (scale * 2)) + 2;

      const minX = Math.floor(px) - tileRadiusX;
      const maxX = Math.floor(px) + tileRadiusX;
      const minZ = Math.floor(pz) - tileRadiusZ;
      const maxZ = Math.floor(pz) + tileRadiusZ;

      for (let tx = minX; tx <= maxX; tx++) {
        for (let tz = minZ; tz <= maxZ; tz++) {
          const classif = getCachedTile(tx, tz);
          
          let color = "#1e1b12"; // solid void mass background
          if (classif.isImportOs) {
            if (classif.isExit) {
              color = "#10b981"; // Bright cybernetic green/emerald portal
            } else {
              color = "#556e30"; // Subtle brownish sage green indicating inactive glitch wall
            }
          } else if (!classif.solid) {
            if (classif.type === "room") {
              color = "#dfce89"; // Damp yellow room carpet
            } else if (classif.type === "hallway") {
              color = "#caa452"; // Hallway ochre carpet
            }
          } else {
            // Columns or Partitions
            if (classif.type === "pillar") {
              color = "#8b7e4f"; // Thick load-bearing pillar brown-beige
            } else if (classif.type === "wall") {
              color = "#605634"; // Dark inner partitions
            }
          }

          // Calculate screen position
          const screenX = centerX + (tx * scale - camX_px);
          const screenZ = centerY + (tz * scale - camZ_px);

          ctx.fillStyle = color;
          ctx.fillRect(screenX, screenZ, scale - 0.5, scale - 0.5);
        }
      }

      // Render Minecraft-style Chunk boundaries (16x16 tiles)
      const startCX = Math.floor(minX / 16);
      const endCX = Math.floor(maxX / 16);
      const startCZ = Math.floor(minZ / 16);
      const endCZ = Math.floor(maxZ / 16);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      for (let cx = startCX; cx <= endCX; cx++) {
        const lineX = centerX + (cx * 16 * scale - camX_px);
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, height);
        ctx.stroke();
      }
      for (let cz = startCZ; cz <= endCZ; cz++) {
        const lineZ = centerY + (cz * 16 * scale - camZ_px);
        ctx.beginPath();
        ctx.moveTo(0, lineZ);
        ctx.lineTo(width, lineZ);
        ctx.stroke();
      }

      // Draw Sector boundaries (128x128 tiles) - highlighting sector division
      const startSX = Math.floor(minX / 128);
      const endSX = Math.floor(maxX / 128);
      const startSZ = Math.floor(minZ / 128);
      const endSZ = Math.floor(maxZ / 128);

      ctx.strokeStyle = "rgba(234, 179, 8, 0.25)";
      ctx.lineWidth = 1.8;
      for (let sx = startSX; sx <= endSX; sx++) {
        const lineX = centerX + (sx * 128 * scale - camX_px);
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, height);
        ctx.stroke();
      }
      for (let sz = startSZ; sz <= endSZ; sz++) {
        const lineZ = centerY + (sz * 128 * scale - camZ_px);
        ctx.beginPath();
        ctx.moveTo(0, lineZ);
        ctx.lineTo(width, lineZ);
        ctx.stroke();
      }

      // 🎒 Draw uncollected backpacks on 2D radar map
      for (let osx = startSX; osx <= endSX; osx++) {
        for (let osz = startSZ; osz <= endSZ; osz++) {
          const items = getUncollectedBackpacksInSector(
            osx,
            osz,
            seed,
            collectedBackpacksRef.current,
            spawnedBackpacksRef.current
          );
          for (const bpack of items) {
            const screenX = centerX + (bpack.gx * scale - camX_px);
            const screenZ = centerY + (bpack.gz * scale - camZ_px);

              ctx.save();
              // Glowing orange background ring
              ctx.fillStyle = "#f59e0b";
              ctx.shadowColor = "#f59e0b";
              ctx.shadowBlur = 6;
              ctx.beginPath();
              ctx.arc(screenX + scale / 2, screenZ + scale / 2, scale * 0.45, 0, Math.PI * 2);
              ctx.fill();

              // Tiny backpack label emoji
              ctx.shadowBlur = 0;
              ctx.font = "bold 8px monospace";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("🎒", screenX + scale / 2, screenZ + scale / 2);
              ctx.restore();
            }
          }
        }

      // Draw player collision bubble (Green circle)
      const pScreenX = centerX;
      const pScreenZ = centerY;
      const pRadiusPixel = 0.4 * scale;

      // Hitbox radius outline
      ctx.fillStyle = "rgba(34, 197, 94, 0.3)";
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pScreenX, pScreenZ, Math.max(5, pRadiusPixel), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Heading facing vector line
      ctx.beginPath();
      ctx.moveTo(pScreenX, pScreenZ);
      ctx.lineTo(pScreenX + Math.cos(pAngle) * 16, pScreenZ + Math.sin(pAngle) * 16);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw Sector Coords Badge
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(8, 8, 140, 24);
      ctx.fillStyle = "#fbbf24";
      ctx.font = "10px monospace";
      ctx.fillText(`Sector: [${Math.floor(px / 128)}, ${Math.floor(pz / 128)}]`, 15, 24);

    } else {
      // ==========================================
      // RENDER RETRO 3D RAYCASTER VIEWPORT
      // ==========================================
      // 1. Draw solid ceiling
      ctx.fillStyle = "#272418"; // dark yellow floor ceiling mix
      ctx.fillRect(0, 0, width, height / 2);
      
      // Draw a subtle dark fog gradient over ceiling
      const ceilingGrad = ctx.createLinearGradient(0, 0, 0, height / 2);
      ceilingGrad.addColorStop(0, "rgba(10, 10, 8, 0.4)");
      ceilingGrad.addColorStop(1, "rgba(22, 20, 14, 0.95)");
      ctx.fillStyle = ceilingGrad;
      ctx.fillRect(0, 0, width, height / 2);

      // 2. Draw solid floor
      ctx.fillStyle = "#3e3820"; // mono-wet carpet brown
      ctx.fillRect(0, height / 2, width, height / 2);

      const floorGrad = ctx.createLinearGradient(0, height / 2, 0, height);
      floorGrad.addColorStop(0, "rgba(22, 20, 14, 0.95)");
      floorGrad.addColorStop(1, "rgba(62, 56, 32, 0.35)");
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, height / 2, width, height / 2);

      // Draw custom ceiling rows representing scary fluorescent light racks
      // (Lines mapped on perspective grids)
      ctx.fillStyle = "rgba(255, 255, 220, 0.3)";
      for (let r = 1; r < 4; r++) {
        // Simple ambient tube strips painted above
        const offset = Math.sin(pAngle * 2 + r) * 150 + (width / 2);
        ctx.fillRect(offset - 20, height / 4 - 8, 40, 3);
      }

      // 3. Cast rays for each vertical pixel slice column (optimized for performance and chunkier 3D retro look)
      const FOV = Math.PI / 3.0; // 60 degrees fov
      const rWidth = 2; // Cast 1 ray every 2 pixels for low-res PS1 feel & 2x ray reduction
      const rays = Math.ceil(width / rWidth); 

      // Alloc zBuffer for dimensional backpack occlusion
      const zBuffer = new Array<number>(rays).fill(1000.0);

      for (let col = 0; col < rays; col++) {
        // Angle of current ray relative to player heading
        const rayAngle = pAngle - FOV / 2.0 + (col / rays) * FOV;

        let dist = 0;
        const rayStep = 0.14; // optimized step size to double performance & reduce RNG calls
        const maxDrawDist = 48.0; // max draw distance
        let collided = false;
        let cType: TileClassification["type"] = "outside";
        let isRayOsAnomaly = false;
        let isRayOsExit = false;

        let rx = px;
        let rz = pz;

        const sinA = Math.sin(rayAngle);
        const cosA = Math.cos(rayAngle);

        while (dist < maxDrawDist) {
          rx += cosA * rayStep;
          rz += sinA * rayStep;
          dist += rayStep;

          const testTileX = Math.floor(rx);
          const testTileZ = Math.floor(rz);

          const check = getCachedTile(testTileX, testTileZ);
          if (check.solid || check.isExit) {
            collided = true;
            cType = check.type;
            isRayOsAnomaly = !!check.isImportOs;
            isRayOsExit = !!check.isExit;
            break;
          }
        }

        if (collided) {
          // Remove fish-eye curve artifact and fetch precise plane projection distance
          const correctedDist = dist * Math.cos(rayAngle - pAngle);
          zBuffer[col] = correctedDist; // Record depth
          
          // Compute wall segment heights
          const scaleOffset = 1.3;
          let wallHeight = Math.min(height, (height / (correctedDist + 0.1)) * scaleOffset);

          // Build realistic depth shadowing (fog gradient)
          let visibility = Math.min(1.0, 1.4 / (correctedDist + 0.15));
          if (isRayOsAnomaly) {
            // Glitchy glow: anomaly walls retain custom glowing resilience in deep fog, remaining visible from afar
            visibility = Math.max(visibility, 0.45);
          }
          
          let baseColor = "#c5b78c"; // Wallpaper gold
          if (isRayOsAnomaly && isRayOsExit) {
            // Seemingly normal but subtly off cold greenish gold (os code leaking through wallpaper)
            baseColor = "#b2be8a"; 
          } else if (cType === "pillar") {
            baseColor = "#a7996f"; // Column heavy beige
          } else if (cType === "wall") {
            baseColor = "#928559"; // Partition walls
          } else {
            baseColor = "#443f2a"; // Far structures
          }

          // Shading: calculate brightness multiplier [0, 1]
          const shadeR = Math.floor(parseInt(baseColor.slice(1, 3), 16) * visibility);
          const shadeG = Math.floor(parseInt(baseColor.slice(3, 5), 16) * visibility);
          const shadeB = Math.floor(parseInt(baseColor.slice(5, 7), 16) * visibility);

          ctx.fillStyle = `rgb(${shadeR}, ${shadeG}, ${shadeB})`;

          // Draw the narrow column wall slice
          // EXPLANATORY COMMENT: Instead of horizontal mirroring the whole column projection index (which causes detached wall segments due to ray overlapping), we render at the true column screen coordinate, but keep the flipped wallpaper elevation details.
          const targetDrawColX = col * rWidth;
          const startY = (height - wallHeight) / 2;
          ctx.fillRect(targetDrawColX, startY, rWidth + 0.1, wallHeight);

          // Draw a faint black wallpaper border pattern line aligned around mid-height (Level-0 trim line)
          if (correctedDist < 20) {
            ctx.fillStyle = `rgba(30, 25, 10, ${0.4 * visibility})`;
            // EXPLANATORY COMMENT: For "import os" anomalies, we mirror the elevation of the wall details vertically (0.25 scaling near the ceiling grid instead of 0.75 near the carpet) to reinforce the reverse orientation!
            const verticalTrimOffsetRatio = isRayOsAnomaly ? 0.25 : 0.75;
            ctx.fillRect(targetDrawColX, startY + wallHeight * verticalTrimOffsetRatio, rWidth + 0.1, Math.max(1, wallHeight * 0.04));
          }
        }
      }

      // ==========================================
      // BILLBOARD RENDER: RARE BACKPACK SPRITES IN 3D
      // ==========================================
      const playerSectorX = Math.floor(px / 128);
      const playerSectorZ = Math.floor(pz / 128);

      // Reset hover target back rooms
      hoveredBackpackRef.current = null;

      for (let osx = playerSectorX - 2; osx <= playerSectorX + 2; osx++) {
        for (let osz = playerSectorZ - 2; osz <= playerSectorZ + 2; osz++) {
          const items = getUncollectedBackpacksInSector(
            osx,
            osz,
            seed,
            collectedBackpacksRef.current,
            spawnedBackpacksRef.current
          );
          for (const bpack of items) {
            const dx = bpack.gx - px;
            const dz = bpack.gz - pz;
            const bDistance = Math.sqrt(dx * dx + dz * dz);

            if (bDistance > 0.3 && bDistance < 40.0) {
              // Direction vector relative to player heading
              let bAngle = Math.atan2(dz, dx) - pAngle;
              while (bAngle < -Math.PI) bAngle += Math.PI * 2;
              while (bAngle > Math.PI) bAngle -= Math.PI * 2;

              const bFOV = Math.PI / 3.0;
              if (Math.abs(bAngle) < bFOV / 1.5 + 0.4) {
                // Project backpack onto coordinate column
                const bScreenX = (width / 2) + Math.tan(bAngle) * (width / 2) / Math.tan(bFOV / 2);
                const bSpriteSize = Math.min(height, (height / (bDistance + 0.1)) * 1.6);
                
                // Read z-buffer around the center of the sprite (mapping from pixel screen x to zBuffer column index)
                const startPixel = bScreenX - bSpriteSize / 4;
                const endPixel = bScreenX + bSpriteSize / 4;
                const startCol = Math.floor(startPixel / rWidth);
                const endCol = Math.floor(endPixel / rWidth);
                
                // Check if any column is closer than the backpack
                let matchCount = 0;
                let checkCount = 0;
                for (let col = startCol; col <= endCol; col++) {
                  if (col >= 0 && col < rays) {
                    checkCount++;
                    if (bDistance < zBuffer[col] + 0.3) {
                      matchCount++;
                    }
                  }
                }
                
                // If most columns are visible, render it!
                if (checkCount === 0 || (matchCount / checkCount) > 0.4) {
                  ctx.save();
                  
                  // Draw footprint ellipse (shadow)
                  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
                  ctx.beginPath();
                  ctx.ellipse(
                    bScreenX, 
                    height / 2 + bSpriteSize * 0.3, 
                    bSpriteSize * 0.2, 
                    bSpriteSize * 0.06, 
                    0, 0, Math.PI * 2
                  );
                  ctx.fill();

                  // Hover target calculation
                  let isHovered = false;
                  const m = mousePosRef.current || (document.pointerLockElement === canvasRef.current ? { x: width / 2, y: height / 2 } : null);
                  if (m && bDistance < 15.0) {
                    const hRange = bSpriteSize * 0.4;
                    const vRange = bSpriteSize * 0.4;
                    const canvasBackpackY = height / 2 + bSpriteSize * 0.2;
                    if (
                      m.x >= bScreenX - hRange &&
                      m.x <= bScreenX + hRange &&
                      m.y >= canvasBackpackY - vRange &&
                      m.y <= canvasBackpackY + vRange
                    ) {
                      isHovered = true;
                      hoveredBackpackRef.current = bpack;
                    }
                  }

                  // Render white glow outline if hovered!
                  if (isHovered) {
                    ctx.save();
                    // Outer atmospheric white glow ring
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
                    ctx.lineWidth = Math.max(3, bSpriteSize * 0.07);
                    ctx.shadowColor = "#ffffff";
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.arc(bScreenX, height / 2 + bSpriteSize * 0.2, bSpriteSize * 0.36, 0, Math.PI * 2);
                    ctx.stroke();

                    // Edge silhouette stroked text on backpack emoji
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = Math.max(4, bSpriteSize * 0.09);
                    ctx.font = `${bSpriteSize * 0.65}px Georgia, serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.strokeText("🎒", bScreenX, height / 2 + bSpriteSize * 0.2);
                    ctx.restore();
                  }

                  // Render backpack indicator emoji
                  ctx.font = `${bSpriteSize * 0.65}px Georgia, serif`;
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";
                  ctx.fillText("🎒", bScreenX, height / 2 + bSpriteSize * 0.2);

                  // Dynamic floating action label
                  if (bDistance < 8.0) {
                    ctx.font = "bold 10px monospace";
                    ctx.fillStyle = isHovered ? "#ffffff" : "#fbbf24";
                    ctx.shadowColor = "#000000";
                    ctx.shadowBlur = 4;
                    ctx.fillText("🎒 canvas backpack", bScreenX, height / 2 - bSpriteSize * 0.22);
                    
                    ctx.font = "9px monospace";
                    ctx.fillStyle = isHovered ? "#ffffff" : "#22c55e";
                    ctx.fillText(isHovered ? "[CLICK TO OPEN]" : "[HOVER / CLICK TO INSPECT]", bScreenX, height / 2 - bSpriteSize * 0.22 + 12);
                  }
                  ctx.restore();
                }
              }
            }
          }
        }
      }

      // Draw dynamic crosshair grid (PS2 retro aesthetic targeting point)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 8, height / 2);
      ctx.lineTo(width / 2 + 8, height / 2);
      ctx.moveTo(width / 2, height / 2 - 8);
      ctx.lineTo(width / 2, height / 2 + 8);
      ctx.stroke();

      // Ambient VHS noise overlay filter for retro look
      ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
      for (let i = 0; i < 60; i++) {
        const ny = Math.random() * height;
        ctx.fillRect(0, ny, width, 1.5);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0d] text-[#e3e3dc] flex flex-col font-sans" id="backrooms-app">
      {/* HEADER SECTION */}
      <header className="border-b border-[#2e2e2b] bg-[#141413] px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-md" id="header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-yellow-500/10 rounded-lg border border-yellow-500/35 flex items-center justify-center animate-pulse" id="panel-logo">
            <Flame className="w-6 h-6 text-yellow-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#f2e9be]" id="title-text">
              Infinite Backrooms Generator
            </h1>
            <p className="text-xs text-[#a2a299] mt-0.5" id="subtitle-text">
              PS2 Procedural Pipeline Emulation (1 tile = 1 ft, Chunks: 16x16)
            </p>
          </div>
        </div>

        {/* CONTROLS BAR */}
        <div className="flex items-center flex-wrap gap-3" id="config-controls">
          {/* Seeding Inputs */}
          <div className="flex items-center gap-1.5 bg-[#1b1b1a] px-3 py-1.5 rounded-lg border border-[#2e2e2b]" id="seed-group">
            <span className="text-xs text-[#a2a299] font-mono select-none">Seed:</span>
            <input 
              id="seed-input"
              type="number" 
              className="bg-transparent border-none text-yellow-400 font-mono text-sm w-16 focus:ring-0 focus:outline-none p-0"
              value={seed} 
              onChange={(e) => setSeed(parseInt(e.target.value) || 1)}
            />
            <button
              id="randomize-seed-btn"
              onClick={() => {
                const newSeed = Math.floor(Math.random() * 899999) + 10000;
                setSeed(newSeed);
              }}
              title="Generate Random Seed"
              className="text-[#a2a299] hover:text-yellow-400 transition-colors ml-1 p-0.5 flex items-center justify-center rounded hover:bg-[#252523]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Hum Generator */}
          <button 
            id="audio-buzz-btn"
            onClick={() => setIsHumming(!isHumming)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg border text-xs font-medium font-mono transition-all duration-300 ${
              isHumming 
                ? "bg-yellow-500/10 border-yellow-500 text-yellow-400 font-bold glow" 
                : "bg-[#1b1b1a] border-[#2e2e2b] text-[#a2a299] hover:bg-[#252523]"
            }`}
          >
            {isHumming ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            {isHumming ? "Audio Buzz: On" : "Audio Buzz: Off"}
          </button>

          {/* Reset Position */}
          <button 
            id="re-spawn-btn"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2e2e2b] bg-[#1b1b1a] text-[#c5c5bb] text-xs hover:bg-[#252523] hover:text-[#f3f3e9] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Respawn (Sector 0)
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6" id="main-content">
        
        {/* LEFT COLUMN: SIMULATOR */}
        <section className="lg:col-span-7 flex flex-col gap-4" id="sim-section">
          <div className="bg-[#141413] border border-[#2e2e2b] rounded-xl overflow-hidden shadow-lg flex flex-col" id="viewport-panel">
            {/* View Mode Select Area */}
            <div className="bg-[#1b1b1a] px-4 py-3 border-b border-[#2e2e2b] flex justify-between items-center" id="viewer-header">
              <div className="flex items-center gap-2" id="viewer-title">
                <Compass className="w-4 h-4 text-yellow-500" />
                <span className="text-xs font-mono font-bold tracking-wider text-[#d4ca9d] uppercase">
                  SIMULATION STAGE
                </span>
              </div>

              <div className="flex gap-1.5 bg-[#0e0e0d] p-1 rounded-lg border border-[#2e2e2b]" id="view-mode-toggle">
                <button
                  id="3d-view-toggle"
                  onClick={() => setViewMode("3D")}
                  className={`px-3 py-1 rounded text-xs font-medium font-mono transition-all ${
                    viewMode === "3D" 
                      ? "bg-yellow-500/20 text-yellow-400 font-bold" 
                      : "text-[#a2a299] hover:text-[#eaeae0]"
                  }`}
                >
                  Retro 3D Raycaster
                </button>
                <button
                  id="2d-view-toggle"
                  onClick={() => setViewMode("2D")}
                  className={`px-3 py-1 rounded text-xs font-medium font-mono transition-all ${
                    viewMode === "2D" 
                      ? "bg-yellow-500/20 text-yellow-400 font-bold" 
                      : "text-[#a2a299] hover:text-[#eaeae0]"
                  }`}
                >
                  2D Radar Map
                </button>
              </div>
            </div>

            {/* Interactive Canvas */}
            <div className="relative bg-[#060606] flex items-center justify-center p-2 xl:p-4 aspect-video" id="canvas-container">
              <canvas 
                id="viewport-canvas"
                ref={canvasRef}
                width={520}
                height={320}
                onClick={(e) => {
                  // Request mouse lock when canvas is clicked in 3D
                  if (viewMode === "3D" && document.pointerLockElement !== canvasRef.current) {
                    canvasRef.current?.requestPointerLock();
                    return;
                  }
                  
                  // Handle backpack click pickup trigger
                  if (hoveredBackpackRef.current) {
                    startBackpackPickupAnimation(hoveredBackpackRef.current);
                  }
                }}
                onMouseMove={(e) => {
                  if (canvasRef.current) {
                    if (document.pointerLockElement === canvasRef.current) {
                      mousePosRef.current = { x: canvasRef.current.width / 2, y: canvasRef.current.height / 2 };
                    } else {
                      const rect = canvasRef.current.getBoundingClientRect();
                      const x = ((e.clientX - rect.left) / rect.width) * canvasRef.current.width;
                      const y = ((e.clientY - rect.top) / rect.height) * canvasRef.current.height;
                      mousePosRef.current = { x, y };
                    }
                  }
                }}
                onMouseLeave={() => {
                  if (document.pointerLockElement !== canvasRef.current) {
                    mousePosRef.current = null;
                  }
                }}
                className={`w-full h-auto bg-[#040404] rounded shadow-inner max-w-full border border-[#252523] ${
                  viewMode === "3D" ? "cursor-crosshair" : "cursor-default"
                }`}
              />
              {/* Keyboard WASD instruction Overlay for Desktop */}
              <div className="absolute top-4 right-4 bg-black/75 px-3 py-1.5 rounded text-[10px] font-mono text-[#a2a299] select-none border border-white/5 pointer-events-none hidden sm:block" id="keyboard-guide">
                {viewMode === "3D" ? (
                  <>
                    Controls: <span className="text-yellow-400 font-bold">W/A/S/D</span> | <span className="text-yellow-400 font-bold">Mouse Look</span> | {isPointerLocked ? <span className="text-green-400 font-bold">LOCKED (ESC to Free)</span> : <span className="text-yellow-400 font-bold">Click to Lock Mouse</span>}
                  </>
                ) : (
                  <>
                    Controls: <span className="text-yellow-400 font-bold">W / A / S / D</span> or <span className="text-yellow-400 font-bold">Arrows</span> to Walk
                  </>
                )}
              </div>
            </div>

            {/* Directional Pad Controls Panel (Perfect for touch/mouse users) */}
            <div className="bg-[#1b1b1a] p-4 border-t border-[#2e2e2b] flex flex-col md:flex-row justify-between items-center gap-4" id="view-controls">
              
              {/* Movement Speed controls */}
              <div className="flex items-center gap-3 w-full md:w-auto" id="speed-slider-group">
                <label className="text-xs text-[#a2a299] font-mono select-none" htmlFor="speed-slider">Speed: {speed} ft/s</label>
                <input 
                  id="speed-slider"
                  type="range" 
                  min="3" 
                  max="15" 
                  className="accent-yellow-500 flex-1 h-1 bg-[#2e2e2b] rounded-lg cursor-pointer"
                  value={speed}
                  onChange={(e) => setSpeed(parseInt(e.target.value))}
                />
              </div>

              {/* D-PAD joystick */}
              <div className="flex items-center gap-2 select-none" id="joystick-pad">
                <div className="text-center font-mono text-[10px] text-[#a2a299] mr-2">
                  {viewMode === "3D" ? "Turn & Step" : "Compass Pad"}
                </div>
                <div className="grid grid-cols-3 gap-1 w-28 h-20" id="dp-btns">
                  <div></div>
                  <button 
                    id="pad-up"
                    onClick={() => handleKeyPad("forward")}
                    className="bg-[#242422] border border-[#3e3e3b] text-[#eaeae0] rounded hover:bg-yellow-500/20 hover:border-yellow-500/40 font-mono font-bold text-xs flex items-center justify-center p-2 active:scale-95"
                  >
                    ▲
                  </button>
                  <div></div>
                  <button 
                    id="pad-left"
                    onClick={() => handleKeyPad("left")}
                    className="bg-[#242422] border border-[#3e3e3b] text-[#eaeae0] rounded hover:bg-yellow-500/20 hover:border-yellow-500/40 font-mono font-bold text-xs flex items-center justify-center p-2 active:scale-95"
                  >
                    ◀
                  </button>
                  <button 
                    id="pad-down"
                    onClick={() => handleKeyPad("backward")}
                    className="bg-[#242422] border border-[#3e3e3b] text-[#eaeae0] rounded hover:bg-yellow-500/20 hover:border-yellow-500/40 font-mono font-bold text-xs flex items-center justify-center p-2 active:scale-95"
                  >
                    ▼
                  </button>
                  <button 
                    id="pad-right"
                    onClick={() => handleKeyPad("right")}
                    className="bg-[#242422] border border-[#3e3e3b] text-[#eaeae0] rounded hover:bg-yellow-500/20 hover:border-yellow-500/40 font-mono font-bold text-xs flex items-center justify-center p-2 active:scale-95"
                  >
                    ▶
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* INSPECTOR READOUT METADATA */}
          <div className="bg-[#141413] border border-[#2e2e2b] rounded-xl p-4 flex flex-col gap-3 shadow-lg" id="inspector-panel">
            <div className="flex items-center gap-2 text-xs font-mono tracking-wider font-bold text-[#d4ca9d] select-none" id="inspect-header">
              <Info className="w-4 h-4 text-yellow-500" />
              REAL-TIME MEMORY READOUT
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#1b1b1a] p-3.5 rounded-lg border border-[#232321] font-mono text-xs" id="grid-stats">
              <div id="stat-x">
                <span className="block text-[10px] text-[#a2a299]">COORD X (FEET)</span>
                <span className="text-md font-bold text-yellow-400">{hudStats.x.toFixed(2)}</span>
              </div>
              <div id="stat-z">
                <span className="block text-[10px] text-[#a2a299]">COORD Z (FEET)</span>
                <span className="text-md font-bold text-yellow-400">{hudStats.z.toFixed(2)}</span>
              </div>
              <div id="stat-chunk">
                <span className="block text-[10px] text-[#a2a299]">CURRENT CHUNK</span>
                <span className="text-md font-bold text-[#eaeae0]">{`cx=${hudStats.cx}, cz=${hudStats.cz}`}</span>
              </div>
              <div id="stat-region">
                <span className="block text-[10px] text-[#a2a299]">ACTIVE SECTOR</span>
                <span className="text-md font-bold text-[#eaeae0]">{`[${hudStats.sectorX}, ${hudStats.sectorZ}]`}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border border-[#252523] rounded-lg gap-2 text-xs bg-[#0e0e0d]" id="inspect-classification">
              <div className="flex items-center gap-2" id="classification-detect">
                <span className="text-[#a2a299] font-mono uppercase text-[10px]">classification lookup:</span>
                <span className={`px-2 py-0.5 rounded font-mono text-xs font-bold uppercase select-none ${
                  hudStats.tileType === "room"
                    ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                    : hudStats.tileType === "hallway"
                    ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
                    : hudStats.tileType === "pillar"
                    ? "bg-red-500/25 text-red-500 border border-red-500/40"
                    : hudStats.tileType === "wall"
                    ? "bg-orange-500/20 text-orange-500 border border-orange-500/40"
                    : "bg-[#252523] text-[#7d7d74]"
                }`} id="class-badge">
                  {hudStats.tileType === "pillar" 
                    ? "pillar column (solid)" 
                    : hudStats.tileType === "wall" 
                    ? "partition (solid)" 
                    : hudStats.tileType === "outside" 
                    ? "void barrier (solid)" 
                    : `${hudStats.tileType} floor (walkable)`}
                </span>
              </div>
              
              <div className="font-mono text-[10px] text-[#a2a299] flex gap-3 self-end sm:self-auto" id="diagnostics">
                <span>SIM CACHE: {hudStats.chunkCacheSize} chk</span>
                <span>FPS: {hudStats.fps}</span>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: CODE CENTER & LORE HUB */}
        <section className="lg:col-span-5 flex flex-col gap-4" id="code-section">
          
          {/* TABS SWITCHER */}
          <div className="flex gap-2 bg-[#141413] p-1 rounded-xl border border-[#2e2e2b]" id="right-column-tabber">
            <button
              id="right-panel-tab-code"
              onClick={() => setRightPanelTab("code")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 ${
                rightPanelTab === "code" 
                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/35" 
                  : "text-[#a2a299] hover:text-[#eaeae0]"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Code
            </button>
            <button
              id="right-panel-tab-lore"
              onClick={() => setRightPanelTab("lore")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 ${
                rightPanelTab === "lore" 
                  ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/35" 
                  : "text-[#a2a299] hover:text-[#eaeae0]"
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              Logbook ({collectedBackpacks.length})
            </button>
            <button
              id="right-panel-tab-dev"
              onClick={() => setRightPanelTab("dev")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 ${
                rightPanelTab === "dev" 
                  ? "bg-red-500/20 text-red-400 border border-red-500/35" 
                  : "text-[#a2a299] hover:text-[#eaeae0]"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Dev Portal
            </button>
          </div>

          {rightPanelTab === "code" && (
            <div className="flex flex-col gap-4 animate-fade-in" id="code-tab-container">
              {/* PROCEDURAL ARCHITECTURE CARD */}
              <div className="bg-[#141413] border border-[#2e2e2b] rounded-xl p-5 shadow-lg flex flex-col gap-3" id="explainer-panel">
                <h3 className="text-sm font-mono tracking-wider font-bold text-[#d4ca9d] flex items-center gap-2 select-none" id="explain-header">
                  <Settings className="w-4 h-4 text-yellow-500 animate-spin" />
                  PS2 SECTOR ARCHITECTURE
                </h3>
                
                <p className="text-xs text-[#a2a299] leading-relaxed" id="p1">
                  To achieve Minecraft-like infinite gameplay on vintage hardware (such as 
                  the PS2's tight <strong>32MB memory ceiling</strong>), the engine generates coordinates on-the-fly. 
                  Instead of saving full grids, files are lazy-loaded within circles around the player, 
                  and distant grids auto-serialize.
                </p>

                <ul className="text-xs text-[#c5c5bb] space-y-2 list-none" id="rules-checklist">
                  <li className="flex items-start gap-2" id="rule-room">
                    <ChevronRight className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                    <span>
                      <strong>Infinite Rooms:</strong> Max size is restricted to <strong>100x100 sq ft</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2" id="rule-hall">
                    <ChevronRight className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      <strong>Hallway Corridors:</strong> Maximum width is locked at <strong>10 ft</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2" id="rule-pillar">
                    <ChevronRight className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span>
                      <strong>Supporting Columns:</strong> Never spawn within <strong>4 ft</strong> of each other.
                    </span>
                  </li>
                  <li className="flex items-start gap-2" id="rule-partition">
                    <ChevronRight className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                    <span>
                      <strong>Partitions:</strong> Wall segments generate procedurally inside rooms to form maze partitions.
                    </span>
                  </li>
                </ul>
              </div>

              {/* PYTHON FILE EXPORTER TABBED BOX */}
              <div className="bg-[#141413] border border-[#2e2e2b] rounded-xl flex-1 flex flex-col shadow-lg overflow-hidden min-h-[350px]" id="code-browser">
                <div className="bg-[#1b1b1a] px-4 py-3 border-b border-[#2e2e2b] flex items-center gap-2" id="code-header">
                  <FileText className="w-4 h-4 text-yellow-500" />
                  <span className="text-xs font-mono font-bold tracking-wider text-[#d4ca9d] uppercase select-none">
                    PYTHON SOURCE FILES (.PY)
                  </span>
                </div>

                {/* File navigator tabs */}
                <div className="flex flex-wrap border-b border-[#20201e] bg-[#1a1a19] p-1 gap-1" id="file-tabs">
                  {(Object.keys(PYTHON_CODES) as Array<keyof typeof PYTHON_CODES>).map((fileName) => (
                    <button
                      id={`tab-${fileName.replace('.', '-')}`}
                      key={fileName}
                      onClick={() => setActiveTab(fileName)}
                      className={`px-3 py-1.5 rounded text-xs font-mono select-none transition-all ${
                        activeTab === fileName
                          ? "bg-[#0e0e0d] text-yellow-400 border border-[#2e2e2b]"
                          : "text-[#a2a299] hover:bg-[#252523] hover:text-[#eaeae0]"
                      }`}
                    >
                      {fileName}
                    </button>
                  ))}
                </div>

                {/* Display code viewport */}
                <div className="relative flex-1 bg-[#0e0e0d] flex flex-col overflow-hidden animate-fade-in" id="code-body">
                  <button
                    id="copy-code-btn"
                    onClick={() => handleCopy(activeTab)}
                    className="absolute top-3 right-3 p-2 bg-[#1b1b1a] hover:bg-[#2e2e2b] text-yellow-500 hover:text-yellow-400 rounded-lg border border-[#2d2d2a] transition-all flex items-center justify-center shadow"
                    title="Copy contents to clipboard"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedText === activeTab && (
                      <span className="text-[10px] font-mono text-green-400 ml-1.5 font-bold">
                        Copied!
                      </span>
                    )}
                  </button>

                  <pre className="p-4 flex-1 overflow-auto text-[11px] font-mono text-[#cacabc] leading-relaxed max-h-[480px]" id="code-text-block">
                    {PYTHON_CODES[activeTab]}
                  </pre>
                </div>

                {/* Code metadata Footer */}
                <div className="bg-[#1b1b1a] p-3.5 border-t border-[#2e2e2b] text-xs font-mono flex items-center justify-between text-[#8a8a81]" id="code-footer">
                  <span>Ready for copy to: backrooms_game/</span>
                  <a 
                    id="repo-guide"
                    href="#how-to" 
                    onClick={(e) => {
                      e.preventDefault();
                      alert("To run this code locally, create the file list in a folder named 'backrooms_game', save each file, run 'pip install pygame' (optional if you want graphic display), and run 'python main.py'!");
                    }}
                    className="text-yellow-500 hover:underline inline-flex items-center gap-1"
                  >
                    Launch instructions <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {rightPanelTab === "lore" && (
            <div className="flex flex-col gap-4 animate-fade-in" id="lore-group">
              {/* 🧭 REAL-TIME LORE RADAR BEACON */}
              <div className="bg-[#141413] border border-[#2e2e2b] rounded-xl p-5 shadow-lg flex flex-col gap-3" id="radar-beacon-card">
                <h3 className="text-xs font-mono tracking-wider font-bold text-[#d4ca9d] flex items-center gap-2 select-none uppercase">
                  <Compass className="w-4 h-4 text-yellow-500 shrink-0" />
                  COINCIDENCE BACKPACK COORDS RADAR
                </h3>
                
                {(() => {
                  const radar = getNearestBackpack(hudStats.x, hudStats.z, seed, collectedBackpacks, spawnedBackpacks);
                  if (radar) {
                    const arrowDirs = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
                    let degrees = radar.angle * (180 / Math.PI);
                    if (degrees < 0) degrees += 360;
                    const segment = Math.round(degrees / 45) % 8;
                    const arrow = arrowDirs[segment];
                    
                    return (
                      <div className="bg-[#1b1b1a] p-4 rounded-lg border border-[#292927] flex items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-[#a2a299] font-mono select-none">BEACON FEED:</span>
                          <span className="text-xs text-yellow-500 font-bold font-mono animate-pulse uppercase flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                            DIARY TELEMETRY ACTIVE
                          </span>
                          <span className="text-xs text-[#eaeae0] font-mono mt-1">
                            Distance: <strong className="text-yellow-400">{radar.dist.toFixed(0)} ft</strong>
                          </span>
                        </div>
                        
                        <div className="flex flex-col items-center justify-center p-2.5 bg-yellow-500/10 rounded-xl border border-yellow-500/30 w-14 h-14 shadow-inner animate-pulse">
                          <span className="text-xl font-bold text-yellow-400">{arrow}</span>
                          <span className="text-[8px] text-yellow-400 font-mono mt-0.5">DIR</span>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div className="bg-[#1b1b1a] p-4 rounded-lg border border-[#292927] flex items-center gap-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-[#a2a299] font-mono select-none">BEACON FEED:</span>
                          <span className="text-stone-500 text-xs font-mono">
                            NO DISTANT CORE BACKPACK CONVERGENCES DETECTED within 3 sectors
                          </span>
                        </div>
                      </div>
                    );
                  }
                })()}
              </div>

              {/* 🎒 JOURNAL ARCHIVE DATABASE CONTAINER */}
              <div className="bg-[#141413] border border-[#2e2e2b] rounded-xl flex flex-col shadow-lg overflow-hidden min-h-[350px]" id="lore-browser">
                <div className="bg-[#1b1b1a] px-4 py-3 border-b border-[#2e2e2b] flex justify-between items-center" id="lore-header">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-yellow-500" />
                    <span className="text-xs font-mono font-bold tracking-wider text-[#d4ca9d] uppercase select-none">
                      LORE JOURNAL ARCHIVES
                    </span>
                  </div>
                  <span className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 px-2 py-0.5 rounded font-mono text-[10px]">
                    {collectedBackpacks.length} Collected
                  </span>
                </div>

                {collectedBackpacks.length === 0 ? (
                  <div className="flex-1 p-8 text-center flex flex-col items-center justify-center gap-3 bg-[#0e0e0d]" id="empty-lore">
                    <span className="text-4xl">🎒</span>
                    <p className="text-xs text-[#a2a299] max-w-xs font-mono leading-relaxed">
                      Procedural canvas backpacks are placed deterministically inside rooms across the dynamic coordinate field.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col bg-[#0e0e0d]" id="lore-database-split">
                    {/* Left list panel */}
                    <div className="max-h-[140px] overflow-auto p-1.5 flex flex-row gap-1.5 bg-[#141413] border-b border-[#20201e]" id="lore-list">
                      {collectedBackpacks.map((b, idx) => (
                        <button
                          key={idx}
                          id={`lore-item-${idx}`}
                          onClick={() => setSelectedJournal(b)}
                          className={`p-2 rounded-lg border text-left font-mono shrink-0 w-32 transition-all ${
                            selectedJournal?.sx === b.sx && selectedJournal?.sz === b.sz
                              ? "bg-yellow-500/15 border-yellow-500 text-yellow-400 font-bold"
                              : "bg-[#1b1b1a] border-[#252523] text-[#c5c5bb] hover:bg-[#252523] hover:text-[#eaeae0]"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span className="text-yellow-500 font-bold">Diary #{idx+1}</span>
                            <span className="text-[9px] text-[#8a8a81]">{b.pages} pgs</span>
                          </div>
                          <span className="text-[9px] block opacity-80 truncate">Sector [{b.sx}, {b.sz}]</span>
                        </button>
                      ))}
                    </div>

                    {/* Right reading panel */}
                    <div className="p-4 flex flex-col gap-2 bg-[#0d0d0c] overflow-auto max-h-[220px]" id="lore-viewer">
                      {selectedJournal ? (
                        <div className="flex flex-col gap-2 h-full">
                          <div className="flex items-center justify-between border-b border-[#21211e] pb-1.5">
                            <span className="text-[9px] font-mono text-[#a2a299]">Captured Coordinates</span>
                            <span className="text-[9px] font-mono text-yellow-500 font-bold">[{selectedJournal.gx}X, {selectedJournal.gz}Z]</span>
                          </div>
                          <p className="text-[#ebebda] font-serif leading-relaxed text-xs whitespace-pre-line italic p-3 bg-[#111110] border border-[#21211e] rounded-lg shadow-inner overflow-auto">
                            "{selectedJournal.latest_entry}"
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 flex items-center justify-center text-center text-[10px] font-mono text-stone-500">
                          Select a diary to inspect logs
                        </div>
                      )}
                    </div>
                  </div>
                )}
                  {/* Lore Footer */}
                <div className="bg-[#1b1b1a] p-3 border-t border-[#2e2e2b] text-[10px] font-mono text-[#8a8a81]" id="lore-footer">
                  Archive buffer payload: {collectedBackpacks.length * 280} bytes
                </div>
              </div>
            </div>
          )}

          {rightPanelTab === "dev" && (
            <div className="flex flex-col gap-4 animate-fade-in" id="dev-portal-container">
              {/* DEV PORTAL WIDGETS */}
              <div className="bg-[#141413] border border-[#2e2e2b] rounded-xl p-5 shadow-lg flex flex-col gap-4" id="dev-portal-header">
                <h3 className="text-sm font-mono tracking-wider font-bold text-red-400 flex items-center gap-2 select-none uppercase">
                  <Settings className="w-4 h-4 text-red-500 animate-spin" />
                  Developer Portal
                </h3>
                
                <p className="text-xs text-[#a2a299] leading-relaxed">
                  This diagnostics terminal allows you to test coordinates in real-time, inspect system memory allocations and procedurally inject key elements.
                </p>

                {/* Command Window / Terminal (Blank Space as requested) */}
                <div className="bg-black border border-stone-800 rounded-lg p-3 font-mono text-[10px] text-green-400 min-h-[140px] flex flex-col justify-between shadow-inner" id="dev-terminal-view">
                  <div className="space-y-1">
                    <div className="text-[#a2a299] text-[9px] border-b border-stone-900 pb-1 mb-1.5 flex justify-between">
                      <span>SYSTEM CONSOLE LOGS</span>
                      <span className="text-red-500/70 animate-pulse">● DIALOGS_OK</span>
                    </div>
                    <p className="text-green-500 opacity-90 font-mono">SYS_INIT: Booting Developer Diagnostics Portal...</p>
                    <p className="text-green-500 opacity-80 font-mono font-semibold">SYS_CORE_HEAP: Allocated 32MB Memory Buffer</p>
                    <p className="text-green-500 opacity-80 font-mono">SYS_COORD_RESONATOR: Sync status OK [gx={hudStats.x.toFixed(1)}, gz={hudStats.z.toFixed(1)}]</p>
                    <p className="text-[#f59e0b] font-mono select-none animate-pulse">&gt; _ </p>
                  </div>
                  
                  <div className="mt-2 text-[8px] text-[#555] text-right font-mono select-none uppercase">
                    PS2_BACKROOMS_TELEMETRY
                  </div>
                </div>

                {/* Spawn Backpack Widget */}
                <div className="flex flex-col gap-2.5 bg-[#1b1b1a] p-3.5 rounded-lg border border-[#ef4444]/15">
                  <span className="text-[10px] font-mono font-bold text-yellow-500 select-none block uppercase">
                    Testing Entity Spawner
                  </span>
                  
                  <p className="text-[11px] text-[#a2a299] leading-relaxed">
                    Instantly spawns an uncollected backpack <strong>2 tiles (2 ft)</strong> in front of your current position.
                  </p>
                  
                  <button
                    id="dev-spawn-bpack-btn"
                    onClick={handleSpawnBackpack}
                    className="w-full bg-[#ef4444]/10 hover:bg-[#ef4444]/20 border border-[#ef4444]/30 text-red-400 py-2.5 px-3 rounded-lg text-xs font-mono font-bold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 shadow"
                  >
                    🛠️ Spawn Backpack (2 ft. Ahead)
                  </button>
                </div>
              </div>
            </div>
          )}

        </section>
      </main>

      {/* Cinematic Backpack Pickup Sequence Overlay */}
      {pickupAnim.active && pickupAnim.bpack && (
        <div 
          id="pickup-animation-overlay"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-black/95 backdrop-blur-md transition-all duration-300 animate-fade-in"
        >
          <div className="text-center flex flex-col items-center max-w-sm w-full relative">
            
            {/* Phase 1: Approaching */}
            {pickupAnim.phase === "approaching" && (
              <div className="animate-scale-up-backpack flex flex-col items-center gap-6">
                <span className="text-[120px] filter drop-shadow-[0_0_20px_rgba(251,191,36,0.45)] select-none animate-pulse">
                  🎒
                </span>
                <div className="text-yellow-500/70 font-mono text-[10px] tracking-widest animate-pulse uppercase">
                  Inspecting Canvas Backpack...
                </div>
              </div>
            )}

            {/* Phase 2: Extracting */}
            {pickupAnim.phase === "extracting" && (
              <div className="flex flex-col items-center justify-center relative h-64 w-full">
                <span className="text-[90px] opacity-10 filter grayscale select-none absolute bottom-6">
                  🎒
                </span>
                <span className="text-[100px] filter drop-shadow-[0_0_25px_rgba(251,191,36,0.6)] animate-emerge-book absolute select-none">
                  📔
                </span>
                <div className="absolute bottom-2 text-yellow-500/70 font-mono text-[10px] tracking-widest animate-pulse uppercase">
                  Extracting Stained Diary...
                </div>
              </div>
            )}

            {/* Phase 3: Opening */}
            {pickupAnim.phase === "opening" && (
              <div className="flex flex-col items-center gap-6 animate-book-open-flip">
                <span className="text-[110px] filter drop-shadow-[0_0_30px_rgba(234,179,8,0.7)] select-none">
                  📖
                </span>
                <div className="text-[#d4ca9d] font-mono text-[10px] tracking-widest animate-pulse uppercase">
                  Opening Journal Book...
                </div>
              </div>
            )}
            
          </div>
        </div>
      )}

      {/* 🎒 EXQUISITE DIARY PARCHMENT VIEWPORT OVERLAY */}
      {activeBackpack && (
        <div 
          id="journal-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/92 backdrop-blur-md animate-fade-in"
        >
          {/* Absolute Back Button */}
          {/* EXPLANATORY COMMENT: This button handles exiting/closing the active diary view. On traditional handheld game controllers, this action maps helper hooks to the red standard "B Button/Circle Button" (Back action), matching the keyboard "Escape Key" bind. */}
          <button
            id="back-btn"
            onClick={() => setActiveBackpack(null)}
            className="absolute top-6 left-6 z-50 bg-[#242422] hover:bg-[#2d2d2a] text-yellow-500 border border-yellow-500/35 hover:scale-105 active:scale-95 transition-all text-xs font-mono font-bold px-4 py-2.5 rounded-lg flex items-center gap-1.5 shadow-lg select-none"
          >
            ◀ Close [Escape Key / B Button on Game Controller]
          </button>
          <div 
            id="journal-dialog"
            className="bg-[#1c1c1a] border-2 border-yellow-500/50 rounded-2xl max-w-lg w-full flex flex-col shadow-2xl overflow-hidden"
          >
            {/* Dialogue Header */}
            <div className="bg-[#242422] p-4 border-b border-[#2e2e2b] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-yellow-500 animate-bounce" />
                <span className="text-xs font-mono font-bold tracking-wider text-[#d4ca9d] uppercase">
                  Backpack Acquired
                </span>
              </div>
              <span className="text-[10px] font-mono text-[#a2a299]">
                Sector [{activeBackpack.sx}, {activeBackpack.sz}]
              </span>
            </div>

            {/* Book Presentation layout */}
            <div className="p-6 md:p-8 flex-1 flex flex-col bg-[#fbfaf0] text-[#1c1917] font-serif border-x-4 border-double border-[#dace9b] max-h-[350px] overflow-auto shadow-inner">
              <div className="flex justify-between items-center pb-3 border-b border-[#ebdcaa]/60 font-mono text-[10px] text-stone-500 select-none">
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-stone-500 animate-pulse" />
                  FOUND STAINED LEATHER DIARY
                </span>
                <span>PAGE 1 OF 1</span>
              </div>
              
              <p className="mt-4 text-xs md:text-sm leading-relaxed whitespace-pre-line italic text-stone-800 tracking-wide">
                "{activeBackpack.latest_entry}"
              </p>
            </div>

            {/* Dialog Controls Footer */}
            <div className="bg-[#242422] p-4 border-t border-[#2e2e2b] flex justify-between items-center">
              <span className="text-[10px] font-mono text-[#a2a299]">
                Interactive overlay loaded
              </span>
              <button
                id="stash-btn"
                onClick={() => {
                  collectBackpack(activeBackpack);
                  setActiveBackpack(null);
                }}
                className="bg-yellow-500 hover:bg-yellow-400 text-stone-900 px-5 py-2 rounded-lg text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow"
              >
                Add to Lore Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔮 ANOMALES OPERATING SYSTEM ESCAPE OVERLAY */}
      {hasEscaped && (
        <div 
          id="escape-overlay"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/98 backdrop-blur-lg animate-fade-in"
        >
          <div 
            id="escape-dialog"
            className="bg-[#0b0c08] border-2 border-emerald-500 rounded-2xl max-w-2xl w-full flex flex-col shadow-[0_0_50px_rgba(16,185,129,0.3)] overflow-hidden"
          >
            {/* Dialogue Header */}
            <div className="bg-[#12140f] p-4 border-b border-emerald-950 flex justify-between items-center text-emerald-400 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="animate-ping w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-bold tracking-widest uppercase">
                  IMPORT OS SUCCESSFUL: SYS_ESCAPE_TRIGGERED
                </span>
              </div>
              <span>PORT: 3000 / OS_SHELL</span>
            </div>

            {/* Code / execution visualization */}
            <div className="p-6 md:p-8 flex-1 flex flex-col gap-6 bg-black text-emerald-500 font-mono overflow-auto max-h-[450px]">
              <div className="border border-emerald-950 bg-[#050503] p-4 rounded-xl space-y-4">
                <span className="text-[10px] text-emerald-600 block uppercase border-b border-emerald-950 pb-1.5 select-none font-bold">
                  Active Python Process File: world.py
                </span>
                
                <pre className="text-xs text-emerald-400 leading-relaxed overflow-x-auto whitespace-pre">
{`import os

# Generates a cryptographically secure, OS-level random integer.
def get_true_random_int(min_val, max_val):
    range_size = max_val - min_val + 1
    random_bytes = os.urandom(4)
    large_int = int.from_bytes(random_bytes, "big")
    return min_val + (large_int % range_size)

# Simulated escape seed validation success
escape_die_score = get_true_random_int(1, 20)
print(f"Rolling secure D20... Rolled: {escape_die_score}!")
if escape_die_score > 15:
    print("CRITICAL TRIGGER: Boundary walls resolved as open walkaways.")
else:
    print("INTERPRETER: OS loop successfully bypassed sector constraints.")
`}
                </pre>
              </div>

              <div id="escape-success-text" className="space-y-4 leading-relaxed">
                <p className="text-sm font-bold text-emerald-400 select-none uppercase tracking-wide">
                  &gt;&gt; STAGE_STATUS: OUTSIDE THE MATRIX
                </p>
                
                {collectedBackpacks.length < 15 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-[#f59e0b] select-none animate-pulse uppercase">
                      [OPTIONAL OBJECTIVE: PRESERVE ARCHIVES - UNRESOLVED]
                    </p>
                    <p className="text-xs text-[#c5c5bb]">
                      You successfully noclip-escaped through the <strong className="text-emerald-400 font-bold">1 in 3 anomaly portal</strong>! 
                    </p>
                    <p className="text-xs text-[#fca5a5] border border-red-950 bg-[#150a0a] p-3 rounded-lg leading-relaxed">
                      ⚠ <strong>Note</strong>: You escaped, but you didn't care for the past. Unlocking the "import os" interface allowed you to step outside the backrooms constraints, but you left the personal diaries of those who came before to dissolve in the moist yellow carpet. You retrieved only <span className="font-bold text-white">{collectedBackpacks.length} / 15 diaries</span>.
                    </p>
                    <p className="text-xs text-[#a2a299]">
                      Reset the seed to try again if you wish to fulfill the optional objective of gathering at least 15 logs before crossing over.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-emerald-400 select-none animate-pulse uppercase">
                      [OPTIONAL OBJECTIVE: PRESERVE ARCHIVES - COMPLETED ✅]
                    </p>
                    <p className="text-xs text-[#c5c5bb]">
                      You successfully noclip-escaped through the <strong className="text-emerald-400 font-bold">1 in 3 anomaly portal</strong>!
                    </p>
                    <p className="text-xs text-[#a7f3d0] border border-emerald-950 bg-[#09150e] p-3 rounded-lg leading-relaxed">
                      🎉 <strong>Honored Legacy</strong>: You cared for the past! You traversed the sector bounds and carried all <span className="font-bold text-white">{collectedBackpacks.length} lost personal archives</span> safely past the boundary gates. Their stories survive forever through you.
                    </p>
                    <p className="text-xs text-[#a2a299]">
                      Physical coordinates have fully collapsed. The Python subprocess interpreter is ready for seed replacement.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Dialog Controls Footer */}
            <div className="bg-[#12140f] p-5 border-t border-emerald-950 flex flex-col sm:flex-row justify-between items-center gap-4">
              <button
                id="reset-escape-btn"
                onClick={() => {
                  setHasEscaped(false);
                  handleReset();
                  setSeed(Math.floor(Math.random() * 899999) + 10000);
                }}
                className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-3 rounded-lg text-xs font-mono font-bold transition-all hover:scale-[1.03] active:scale-[0.97] shadow shadow-emerald-500/20 uppercase text-center"
              >
                🔄 Shift Seed (Restart Escape)
              </button>
              
              <button
                id="continue-explore-btn"
                onClick={() => setHasEscaped(false)}
                className="w-full sm:w-auto bg-[#242422] hover:bg-[#2d2d2a] text-emerald-400 border border-emerald-950/50 px-6 py-3 rounded-lg text-xs font-mono transition-all hover:scale-[1.03] active:scale-[0.97] text-center"
              >
                Keep Exploring Anomaly Area
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
