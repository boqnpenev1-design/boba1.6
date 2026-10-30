--[[
  ___   ____   _      ___   __     __  ___    ___   _   _ 
 / _ \ | __ ) | |    |_ _|  \ \   / / |_ _|  / _ \ | \ | |
| | | ||  _ \ | |     | |    \ \ / /   | |  | | | ||  \| |
| |_| || |_) || |___  | |     \ V /    | |  | |_| || |\  |
 \___/ |____/ |_____||___|     \_/    |___|  \___/ |_| \_|
]]

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local SoundService = game:GetService("SoundService")

local LocalPlayer = Players.LocalPlayer
local Camera = Workspace.CurrentCamera

local Config = {
    Combat = {
        AimbotEnabled = true,
        AimKey = Enum.UserInputType.MouseButton2,
        AimBone = "Head",
        AimFOV = 100,
        Smoothness = 0.20,
        ShowFOVCircle = true,
        FOVCircleColor = Color3.fromRGB(255, 255, 255),
        
        BulletDropLead = true,
        Triggerbot = false,
        FullAutoConverter = true,
        MeleeAutoSwing = true,
        TeamWhitelist = true,
        
        RecoilReticle = true,
        DrawingBulletTracers = true,
        TracerColor = Color3.fromRGB(0, 220, 255),
        DamagePopups = true,
        DamageLog = true,
    },
    Visuals = {
        PlayerESP = true,
        PlayerChams = true,
        Boxes = true,
        Skeletons = true,
        LookRays = true,
        HealthBars = true,
        EquippedItem = true,
        Distance = true,
        OffScreenRadar = true,
        
        BoxColor = Color3.fromRGB(0, 255, 140),
        SkeletonColor = Color3.fromRGB(255, 255, 255),
        RayColor = Color3.fromRGB(255, 80, 80),
        TextColor = Color3.fromRGB(255, 255, 255),
        ChamOccludedColor = Color3.fromRGB(0, 255, 120),
        ChamVisibleColor = Color3.fromRGB(255, 40, 40),
    },
    WorldRadar = {
        OreNodes = true,
        Beds = true,
        Workbenches = true,
        Backpacks = true,
        StorageChests = true,
        MaxDistance = 1200,
    },
    Movement = {
        FastWalk = false,
        SpeedFactor = 1.45,
        Noclip = false,
        InfiniteJump = true,
        SafeLanding = true,
    },
    Desync = {
        GhostPeek = false,
        GhostPeekKey = Enum.KeyCode.X,
        RubberbandPeekKey = Enum.KeyCode.Z,
    },
    Utilities = {
        WaterClarity = true,
        SafeFOVZoom = false,
        ZoomKey = Enum.KeyCode.C,
        ZoomFOV = 25,
        DefaultFOV = 90,
        CustomCrosshair = true,
        FastLoot = true,
        LootVacuum = false,
        LiveAmmoHUD = true,
        EnemyInventoryViewer = true,
    }
}

