# Implementation Plan — CS2 Browser Engine Overhaul

## Overview
This plan addresses the 10 core gameplay, graphics, networking, and performance issues identified across the client and match lifecycle. It eliminates runtime bottlenecks to achieve stable 60–144+ FPS, restores authentic weapon and character visual pipelines, corrects bombsite boundaries to match world geometry, introduces realistic weapon handling (recoil, reload, shotgun spread), and establishes authoritative server logic.

---

## 1. Frame Rate Engine Overhaul (Target: 60–144+ FPS)

### Root Cause Analysis
1. **Dynamic Point Lights & Shader Recompilation**: `createC4Prop` adds a `THREE.PointLight` to the C4 prop; additional lights exist on explosion shockwaves, muzzle flashes, and remote player meshes. When C4 is planted, the light becomes unhidden, altering the scene light count and forcing Three.js to recompile all active materials on the Dust2 OBJ mesh mid-game, causing severe hitching and dropping framerates from 25 to 15 FPS.
2. **Exhaustive OBJ Raycasting**: `player.update()` casts multiple Three.js rays (`downRaycaster`, `wallRaycasterX`, `wallRaycasterZ`) every single frame against the raw `de_dust2.obj` geometry (~10,000 triangles across 1,548 draw runs).
3. **Double-Sided Rendering**: `child.material.side = THREE.DoubleSide` is set globally in `maps.js`, doubling rasterizer overhead and disabling GPU backface culling.
4. **Draw Call Explosion**: `de_dust2.obj` splits faces across 1,548 separate material runs rather than batching by shared material.
5. **Runtime Audio Hitching**: Sounds outside the initial 7 preloaded files trigger synchronous fetch and Web Audio decoding upon first trigger.
6. **Per-Frame DOM Mutations**: `interaction-progress-fill` and `action-prompt` rewrite element styles and attributes every animation frame.

### Technical Solution
- **Eliminate All Dynamic Point Lights**:
  - Remove `THREE.PointLight` from C4 prop, explosion effects, muzzle flashes, grenades, and remote player groups.
  - Represent LED blinking, muzzle flashes, and grenade detonation using pure emissive uniforms on `MeshBasicMaterial` / `MeshLambertMaterial`.
- **Pre-Baked Collision & Height Grid**:
  - Offline-bake a 0.5m resolution 2D walkable height grid from the Dust2 OBJ floor triangles (`material_5`, `material_6`, `material_10`, `material_15`, `material_22`, `material_25`).
  - Replace per-frame raycasting with an $O(1)$ spatial coordinate lookup: `getFloorY(x, z)`.
  - Wall collision replaced with 2D grid occupancy testing + height clearance checks.
- **Restore GPU Backface Culling**:
  - Set `material.side = THREE.FrontSide` across all Dust2 map geometries.
- **Mesh Optimization & Draw-Call Batching**:
  - Group and merge the 1,548 material runs into 34 batched sub-meshes (one per distinct material index), reducing draw calls by ~97%.
- **Complete Audio Preloading**:
  - Iterate through all mapped weapon fire, reload, step, and UI sound paths during initial startup; buffer and decode into memory before match start.
- **DOM & Math Caching**:
  - Cache all HUD element references (`interaction-bar-container`, `interaction-progress-fill`, `interaction-title`, `action-prompt`, `pickup-prompt`).
  - Only write DOM updates when the rounded percentage integer changes.
  - Convert recoil decay and footstep timers to explicit delta-time arithmetic (`dt`).

---

## 2. Bomb Planting & Movement Lock Fix

### Root Cause Analysis
In `js/game.js`, when a Terrorist holds [E] in a bombsite, `player.isPlanting = true` is set. When [E] is released or the player moves, `player.plantProgress` resets, but `player.isPlanting` is never set to `false`. In `js/player.js`, `if (this.isPlanting || this.isDefusing) { this.velocity.x = 0; this.velocity.z = 0; }` executes every frame, permanently immobilizing the player.

### Technical Solution
- In `handleObjectives(dt)`:
  - Reset `this.player.isPlanting = false` and `this.player.isDefusing = false` at the very beginning of the evaluation loop.
  - Set `isPlanting = true` strictly inside the branch where:
    1. Player is alive and on team T.
    2. C4 is equipped in active slot.
    3. Player is inside the valid bombsite volume.
    4. Key `keybinds.use` is actively held down.
- Add safeguard resets inside:
  - Weapon slot switching (`selectSlot`).
  - Damage taken (`takeDamage`).
  - Round start / freeze time transition (`startRound`).

---

## 3. Weapon Models, Textures, and Orientation Pipeline

### Root Cause Analysis
1. **Missing GLB References**: `weapons.js` lists paths like `source/AK47.glb` and `source/AWP.glb` which are not present on disk; the single available GLB model is `source/ARMORandHELMET.glb`.
2. **FBX Pipeline & Texture Loss**: Weapon models are loaded from `models/css_weapons.fbx`. In `buildTexturedWeaponModel`, failed texture loads fail silently or discard image mappings.
3. **Axis & Knife Orientation**: In `css_weapons.fbx`, weapon meshes have local $-90^\circ$ X rotations and non-uniform local translations. The knife mesh (`w_knife_t`) shares an inverted forward vector relative to long guns.
4. **Per-Switch Recompilation**: `computeVertexNormals()` and material allocation occur on every weapon equip rather than caching cloned geometries.

