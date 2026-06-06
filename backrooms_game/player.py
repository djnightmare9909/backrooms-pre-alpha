import math
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
            self.z = new_z