local WeaponBallistics = {
    ["Military MP7"] = { Speed = 1900, Gravity = 0.6, RPM = 575, Auto = true },
    ["Salvaged AK47"] = { Speed = 2100, Gravity = 0.55, RPM = 450, Auto = true },
    ["Salvaged AK74u"] = { Speed = 1800, Gravity = 0.6, RPM = 540, Auto = true },
    ["Military Barrett"] = { Speed = 2500, Gravity = 0.55, RPM = 160, Auto = true },
    ["Salvaged P250"] = { Speed = 1400, Gravity = 0.6, RPM = 375, Auto = false },
    ["Salvaged M14"] = { Speed = 2100, Gravity = 0.55, RPM = 370, Auto = false },
    ["Salvaged Python"] = { Speed = 1800, Gravity = 0.6, RPM = 300, Auto = false },
    ["Military M4A1"] = { Speed = 2100, Gravity = 0.55, RPM = 500, Auto = true },
    ["Bruno's M4A1"] = { Speed = 2100, Gravity = 0.55, RPM = 530, Auto = true },
    ["Military PKM"] = { Speed = 2400, Gravity = 0.55, RPM = 425, Auto = true },
    ["Military AA12"] = { Speed = 600, Gravity = 0.6, RPM = 220, Auto = true },
    ["Military M39"] = { Speed = 2400, Gravity = 0.52, RPM = 420, Auto = false },
    ["Salvaged SMG"] = { Speed = 1800, Gravity = 0.6, RPM = 462, Auto = true },
    ["Salvaged Skorpion"] = { Speed = 1750, Gravity = 0.6, RPM = 600, Auto = true },
    ["Salvaged Pump Action"] = { Speed = 650, Gravity = 0.6, RPM = 150, Auto = false },
    ["Salvaged Double Barrel"] = { Speed = 550, Gravity = 0.6, RPM = 120, Auto = false },
    ["Salvaged Break Action"] = { Speed = 550, Gravity = 0.6, RPM = 130, Auto = false },
    ["Salvaged Shotgun"] = { Speed = 400, Gravity = 0.6, RPM = 100, Auto = false },
    ["Salvaged Sniper"] = { Speed = 2400, Gravity = 0.55, RPM = 160, Auto = true },
    ["Crossbow"] = { Speed = 420, Gravity = 0.2, RPM = 180, Auto = false },
    ["Wooden Bow"] = { Speed = 280, Gravity = 0.2, RPM = 150, Auto = false },
    ["Salvaged RPG"] = { Speed = 100, Gravity = 0.12, RPM = 60, Auto = false },
    ["Military Grenade Launcher"] = { Speed = 85, Gravity = 0.15, RPM = 70, Auto = false },
}

local MeleeRanges = {
    ["Bone Tool"] = 5,
    ["Iron Shard Hatchet"] = 5,
    ["Iron Shard Pickaxe"] = 5,
    ["Stone Hatchet"] = 5,
    ["Stone Pickaxe"] = 5,
    ["Steel Axe"] = 5.5,
    ["Steel Pickaxe"] = 5.5,
    ["Machete"] = 5.5,
    ["Halloween Scythe"] = 5.5,
    ["Saw Bat"] = 6.5,
    ["Chainsaw"] = 6.5,
    ["Mining Drill"] = 6.5,
    ["Wooden Spear"] = 7.5,
    ["Stone Spear"] = 7.5,
}

local function SafeDraw(drawType)
    local ok, res = pcall(function()
        return Drawing.new(drawType)
    end)
    if ok and res then return res end
    return nil
end

local Watermark = SafeDraw("Text")
if Watermark then
    Watermark.Visible = true
    Watermark.Text = "OBLIVION"
    Watermark.Size = 14
    Watermark.Color = Color3.fromRGB(0, 255, 140)
    Watermark.Outline = true
    Watermark.Position = Vector2.new(30, 30)
end

local FOVCircle = SafeDraw("Circle")
if FOVCircle then
    FOVCircle.Visible = false
    FOVCircle.Thickness = 1
    FOVCircle.Radius = Config.Combat.AimFOV
    FOVCircle.Color = Config.Combat.FOVCircleColor
    FOVCircle.Filled = false
end

local CrosshairX = SafeDraw("Line")
local CrosshairY = SafeDraw("Line")
if CrosshairX and CrosshairY then
    CrosshairX.Visible = false
    CrosshairX.Color = Color3.fromRGB(0, 255, 140)
    CrosshairX.Thickness = 1.5
    CrosshairY.Visible = false
    CrosshairY.Color = Color3.fromRGB(0, 255, 140)
    CrosshairY.Thickness = 1.5
end

local AmmoLabel = SafeDraw("Text")
if AmmoLabel then
    AmmoLabel.Visible = false
    AmmoLabel.Size = 15
    AmmoLabel.Center = false
    AmmoLabel.Outline = true
    AmmoLabel.Color = Color3.fromRGB(255, 255, 255)
    AmmoLabel.Position = Vector2.new(30, Camera.ViewportSize.Y - 80)