### Technical Solution
- **Asset Source Normalization**:
  - Set `models/css_weapons.fbx` with `textures/w_*.png` as the authoritative weapon asset pipeline for all 28+ CSS weapons.
  - Map each weapon ID cleanly to its extracted FBX child mesh name (`w_rif_ak47`, `w_rif_m4a1`, `w_knife_t`, `w_smg_mp5`, `w_pist_deagle`, etc.).
- **Texture Handling & Materials**:
  - Load textures once with `flipY = false`.
  - Cache loaded textures in a dictionary.
  - Use `MeshLambertMaterial` with `color: 0xffffff` and uniform ambient lighting in the viewmodel scene layer so weapons are never rendered pitch black.
- **Automated Geometry Normalization & Orientation**:
  - Center geometry vertices around origin via `geometry.center()`.
  - Calculate oriented bounding box dimensions. Rotate mesh so the longest axis aligns with $+Z$ (forward view vector).
  - Apply specific transform overrides per weapon archetype:
    - Knife: Pitch $-90^\circ$, adjust blade up/forward vector.
    - Pistols: Scale factor $0.022$, offset $(0.12, -0.16, -0.32)$.
    - Rifles/SMGs: Scale factor $0.028$, offset $(0.14, -0.18, -0.38)$.
- **Viewmodel Cache**:
  - Pre-build and cache each weapon's normalized `THREE.Group` at startup; clone geometry/material references instantly on slot switch.

---

## 4. Authentic Player Character Models

### Root Cause Analysis
`createTacticalCharacterModel` in `js/network.js` constructs procedural figures from geometric primitives (cylinders, boxes, spheres). The repository includes authentic assets: `source/ARMORandHELMET.glb` containing `w_eq_armor` and `w_eq_helmet` meshes, along with `textures/armor_diffuse_color_psd_25fc1cb_2.png` and `textures/helmet_diffuse_color_psd_aaf82f80_5.png`.

### Technical Solution
- Delete the procedural geometric primitive generation inside `createTacticalCharacterModel`.
- Load `source/ARMORandHELMET.glb` once via `GLTFLoader`.
- Extract the authentic tactical torso (`w_eq_armor`) and helmet (`w_eq_helmet`) meshes.
- Apply high-resolution diffuse textures (`armor_diffuse_color_psd_25fc1cb_2.png` and `helmet_diffuse_color_psd_aaf82f80_5.png`) with team-specific tinting (CT dark navy/slate, T desert tan/camo).
- Attach authentic glove and arm meshes with `textures/glove_hardknuckle_black_color_psd_8f00aa00_2.png`.
- Remote players hold their active weapon model cloned from the normalized weapon cache instead of static placeholders.

---

## 5. Mandatory Home Screen Player Name

### Technical Solution
- **UI Element**: Add a styled input field `<input type="text" id="player-nickname" maxlength="16" placeholder="ENTER NICKNAME">` in `index.html`.
- **Validation & Persistence**:
  - Disable "CONNECT TO SERVER" and "SELECT TEAM" buttons until `player-nickname.value.trim().length >= 2`.
  - Store and restore nickname using `localStorage.getItem('cs2_player_name')`.
- **Network & Gameplay Integration**:
  - Transmit validated name in connection handshake and player update packets.
  - Update scoreboard to display authentic nicknames rather than generic `Player_xxxxx`.
  - Replace hardcoded `You`, `Player`, `Enemy` in killfeed with actual player names.
  - Render overhead name badges above teammate heads.

---

## 6. Map Perimeter Boundaries & Void Protection

### Root Cause Analysis
Current boundaries rely on loose rectangular coordinate clamps and raycasting. If a player walks off a geometry ledge, `lastGroundY` is preserved, resulting in walking on air or clipping into unrendered void space.

### Technical Solution
- **Collision Grid Boundary**: The baked 2D collision grid defines the strict walkable perimeter of Dust 2.
- **Physical Boundary Colliders**:
  - Place physical invisible barrier planes along the perimeter of T spawn, Long A cliffs, B plateau, and CT spawn.
  - Disallow velocity increments into non-walkable grid cells.
- **Void Safeguard**:
  - If a player's vertical position falls below $Y < -20.0$, immediately trigger suicide damage or teleport back to the active team spawn point.

---

## 7. Match Authority & Multiplayer Architecture

### Root Cause Analysis
PeerJS WebRTC currently designates the first joining browser as host (`cs2-pub-dust2`). If the host tabs out or idles, the render loop throttles, halting timer broadcasts and round state changes for other peers.

