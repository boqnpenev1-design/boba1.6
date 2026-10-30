# Root Cause Analysis: Detection Vectors in oblivion.lua

## 1. Executive Summary

Execution of `oblivion.lua` resulted in an immediate flag and ban due to three compounding architectural failures:
1. **Aggressive Default Configuration**: Over 20 features were hardcoded to `true` on initialization with zero toggles or safeguards.
2. **Missing UI Control Interface**: The script lacked a GUI menu (such as Rayfield, Orion, or native UI) to selectively enable modules; execution activated every hook simultaneously upon injection.
3. **Severe Server-Sided & Replication Triggers**: Multiple functions directly mutated replicated game instances, fired unthrottled network events, and forced illegal physics states.

---

## 2. Immediate Detection Vectors (Code Breakdown)

### Vector A: Unthrottled Remote Activation (`MeleeAutoSwing`)
- **Location**: `oblivion.lua` (lines 507–524)
- **Mechanism**:
  ```lua
  RunService.RenderStepped:Connect(function(delta)
      ...
      if Config.Combat.MeleeAutoSwing and myChar then
          ...
          pcall(function() currentTool:Activate() end)
  ```
- **Detection Profile**: `RenderStepped` executes on every rendered frame (60Hz to 144Hz+). Calling `Tool:Activate()` inside this loop fires tool-activation network remotes dozens of times per second without cooldown or debounce logic. Server-side action rate-limiters register an impossible packet frequency and issue instant automated sanctions.

### Vector B: Replicated Instance Injection (`PlayerChams`)
- **Location**: `oblivion.lua` (lines 619–633)
- **Mechanism**:
  ```lua
  local hl = Instance.new("Highlight")
  hl.Name = "CombatHighlight"
  hl.Parent = char -- Char belongs to another player
  ```
- **Detection Profile**: Injecting an unauthorized instance (`Highlight`) directly into foreign player character models triggers client and server `ChildAdded` listeners. Games with standard integrity monitoring track descendant changes on character models.

### Vector C: Proximity Prompt Property Mutation (`FastLoot`)
- **Location**: `oblivion.lua` (lines 414–427)
- **Mechanism**:
  ```lua
  task.spawn(function()
      while true do
          pcall(function()
              for _, prompt in ipairs(Workspace:GetDescendants()) do
                  if prompt:IsA("ProximityPrompt") and prompt.HoldDuration > 0.05 then
                      prompt.HoldDuration = 0.05
                  end
              end
          end)
          task.wait(2)
      end
  end)
  ```
- **Detection Profile**: Continual traversal of `Workspace` mutating `HoldDuration` properties is flagged when interaction signals reach the server completed in 0.05 seconds instead of the expected server-verified interaction threshold.

### Vector D: Illegal Humanoid State Transitions (`InfiniteJump` & `SafeLanding`)
- **Location**: `oblivion.lua` (lines 383–389, 471–479)
- **Mechanism**:
  ```lua
  hum:ChangeState(Enum.HumanoidStateType.Jumping)
  ```
- **Detection Profile**: Forcing the `Jumping` state while the character is already in `Freefall` (especially with downward velocity `< -45` for fall damage negation) violates server-side movement replication. The server verifies ground-contact preconditions before accepting jump states.

### Vector E: Global Environment Mutation (`WaterClarity`)
- **Location**: `oblivion.lua` (lines 429–436)
- **Mechanism**:
  ```lua
  terrain.WaterTransparency = 1
  ```
- **Detection Profile**: Client-side property monitors (`GetPropertyChangedSignal`) on `Workspace.Terrain` and `Lighting` identify unauthorized visual tampering instantly upon load.

---

## 3. Configuration & Interface Failures

| Parameter | State in Script | Safe Standard | Consequence |
|---|---|---|---|
| `AimbotEnabled` | `true` | `false` | Immediate camera CFrame snap |
| `FastLoot` | `true` | `false` | Background prompt tamper loop |
| `MeleeAutoSwing` | `true` | `false` | RenderStepped packet flooding |
| `PlayerChams` | `true` | `false` | Highlight injection into characters |
| `SafeLanding` | `true` | `false` | Mid-air state override |
| `InfiniteJump` | `true` | `false` | In-air jump state spoof |
| `UI Menu` | None | Toggle Window | All modules active on injection |

---

## 4. Testing & Safety Protocol Failures

1. **Production Account Injection**:
   - Injecting uncompiled or unverified scripts directly into a main or high-value account exposes that account to instant automatic flags.
2. **Lack of Isolation**:
   - Scripts should only ever be evaluated in dedicated, throwaway testing environments using burner accounts with completely independent sessions.
3. **No Phased Verification**:
   - Verification must occur by enabling one isolated passive visual feature at a time, never active memory or physics overrides.