end

local DamageLogText = SafeDraw("Text")
if DamageLogText then
    DamageLogText.Visible = false
    DamageLogText.Size = 13
    DamageLogText.Center = false
    DamageLogText.Outline = true
    DamageLogText.Color = Color3.fromRGB(255, 100, 100)
    DamageLogText.Position = Vector2.new(30, 200)
end

local PlayerDrawings = {}
local WorldDrawings = {}
local FloatingPopups = {}

local function IsTeammate(player)
    if not Config.Combat.TeamWhitelist then return false end
    if player == LocalPlayer then return true end
    
    local ok, res = pcall(function()
        if shared.YourTeam and typeof(shared.YourTeam) == "table" then
            if table.find(shared.YourTeam, player.Name) or table.find(shared.YourTeam, player) then
                return true
            end
        end
        if shared.cachedTeamModels and typeof(shared.cachedTeamModels) == "table" then
            if player.Character and table.find(shared.cachedTeamModels, player.Character) then
                return true
            end
        end
        if shared.ClanInfo and typeof(shared.ClanInfo) == "table" and shared.ClanInfo.Members then
            if table.find(shared.ClanInfo.Members, player.Name) then
                return true
            end
        end
        return false
    end)
    return ok and res or false
end

local function SetupPlayerVisuals(player)
    if player == LocalPlayer then return end
    
    local entry = {
        Player = player,
        BoxOutline = SafeDraw("Square"),
        Box = SafeDraw("Square"),
        Name = SafeDraw("Text"),
        Distance = SafeDraw("Text"),
        HealthBar = SafeDraw("Line"),
        HealthBarOutline = SafeDraw("Line"),
        LookRay = SafeDraw("Line"),
        RadarArrow = SafeDraw("Triangle"),
        Bones = {},
        Highlight = nil,
    }
    
    if entry.BoxOutline then
        entry.BoxOutline.Visible = false
        entry.BoxOutline.Color = Color3.fromRGB(0, 0, 0)
        entry.BoxOutline.Thickness = 3
        entry.BoxOutline.Filled = false
    end
    if entry.Box then
        entry.Box.Visible = false
        entry.Box.Color = Config.Visuals.BoxColor
        entry.Box.Thickness = 1
        entry.Box.Filled = false
    end
    if entry.Name then
        entry.Name.Visible = false
        entry.Name.Color = Config.Visuals.TextColor
        entry.Name.Size = 13
        entry.Name.Center = true
        entry.Name.Outline = true
    end
    if entry.Distance then
        entry.Distance.Visible = false
        entry.Distance.Color = Config.Visuals.TextColor
        entry.Distance.Size = 11
        entry.Distance.Center = true
        entry.Distance.Outline = true
    end
    if entry.HealthBarOutline then
        entry.HealthBarOutline.Visible = false
        entry.HealthBarOutline.Color = Color3.fromRGB(0, 0, 0)
        entry.HealthBarOutline.Thickness = 3
    end
    if entry.HealthBar then
        entry.HealthBar.Visible = false
        entry.HealthBar.Color = Color3.fromRGB(0, 255, 0)
        entry.HealthBar.Thickness = 1.5
    end
    if entry.LookRay then
        entry.LookRay.Visible = false
        entry.LookRay.Color = Config.Visuals.RayColor
        entry.LookRay.Thickness = 1
    end
    if entry.RadarArrow then
        entry.RadarArrow.Visible = false
        entry.RadarArrow.Color = Color3.fromRGB(255, 50, 50)
        entry.RadarArrow.Filled = true
    end
    
    for i = 1, 14 do
        local boneLine = SafeDraw("Line")
        if boneLine then
            boneLine.Visible = false
            boneLine.Color = Config.Visuals.SkeletonColor
            boneLine.Thickness = 1
            table.insert(entry.Bones, boneLine)
        end
    end
    
    PlayerDrawings[player] = entry
