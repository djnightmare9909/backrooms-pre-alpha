# 📯 Infinite Backrooms RPG: Level-0 Anomaly & Memory Archive
> **A Retro-Grade Full-Stack Engine Emulating Early 2000s Handheld Hardware Constraints**

Welcome to the **Infinite Backrooms RPG**, an atmospheric, infinite procedural survival & exploration experience written in React, Vite, and HTML5 Canvas. This project replicates early 3D rendering pipelines (reminiscent of the Sega Saturn or Playstation 2) with functional raycasting, real-time memory stats, and interactive file-console diagnostics.

---

## 🕹️ Gameplay & Controls

Explore a procedurally generated Level-0 Backroom. Keep your volume up to hear the faint fluorescent hum, track your coordinates via the local hardware monitor, and search for lost archives.

### Controls Guide

| Input | Keyboard | Controller / Mobile |
| :--- | :--- | :--- |
| **Move Forward** | `W` or `Up Arrow` | Joystick Up |
| **Move Backward** | `S` or `Down Arrow` | Joystick Down |
| **Turn Left** | `A` or `Left Arrow` | Joystick Left |
| **Turn Right** | `D` or `Right Arrow` | Joystick Right |
| **Close Overlay** | `Escape` | `Back Action` / B Button |
| **Toggle Render Mode** | `Tab` / Click UI | UI Switch Mode |

---

## 🎲 The Anomaly Formula ("import os")

The physical architecture of Level-0 is volatile and contains unstable memory-leak boundaries. Under the hood, walls undergo deterministic spatial mutations based on **cryptographically secure random-number generators** simulating early console operating system loops.

```
                  ┌──────────────────────────────┐
                  │   Seed Coordinate Wall Cell  │
                  └──────────────┬───────────────┘
                                 │
                     [Hash Modulo 300 == 15?]
                                 │
                   ┌─────────────┴─────────────┐
                  YES                          NO
                   │                           │
         [Simulate Secure D20]         [Normal Wallpaper]
         (Lands 15 to 20? / 30% CHANCE)
                   │
         ┌─────────┴─────────┐
        YES                  NO
         │                   │
  [IMPORT OS ANOMALY]  [Normal Wallpaper]
         │
  [Is Modulo 6000 % 3 == 0?]
         │
    ┌────┴────┐
   YES        NO
    │         │
[REAL EXIT] [GLITCH WALL] (Solid)
(Walkable)
```

### Technical Blueprint
1. **Mathematical Spatial Testing**: Exactly `1 in 300` coordinate combinations match the index mask threshold (`(wallTileHash % 300) === 15`).
2. **Secure OS Roll**: If detected, the system rolls a virtual D20 modulo sequence: `(Math.floor(wallTileHash / 300) % 20) + 1`. If the roll lands between **15 and 20** (a 30% check success rate), the section triggers code leakage and materializes into an `import os` anomaly.
3. **One-in-Three Gateways**: Out of these materialized glitches, **exactly 1 in 3 anomalies** (`Math.floor(wallTileHash / 6000) % 3 === 0`) collapses physical collision bindings. They become walkable, green-glowing dimensional exit matrices. Touching a real exit triggers system bypass validation.

---

## 💾 Optional Objective: Caring for the Past

Throughout the corridors lie **Lost Diary Backpacks** belonging to previous explorers trapped in the yellow carpet void. While you are free to step through a noclip anomaly exit the moment you encounter one, your legacy score varies based on your care for the past:

* **The Careless Escape (< 15 Diaries)**:
  * You escape past the boundary constraints, but you leave previous explorers' memories behind to dissolve. The terminal will label the archive preservation objective as *Unresolved*.
* **The Preserved Legacy (≥ 15 Diaries)**:
  * You gathered at least fifteen historical logs before stepping into the emerald portal. The system awards you the *Preserved Archives* badge, confirming their stories survive forever through you.

---

## 🛠️ Performance Features

* **Retro-Grade Raycasting**: Rendered at custom responsive pixel slices with depth scaling, wall elevation trim mirroring, and atmospheric gold hum fogting.
* **Low-End Hardware Simulation**: Toggle the live Heap Statistics monitor to watch calculated chunk distances, active render threads, and memory usage.
* **Inline Explorer File-System**: Examine settings, diagnostic logs, and helper modules (`random_os.py`) inside the interactive editor panel on the dashboard.
