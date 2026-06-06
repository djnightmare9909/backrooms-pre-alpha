import sys
import time
import math
from settings import *
import world
from player import Player

# Attempt Pygame import for Graphic Visualizer
try:
    import pygame
    PYGAME_AVAILABLE = True
except ImportError:
    PYGAME_AVAILABLE = False


def load_area(px, pz):
    """
    Simulates Minecraft-style dynamic chunk loading/unloading based on player distance.
    Saves out-of-range chunks to disk to respect strict PS2-sized memory ceilings (32MB RAM).
    """
    center_cx = int(px // CHUNK_SIZE)
    center_cz = int(pz // CHUNK_SIZE)

    # 1. Load nearby chunks within load distance circle/square
    for dx in range(-LOAD_DISTANCE, LOAD_DISTANCE + 1):
        for dz in range(-LOAD_DISTANCE, LOAD_DISTANCE + 1):
            world.get_chunk(center_cx + dx, center_cz + dz)

    # 2. Unload chunks that have strayed too far (reducing heap footprints)
    chunks_to_unload = []
    for (cx, cz) in list(world.world_chunks.keys()):
        if (abs(cx - center_cx) > LOAD_DISTANCE + 1 or 
            abs(cz - center_cz) > LOAD_DISTANCE + 1):
            world.save_chunk(cx, cz)
            chunks_to_unload.append((cx, cz))

    for key in chunks_to_unload:
        del world.world_chunks[key]


def run_ascii_fallback(player):
    """
    ASCII Console Radar fallback for systems lacking Pygame configuration.
    Displays a real-time 20x40 grid centered on the player in terminal output.
    """
    print("\n--- Python Backrooms Console Fallback ---")
    print("Pygame was not found. Running in ASCII mode!")
    print("Controls: W/A/S/D + Enter to submit movement vector. Q to exit.\n")
    
    while True:
        px, pz = player.x, player.z
        load_area(px, pz)
        
        # Define viewing window (radius around player)
        view_radius_ft = 10
        out = []
        out.append(f"Position: X={px:.2f} ft, Z={pz:.2f} ft (Chunk: {int(px//16)}, {int(pz//16)})")
        out.append("-" * 43)

        for z_offset in range(-view_radius_ft, view_radius_ft + 1):
            line = []
            for x_offset in range(-view_radius_ft * 2, view_radius_ft * 2 + 1):
                # Scale X to match screen ratio
                rx = px + (x_offset * 0.5)
                rz = pz + z_offset
                
                # Check tile classification
                classification, is_solid = world.get_tile_classification(int(math.floor(rx)), int(math.floor(rz)))
                
                # Render symbols
                if abs(rx - px) < 0.35 and abs(rz - pz) < 0.35:
                    line.append("P")  # Player
                elif is_solid:
                    if classification == "pillar":
                        line.append("O") # Column pillar
                    elif classification == "wall":
                        line.append("#") # Inner Partition Wall
                    else:
                        line.append("█") # Outer Solid Void
                else:
                    if classification == "room":
                        line.append(".") # Room floor
                    elif classification == "hallway":
                        line.append(" ") # Hallway floor
                    else:
                        line.append("?")
            out.append("".join(line))
        out.append("-" * 43)
        print("\n".join(out))
        
        # Simple blocking keyboard parser
        action = input("Enter vector (w=up, a=left, s=down, d=right, q=quit): ").lower().strip()
        if not action:
            continue
        if "q" in action:
            print("Cleaning cached maps and exiting game...")
            break
            
        dx, dz = 0, 0
        if "w" in action: dz = -1
        if "s" in action: dz = 1
        if "a" in action: dx = -1
        if "d" in action: dx = 1
        
        # Tick delta-time simulated as 0.25s per keystroke action
        player.try_move(dx, dz, 0.25)


def run_pygame_visualizer(player):
    """
    Main graphics-driven visualizer using Pygame.
    Draws structural partitions, pillars, loaded chunk lines, and offers seamless exploration loops.
    """
    pygame.init()
    screen_width, screen_height = 800, 600
    screen = pygame.display.set_mode((screen_width, screen_height))
    pygame.display.set_caption("Infinite Backrooms Procedural Generator (PS2 Emulation Mode)")
    clock = pygame.time.Clock()
    
    # Scale: 1 foot = 12 pixels
    SCALE = 12 
    
    font = pygame.font.SysFont("Courier", 14)
    running = True

    while running:
        dt = clock.tick(60) / 1000.0  # limit fps to 60, fetch delta-time in seconds
        
        # Input handling
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

        dx, dz = 0, 0
        keys = pygame.key.get_pressed()
        if keys[pygame.K_ESCAPE]:
            running = False
        if keys[pygame.K_w] or keys[pygame.K_UP]:
            dz = -1
        if keys[pygame.K_s] or keys[pygame.K_DOWN]:
            dz = 1
        if keys[pygame.K_a] or keys[pygame.K_LEFT]:
            dx = -1
        if keys[pygame.K_d] or keys[pygame.K_RIGHT]:
            dx = 1

        # Move with collision checks
        player.try_move(dx, dz, dt)
        
        # Load/unload chunks based on displacement
        load_area(player.x, player.z)
        
        # RENDER FRAME
        screen.fill((25, 25, 20)) # Dark retro color index
        
        # Center camera on player coordinates
        cam_x = player.x * SCALE - (screen_width / 2)
        cam_z = player.z * SCALE - (screen_height / 2)
        
        # Query and draw visible tile ranges based on viewport
        start_tile_x = int((player.x - 40))
        end_tile_x = int((player.x + 40))
        start_tile_z = int((player.z - 30))
        end_tile_z = int((player.z + 30))
        
        for tx in range(start_tile_x, end_tile_x):
            for tz in range(start_tile_z, end_tile_z):
                # Calculate screen offsets
                screen_x = tx * SCALE - cam_x
                screen_z = tz * SCALE - cam_z
                
                classif, is_solid = world.get_tile_classification(tx, tz)
                
                # Determine colors for our three main logical engine layers:
                # 1. Hallways (must express limited width, max 10 ft)
                # 2. Rooms (capped to 100x100 sq ft)
                # 3. Walls (split into solid outside, columns or partition wall variables)
                if is_solid:
                    if classif == "pillar":
                        color = (190, 180, 130) # Distinct columnar yellow-beige
                    elif classif == "wall":
                        color = (150, 140, 100) # Dark yellow wall partitions
                    else: # outside void
                        color = (40, 40, 30) # Vague outer solid void mass
                else:
                    if classif == "room":
                        color = (250, 240, 195) # Damp room carpet (cream/yellow)
                    elif classif == "hallway":
                        color = (235, 222, 160) # Hallway carpet color
                    else:
                        color = (100, 100, 100)
                        
                pygame.draw.rect(screen, color, (screen_x, screen_z, SCALE - 1, SCALE - 1))
        
        # Draw Chunk Borders to visualize Minecraft-like grid calculations
        center_cx = int(player.x // CHUNK_SIZE)
        center_cz = int(player.z // CHUNK_SIZE)
        for dx_c in range(-LOAD_DISTANCE, LOAD_DISTANCE + 1):
            for dz_c in range(-LOAD_DISTANCE, LOAD_DISTANCE + 1):
                cx = center_cx + dx_c
                cz = center_cz + dz_c
                
                # Sector bounds in pixels
                x_start = cx * CHUNK_SIZE * SCALE - cam_x
                z_start = cz * CHUNK_SIZE * SCALE - cam_z
                c_pixel_w = CHUNK_SIZE * SCALE
                
                # Render subtle gray chunk boundary grid
                pygame.draw.rect(screen, (80, 80, 70), (x_start, z_start, c_pixel_w, c_pixel_w), 1)
        
        # Render Player (Green circle with hitbox boundary)
        p_screen_x = player.x * SCALE - cam_x
        p_screen_z = player.z * SCALE - cam_z
        p_px_rad = player.radius * SCALE
        
        pygame.draw.circle(screen, (40, 220, 80), (int(p_screen_x), int(p_screen_z)), max(4, int(p_px_rad)))
        # Vector heading indicator
        if dx != 0 or dz != 0:
            pygame.draw.line(screen, (0, 0, 0), (p_screen_x, p_screen_z), 
                             (p_screen_x + dx*SCALE, p_screen_z + dz*SCALE), 2)
            
        # UI Information HUD
        hud_lines = [
            "============================================================",
            f" PLAYER STATUS: X={player.x:.2f} ft | Z={player.z:.2f} ft",
            f" CHUNK COORDS:  cx={center_cx} | cz={center_cz} (LOADED: {len(world.world_chunks)})",
            f" LOCAL REGION:  Sector {int(player.x // SECTOR_SIZE)}, {int(player.z // SECTOR_SIZE)}",
            " CONTROLS:      WASD/Arrows to walk | ESC to quit",
            " RULES IN ENGINE:",
            " - Rooms: Capped to 100x100 sq ft",
            " - Hallways: Capped to 10 ft width maximum",
            " - Pillars: Minimum physical clearance of 4 ft",
            "============================================================"
        ]
        
        for idx, line in enumerate(hud_lines):
            text_surface = font.render(line, True, (255, 255, 255))
            screen.blit(text_surface, (15, 10 + idx * 18))

        pygame.display.flip()

    pygame.quit()


def main():
    player = Player()
    
    # Pre-generate area around starting coordinate
    load_area(player.x, player.z)
    
    if PYGAME_AVAILABLE:
        run_pygame_visualizer(player)
    else:
        run_ascii_fallback(player)


if __name__ == "__main__":
    main()