end

local function CleanupPlayerVisuals(player)
    local entry = PlayerDrawings[player]
    if entry then
        for _, item in pairs(entry) do
            if typeof(item) == "table" and item.Remove then
                pcall(item.Remove, item)
            elseif typeof(item) == "Instance" then
                pcall(item.Destroy, item)
            end
        end
        if entry.Bones then
            for _, b in ipairs(entry.Bones) do
                pcall(b.Remove, b)
            end
        end
        PlayerDrawings[player] = nil
    end
end

for _, p in ipairs(Players:GetPlayers()) do
    SetupPlayerVisuals(p)
end
Players.PlayerAdded:Connect(SetupPlayerVisuals)
Players.PlayerRemoving:Connect(CleanupPlayerVisuals)

local function GetClosestTarget()
    local bestTarget = nil
    local bestPart = nil
    local shortestDist = Config.Combat.AimFOV
    local center = Vector2.new(Camera.ViewportSize.X / 2, Camera.ViewportSize.Y / 2)
    
    for _, player in ipairs(Players:GetPlayers()) do
        if player ~= LocalPlayer and player.Character and not IsTeammate(player) then
            local char = player.Character
            local hum = char:FindFirstChildOfClass("Humanoid")
            local targetPart = char:FindFirstChild(Config.Combat.AimBone) or char:FindFirstChild("HumanoidRootPart")
            
            if hum and hum.Health > 0 and targetPart then
                local screenPos, onScreen = Camera:WorldToViewportPoint(targetPart.Position)
                if onScreen then
                    local screenDist = (Vector2.new(screenPos.X, screenPos.Y) - center).Magnitude
                    if screenDist < shortestDist then
                        shortestDist = screenDist
                        bestTarget = player
                        bestPart = targetPart
                    end
                end
            end
        end
    end
    return bestTarget, bestPart
end

local IsAimKeyDown = false
local IsGhostPeeking = false
local PinnedRootCFrame = nil
local SavedRubberbandCFrame = nil

UserInputService.InputBegan:Connect(function(input, processed)
    if processed then return end
    
    if input.UserInputType == Config.Combat.AimKey then
        IsAimKeyDown = true
    elseif input.KeyCode == Config.Desync.GhostPeekKey then
        local char = LocalPlayer.Character
        local root = char and char:FindFirstChild("HumanoidRootPart")
        if root then
            IsGhostPeeking = true
            PinnedRootCFrame = root.CFrame
        end
    elseif input.KeyCode == Config.Desync.RubberbandPeekKey then
        local char = LocalPlayer.Character
        local root = char and char:FindFirstChild("HumanoidRootPart")
        if root then
            if not SavedRubberbandCFrame then
                SavedRubberbandCFrame = root.CFrame
            else
                root.CFrame = SavedRubberbandCFrame
                SavedRubberbandCFrame = nil
            end
        end
    elseif input.KeyCode == Config.Utilities.ZoomKey then
        Config.Utilities.SafeFOVZoom = not Config.Utilities.SafeFOVZoom
        Camera.FieldOfView = Config.Utilities.SafeFOVZoom and Config.Utilities.ZoomFOV or Config.Utilities.DefaultFOV
    elseif input.KeyCode == Enum.KeyCode.Space and Config.Movement.InfiniteJump then
        local char = LocalPlayer.Character
        local hum = char and char:FindFirstChildOfClass("Humanoid")
        if hum then
            hum:ChangeState(Enum.HumanoidStateType.Jumping)
        end
    end
end)

UserInputService.InputEnded:Connect(function(input)
    if input.UserInputType == Config.Combat.AimKey then
        IsAimKeyDown = false
    elseif input.KeyCode == Config.Desync.GhostPeekKey then
        IsGhostPeeking = false
        PinnedRootCFrame = nil
    end
end)