### Technical Solution
- **Authoritative Headless Relay / Server (`server.js`)**:
  - A lightweight Node.js WebSocket server (`ws`) tracks:
    - Round state machine (freeze, live, round end, halftime).
    - Authoritative round timer and scores.
    - C4 state (carrier, planted position, defuse progress).
    - Player health, inventory drops, and authoritative kill registrations.
- **Client Fallback / Robust Host Election**:
  - If connecting directly via PeerJS (GitHub Pages static host mode):
    - Decouple match timers from `animate()` by driving time using wall-clock UTC timestamps (`performance.now()` / `Date.now()`).
    - Implement heartbeat-based host migration: if host heartbeat ceases for $> 2.0$ seconds, the peer with the lowest ID automatically assumes host authority without restarting the round.

---

## 8. C4 Bomb Allocation & Round Resupply

### Root Cause Analysis
C4 is currently allocated only on initial team selection or hardcoded rounds (1 and 13). When planted, `inventory[5] = null`. Subsequent rounds leave the Terrorist team without a bomb.

### Technical Solution
- At the start of every live round (`startRound()`):
  - Check team composition. If Terrorist team has active players:
    - Randomly select one living Terrorist player.
    - Grant C4 bomb in slot 5 (`inventory[5] = { id: 'c4', name: 'C4 Explosive', ... }`).
    - Update HUD C4 indicator for the carrier.
- On carrier death:
  - Drop slot 5 C4 to the ground as a physical, pickable 3D item with ground alignment.
- Prevent duplicate C4 assignments on halftime team swap.

---

## 9. Authentic Bombsite Boundaries

### Root Cause Analysis
The OBJ geometry contains authentic floor markings for both sites:
- **Site A**: Material `material_15` ("SandCCrete2" wood plank floor X marker) located at $X \in [47.5, 56.2]$, $Z \in [-112.3, -105.1]$, center $(51.0, 4.32, -108.9)$.
- **Site B**: Material `material_25` ("SandRoadTgtB" cobblestone X + B marker) spanning $X \in [-77.8, -66.2]$, $Z \in [-126.7, -115.2]$, center $(-70.8, 0.0, -115.8)$.
Currently, `maps.js` tests a simple circular radius ($r = 8.5$) centered at mismatched coordinates, leaving major portions of the marked visual site unplantable.

### Technical Solution
- Replace circular radius test with bounding polygon / box inclusion matching the visual decals and radar polygon:
  - **Site A Zone**: Centered at $(51.0, 4.32, -108.9)$, half-extents $(6.5, 2.5, 6.0)$.
  - **Site B Zone**: Centered at $(-70.8, 0.0, -118.0)$, half-extents $(7.5, 2.5, 8.0)$ covering the entire cobblestone floor target.
- Remove redundant floating procedural rings and letter planes from the 3D scene.
- Ensure the radar minimap orange overlay bounds precisely match the plantable volume.

---

## 10. Weapon Recoil Patterns, Reload Mechanics, and Shotgun Spread

### Technical Solution
- **Per-Weapon Recoil Table (`recoilPattern`)**:
  - Add explicit per-shot recoil offset arrays `[[pitch, yaw], ...]` to all automatic weapons (AK-47, M4A4, M4A1-S, Galil, FAMAS, MP5, P90, etc.) in `weapons.js`.
  - Track continuous shot count; reset spray index after $0.55\text{s}$ firing cooldown.
  - Semi-automatic pistols and bolt-action snipers apply kickback and cone spread without spray tables.
- **Shotgun Multi-Pellet Raycasts**:
  - For XM1014 and shotguns, read `pellets: 8` and `spread: 0.055`.
  - When firing, cast 8 independent raycasts distributed across the conical spread angle.
  - Distribute weapon damage per pellet ($6\times \text{pelletDamage}$ instead of single-hit all-or-nothing).
- **Accurate Reload Times & Magazine Mechanics**:
  - Add authentic reload durations to all weapons:
    - AK-47: $2.43\text{s}$
    - M4A4 / M4A1-S: $3.10\text{s}$
    - AWP: $3.70\text{s}$
    - Desert Eagle: $2.20\text{s}$
    - Glock-18: $2.25\text{s}$
  - Synchronize reload audio cues to the weapon's specific duration.
  - Apply standard CS magazine reload rule: reserve ammo replenishes the clip up to capacity.

---

## Approval Verification Checkpoints
1. Verify 60–144+ FPS in Chrome with DevTools Performance panel confirming zero PointLight instances and merged OBJ draw calls.
2. Confirm tapping and releasing [E] allows immediate full player movement.
3. Verify all weapons render with authentic textures and correct forward orientations.
4. Confirm authentic character models display with proper team skins.
5. Verify player nickname is required before entering match and is synced across all HUDs and network packets.
6. Verify player cannot fall outside Dust2 boundary or glitch through cliffs.
7. Confirm C4 is awarded to a Terrorist every round and drops on carrier death.
8. Confirm C4 can be planted across the full painted bounds of Site A and Site B.
9. Verify per-weapon spray patterns, shotgun spread cones, and reload timings.

