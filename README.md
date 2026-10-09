# Counter-Strike 2 Browser Edition (Web CS2)

A zero-dependency, pure web-standard 3D competitive first-person shooter recreation of **Counter-Strike 2 (CS2)** running smoothly inside any modern desktop web browser.

---

## 🎮 Key Features

- **2 Official Maps**:
  - **Dust II (`de_dust2`)**: Complete desert geometry with Bombsite A (Platform, Long A, Catwalk), Bombsite B (Tunnels, B Doors, Window), and Middle with mid doors and Xbox crate.
  - **Mirage (`de_mirage`)**: Moroccan town layout with Bombsite A (Palace, Tetris, Triple Box, Ticket booth), Bombsite B (Apartments, Van, Market), and Middle (Sniper Window, Connector, Catwalk).
- **Two Sides**:
  - **Counter-Terrorists (CT)**: Spawns with USP-S, defends bombsites, defuses C4 with defusal kits.
  - **Terrorists (T)**: Spawns with Glock-18 and C4 Explosive, infiltrates sites to plant the bomb.
- **Official Competitive Mode (MR12)**:
  - First team to 13 rounds wins.
  - Halftime team swap at Round 12.
  - 15-second Buy Phase (Freeze time) + 1:55 round time.
  - Official CS2 Economy ($800 starting pistol round cash, kill bonuses, $3,250 round win bonus, loss streak bonuses up to $3,400).
- **Complete CS2 Weapon Arsenal**:
  - **Pistols**: Glock-18, USP-S, P250, Desert Eagle, Dual Berettas, Five-SeveN, Tec-9, CZ75-Auto.
  - **Mid-Tier (SMGs & Shotguns)**: MAC-10, MP9, MP7, MP5-SD, UMP-45, P90, PP-Bizon, Nova, XM1014, MAG-7, Sawed-Off, Negev, M249.
  - **Rifles & Snipers**: AK-47, M4A4, M4A1-S, Galil AR, FAMAS, SSG 08 (Scout), AWP (with sniper scope overlay), AUG, SG 553, SCAR-20, G3SG1.
  - **Equipment & Gear**: Kevlar Vest ($650), Kevlar + Helmet ($1000), Defuse Kit ($400), Grenades, Combat Knife.
- **C4 Bomb & Defuse Mechanics**:
  - Hold `E` on Bombsite A or B to plant (3.2s arming progress).
  - 40.0-second fuse timer with accelerating audio beep cadence.
  - Defusal (Hold `E`): **5.0s** with Defuse Kit, **10.0s** without kit.
  - Screen-shaking C4 explosion upon detonation.
- **Cross-WiFi Online Multiplayer (WebRTC PeerJS)**:
  - Play online with friends across **any Wi-Fi network** with zero port forwarding or server configuration.
  - Host creates a 6-character Room Code (e.g. `CS-7X9B`).
  - Friends join instantly from any browser by entering the Room Code.
  - Includes offline 5v5 Tactical AI bots when playing solo or filling empty slots.
- **Customizable Settings & Keybinds**:
  - Keybind remapping for every action (Move, Jump, Crouch, Walk, Reload, Plant/Defuse, Buy, Weapons, Scoreboard).
  - Mouse sensitivity slider and numeric input.
  - Field of view (FOV) slider (65° – 105°).
  - Invert Mouse Y toggle.
  - Custom crosshair generator (Color picker, size, thickness, gap, center dot).
  - Audio sliders for Master, Gunfire, and C4 beeps.
- **Client Security & Anti-Cheat Protection**:
  - **Memory Masking & Canary Checksums**: Player health, armor, money, and ammo are sealed with XOR masks and cryptographic checksums to prevent console tampering.
  - **DevTools Anti-Debugger Shield**: Blocks F12, Ctrl+Shift+I, and inspect shortcuts during match play; detects debugger pauses.
  - **Speedhack & Delta Clamping**: Movement velocities are bounded per tick to prevent teleportation and speed manipulations.
  - **Host-Authoritative Damage Verification**: Multiplayer hits and bomb states are synced and verified by the host peer.

---

## 🚀 How to Deploy on GitHub & GitHub Pages

You can host this entire game for free on GitHub Pages:

### Step 1: Create a GitHub Repository
1. Go to [GitHub.com/new](https://github.com/new).
2. Name your repository (e.g. `cs2-browser` or `cs2-web-edition`).
3. Set visibility to **Public** and click **Create repository**.

### Step 2: Push Your Code
Open your terminal inside this project directory (`c:\Users\boqnp\Desktop\bobav2 web`) and run:

```bash
git init
git add .
git commit -m "feat: CS2 Web Browser Edition with Dust2, Mirage, and Multiplayer"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

### Step 3: Enable GitHub Pages (1 Click)
1. In your GitHub repository, click **Settings** (gear tab at the top).
2. In the left navigation, click **Pages**.
3. Under **Build and deployment** &rarr; **Branch**, select `main` and `/ (root)`.
4. Click **Save**.
5. Within 1 minute, GitHub will give you a live URL:
   `https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/`

Anyone in the world can open that link on any Wi-Fi to play!

---

## ⌨️ Default Controls

| Action | Key / Control |
|---|---|
| **Move** | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> |
| **Look / Aim** | Mouse (Pointer Lock) |
| **Fire Weapon** | Left Mouse Button |
| **Scope / Zoom** | Right Mouse Button |
| **Reload** | <kbd>R</kbd> |
| **Plant C4 / Defuse** | <kbd>E</kbd> (Hold) |
| **Jump** | <kbd>Space</kbd> |
| **Crouch** | <kbd>Ctrl</kbd> |
| **Walk / Sneak** | <kbd>Shift</kbd> |
| **Buy Menu** | <kbd>B</kbd> |
| **Scoreboard** | <kbd>Tab</kbd> (Hold) |
| **Select Slot 1 (Primary)** | <kbd>1</kbd> |
| **Select Slot 2 (Pistol)** | <kbd>2</kbd> |
| **Select Slot 3 (Knife)** | <kbd>3</kbd> |
| **Select Slot 4 (Grenades)**| <kbd>4</kbd> |
| **Select Slot 5 (C4)** | <kbd>5</kbd> |
| **Pause / Settings** | <kbd>Esc</kbd> |

*(All keys can be rebound to your preference in the **Settings & Controls** menu).*

---

## 🛠 Tech Stack

- **Rendering**: Three.js WebGL 3D Engine
- **Audio**: Web Audio API (procedural synthesis for zero missing assets)
- **Multiplayer**: PeerJS / WebRTC P2P DataChannels (cross-NAT STUN)
- **Security**: Closed-scope XOR memory masking + DevTools event filters
- **Styling**: Vanilla CSS3 with CS2 Dark Modern aesthetic