RunService.Stepped:Connect(function()
    if Config.Movement.Noclip then
        local char = LocalPlayer.Character
        if char then
            for _, part in ipairs(char:GetDescendants()) do
                if part:IsA("BasePart") and part.CanCollide then
                    part.CanCollide = false
                end
            end
        end
    end
end)

if Config.Utilities.FastLoot then
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
end

if Config.Utilities.WaterClarity then
    pcall(function()
        local terrain = Workspace:FindFirstChildOfClass("Terrain")
        if terrain then
            terrain.WaterTransparency = 1
        end
    end)
end

RunService.RenderStepped:Connect(function(delta)
    local center = Vector2.new(Camera.ViewportSize.X / 2, Camera.ViewportSize.Y / 2)
    local myChar = LocalPlayer.Character
    local myRoot = myChar and myChar:FindFirstChild("HumanoidRootPart")
    local myHum = myChar and myChar:FindFirstChildOfClass("Humanoid")
    
    if CrosshairX and CrosshairY then
        local showCross = Config.Utilities.CustomCrosshair
        CrosshairX.Visible = showCross
        CrosshairY.Visible = showCross
        if showCross then
            CrosshairX.From = Vector2.new(center.X - 6, center.Y)
            CrosshairX.To = Vector2.new(center.X + 6, center.Y)
            CrosshairY.From = Vector2.new(center.X, center.Y - 6)
            CrosshairY.To = Vector2.new(center.X, center.Y + 6)
        end
    end
    
    if FOVCircle then
        FOVCircle.Position = center
        FOVCircle.Radius = Config.Combat.AimFOV
        FOVCircle.Visible = Config.Combat.AimbotEnabled and Config.Combat.ShowFOVCircle
    end
    
    if Config.Movement.FastWalk and myRoot and myHum and myHum.MoveDirection.Magnitude > 0 then
        local moveStep = myHum.MoveDirection * (Config.Movement.SpeedFactor * delta * 16)
        myRoot.CFrame = myRoot.CFrame + moveStep
    end
    
    if IsGhostPeeking and myRoot and PinnedRootCFrame then
        myRoot.CFrame = PinnedRootCFrame
    end
    
    if Config.Movement.SafeLanding and myRoot and myHum then
        if myHum:GetState() == Enum.HumanoidStateType.Freefall and myRoot.Velocity.Y < -45 then
            local ray = Ray.new(myRoot.Position, Vector3.new(0, -12, 0))
            local hit = Workspace:FindPartOnRayWithIgnoreList(ray, {myChar})
            if hit then
                myHum:ChangeState(Enum.HumanoidStateType.Jumping)
            end
        end
    end
    
    if Config.Combat.AimbotEnabled and IsAimKeyDown then
        local targetPlayer, targetPart = GetClosestTarget()
        if targetPlayer and targetPart then
            local aimPos = targetPart.Position
            
            if Config.Combat.BulletDropLead then
                local equippedTool = myChar and myChar:FindFirstChildOfClass("Tool")
                local toolName = equippedTool and equippedTool.Name or ""
                local ballistics = WeaponBallistics[toolName]
                
                if ballistics and targetPart.Parent:FindFirstChild("HumanoidRootPart") then
                    local targetRoot = targetPart.Parent.HumanoidRootPart
                    local dist = (Camera.CFrame.Position - aimPos).Magnitude
                    local travelTime = dist / ballistics.Speed
                    local leadOffset = targetRoot.Velocity * travelTime
                    local dropOffset = Vector3.new(0, 0.5 * (ballistics.Gravity * 196.2) * (travelTime ^ 2), 0)
                    aimPos = aimPos + leadOffset + dropOffset
                end
            end
            
            local curCFrame = Camera.CFrame
            local targetCFrame = CFrame.new(curCFrame.Position, aimPos)
            Camera.CFrame = curCFrame:Lerp(targetCFrame, math.clamp(Config.Combat.Smoothness, 0.05, 1))
        end
    end
    
    if Config.Combat.MeleeAutoSwing and myChar then
        local currentTool = myChar:FindFirstChildOfClass("Tool")
        if currentTool and MeleeRanges[currentTool.Name] then
            local range = MeleeRanges[currentTool.Name]
            for _, player in ipairs(Players:GetPlayers()) do
                if player ~= LocalPlayer and player.Character and not IsTeammate(player) then
                    local enemyRoot = player.Character:FindFirstChild("HumanoidRootPart")
                    if enemyRoot and myRoot then
                        local dist = (myRoot.Position - enemyRoot.Position).Magnitude
                        if dist <= range then
                            pcall(function() currentTool:Activate() end)
                            break
                        end
                    end
                end
            end
        end
    end
    
    if Config.Utilities.LiveAmmoHUD and AmmoLabel then
        local success, count = pcall(function()
            local vmc = myChar and myChar:FindFirstChild("ViewmodelController")
            if vmc then
                return vmc:GetAttribute("LocalAmmo")
            end
            return nil
        end)
        if success and count then
            AmmoLabel.Text = "AMMO: " .. tostring(count)
            AmmoLabel.Visible = true
        else
            AmmoLabel.Visible = false
        end
    end
    
    for player, entry in pairs(PlayerDrawings) do
        local char = player.Character
        local root = char and char:FindFirstChild("HumanoidRootPart")
        local hum = char and char:FindFirstChildOfClass("Humanoid")
        
        if Config.Visuals.PlayerESP and root and hum and hum.Health > 0 and not IsTeammate(player) then
            local rootPos, onScreen = Camera:WorldToViewportPoint(root.Position)
            local dist = (Camera.CFrame.Position - root.Position).Magnitude
            
            if onScreen then
                if entry.RadarArrow then entry.RadarArrow.Visible = false end
                
                local head = char:FindFirstChild("Head")
                local headPos = head and Camera:WorldToViewportPoint(head.Position + Vector3.new(0, 0.5, 0)) or Vector3.new(rootPos.X, rootPos.Y - 20, 0)
                local legPos = Camera:WorldToViewportPoint(root.Position - Vector3.new(0, 3, 0))
                
                local boxH = math.abs(headPos.Y - legPos.Y)
                local boxW = boxH * 0.65
                local boxX = rootPos.X - (boxW / 2)
                local boxY = headPos.Y
                
                if Config.Visuals.Boxes and entry.Box and entry.BoxOutline then
                    entry.BoxOutline.Size = Vector2.new(boxW, boxH)
                    entry.BoxOutline.Position = Vector2.new(boxX, boxY)
                    entry.BoxOutline.Visible = true
                    entry.Box.Size = Vector2.new(boxW, boxH)
                    entry.Box.Position = Vector2.new(boxX, boxY)
                    entry.Box.Visible = true
                else
                    if entry.Box then entry.Box.Visible = false end
                    if entry.BoxOutline then entry.BoxOutline.Visible = false end
                end
                
                if Config.Visuals.HealthBars and entry.HealthBar and entry.HealthBarOutline then
                    local hpPercent = math.clamp(hum.Health / hum.MaxHealth, 0, 1)
                    entry.HealthBarOutline.From = Vector2.new(boxX - 6, boxY)
                    entry.HealthBarOutline.To = Vector2.new(boxX - 6, boxY + boxH)
                    entry.HealthBarOutline.Visible = true
                    
                    entry.HealthBar.From = Vector2.new(boxX - 6, boxY + boxH)
                    entry.HealthBar.To = Vector2.new(boxX - 6, boxY + boxH - (boxH * hpPercent))
                    entry.HealthBar.Color = Color3.fromRGB(math.floor(255 * (1 - hpPercent)), math.floor(255 * hpPercent), 0)
                    entry.HealthBar.Visible = true
                else
                    if entry.HealthBar then entry.HealthBar.Visible = false end
                    if entry.HealthBarOutline then entry.HealthBarOutline.Visible = false end
                end
                
                if entry.Name then
                    local equippedStr = ""
                    if Config.Visuals.EquippedItem then
                        local tool = char:FindFirstChildOfClass("Tool")
                        if tool then equippedStr = " [" .. tool.Name .. "]" end
                    end
                    entry.Name.Text = (player.DisplayName or player.Name) .. equippedStr
                    entry.Name.Position = Vector2.new(rootPos.X, boxY - 16)
                    entry.Name.Visible = true
                end
                
                if Config.Visuals.Distance and entry.Distance then
                    entry.Distance.Text = math.floor(dist) .. "m"
                    entry.Distance.Position = Vector2.new(rootPos.X, boxY + boxH + 2)
                    entry.Distance.Visible = true
                end
                
                if Config.Visuals.LookRays and entry.LookRay and head then
                    local lookEnd = head.Position + (head.CFrame.LookVector * 5)
                    local rayEndPos, rayOnScreen = Camera:WorldToViewportPoint(lookEnd)
                    if rayOnScreen then
                        entry.LookRay.From = Vector2.new(headPos.X, headPos.Y)
                        entry.LookRay.To = Vector2.new(rayEndPos.X, rayEndPos.Y)
                        entry.LookRay.Visible = true
                    else
                        entry.LookRay.Visible = false
                    end
                end
                
                if Config.Visuals.PlayerChams then
                    if not entry.Highlight then
                        pcall(function()
                            local hl = Instance.new("Highlight")
                            hl.Name = "CombatHighlight"
                            hl.FillTransparency = 0.5
                            hl.OutlineTransparency = 0
                            hl.Parent = char
                            entry.Highlight = hl
                        end)
                    else
                        entry.Highlight.FillColor = Config.Visuals.ChamOccludedColor
                        entry.Highlight.OutlineColor = Config.Visuals.ChamVisibleColor
                    end
                end
            else
                if entry.Box then entry.Box.Visible = false end
                if entry.BoxOutline then entry.BoxOutline.Visible = false end
                if entry.Name then entry.Name.Visible = false end
                if entry.Distance then entry.Distance.Visible = false end
                if entry.HealthBar then entry.HealthBar.Visible = false end
                if entry.HealthBarOutline then entry.HealthBarOutline.Visible = false end
                if entry.LookRay then entry.LookRay.Visible = false end
                
                if Config.Visuals.OffScreenRadar and entry.RadarArrow then
                    local rel = Camera.CFrame:PointToObjectSpace(root.Position)
                    local angle = math.atan2(-rel.X, rel.Z)
                    local rRadius = 220
                    local rCenter = Vector2.new(Camera.ViewportSize.X / 2, Camera.ViewportSize.Y / 2)
                    local arrowPos = rCenter + Vector2.new(math.sin(angle) * rRadius, math.cos(angle) * rRadius)
                    
                    entry.RadarArrow.PointA = arrowPos
                    entry.RadarArrow.PointB = arrowPos + Vector2.new(math.cos(angle + 0.3) * 12, -math.sin(angle + 0.3) * 12)
                    entry.RadarArrow.PointC = arrowPos + Vector2.new(math.cos(angle - 0.3) * 12, -math.sin(angle - 0.3) * 12)
                    entry.RadarArrow.Visible = true
                end
            end
        else
            if entry.Box then entry.Box.Visible = false end
            if entry.BoxOutline then entry.BoxOutline.Visible = false end
            if entry.Name then entry.Name.Visible = false end
            if entry.Distance then entry.Distance.Visible = false end
            if entry.HealthBar then entry.HealthBar.Visible = false end
            if entry.HealthBarOutline then entry.HealthBarOutline.Visible = false end
            if entry.LookRay then entry.LookRay.Visible = false end
            if entry.RadarArrow then entry.RadarArrow.Visible = false end
            if entry.Highlight then
                pcall(function() entry.Highlight:Destroy() end)
                entry.Highlight = nil
            end
        end
    end
end)
