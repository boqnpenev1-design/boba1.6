// CS2 Anti-Tamper & Memory Integrity Shield
// Protects game state against memory modification, casual decompilation, devtools inspection, and speedhacks

(function(global) {
  'use strict';

  // Evaluate debug flag from URL query string
  const urlParams = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search) : null;
  const isDebug = !!(urlParams && urlParams.get('debug') === '1');

  // Internal mutable engine state
  let _enabled = !isDebug;
  let _violations = 0;
  let _timingInterval = null;

  // Private cryptographic salt generated per session
  const _SALT = Math.floor(Math.random() * 0xFFFFFF) ^ 0xA5B3C1;
  const _CANARY_SECRET = (Date.now() & 0xFFFF) ^ 0x5C3A;

  // Masked Number Structure: stores value as XOR mask + integrity hash
  class ProtectedNumber {
    constructor(initialValue = 0) {
      this._mask = 0;
      this._canary = 0;
      this.set(initialValue);
    }

    set(val) {
      const intVal = Math.round(Number(val));
      this._mask = intVal ^ _SALT;
      this._canary = ((this._mask * 31) + _CANARY_SECRET) & 0x7FFFFFFF;
    }

    get() {
      // Validate checksum integrity
      const expectedCanary = ((this._mask * 31) + _CANARY_SECRET) & 0x7FFFFFFF;
      if (this._canary !== expectedCanary) {
        console.warn("[SECURITY] Memory canary violation detected! Sanitizing state.");
        this.set(0);
        return 0;
      }
      return this._mask ^ _SALT;
    }

    add(val) {
      this.set(this.get() + val);
    }
  }

  // Anti-Cheat Core Engine
  const AntiCheat = {
    get enabled() { return _enabled; },
    get _enabled() { return _enabled; },
    set _enabled(val) { _enabled = !!val; },
    get isDebug() { return isDebug; },
    get violations() { return _violations; },
    _lastFrameTime: performance.now(),
    _maxMoveSpeed: 16.0, // Maximum allowed units/second in 3D space

    createProtectedValue(val) {
      return new ProtectedNumber(val);
    },

    // Speedhack / Movement validator
    validateMovementDelta(oldPos, newPos, dt) {
      if (!_enabled || dt <= 0) return newPos;
      
      const dx = newPos.x - oldPos.x;
      const dz = newPos.z - oldPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const speed = dist / dt;

      // If player moves faster than maximum allowed speed + air acceleration tolerance
      if (speed > this._maxMoveSpeed) {
        // Clamp position back
        const ratio = this._maxMoveSpeed / speed;
        return {
          x: oldPos.x + dx * ratio,
          y: newPos.y,
          z: oldPos.z + dz * ratio
        };
      }
      return newPos;
    },

    // DevTools & Debugger Deterrent
    initDevToolsGuard() {
      if (isDebug) {
        _enabled = false;
        if (_timingInterval) {
          clearInterval(_timingInterval);
          _timingInterval = null;
        }
        console.log('[DEBUG] AntiCheat guard disabled via ?debug=1. Developer tools unlocked.');
        return;
      }

      // Block common inspect shortcuts in production mode
      window.addEventListener('keydown', (e) => {
        if (!_enabled) return;
        // F12
        if (e.keyCode === 123) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
        if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        // Ctrl+U (View Source)
        if (e.ctrlKey && e.keyCode === 85) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }, true);

      // Disable Right Click context menu inside game viewport
      window.addEventListener('contextmenu', (e) => {
        if (_enabled && document.pointerLockElement) {
          e.preventDefault();
        }
      });

      // Background timing anomaly check (detects devtools pause / breakpoints)
      _timingInterval = setInterval(() => {
        if (!_enabled) return;
        const start = performance.now();
        for (let i = 0; i < 100; i++) {}
        const diff = performance.now() - start;
        if (diff > 120) {
          _violations++;
          if (_violations > 3) {
            console.clear();
          }
        }
      }, 2000);
    },

    setEnabled(status) {
      _enabled = !!status;
    }
  };

  // Seal AntiCheat object so it cannot be prototype-tampered
  Object.freeze(AntiCheat);
  global.__CS2_AC = AntiCheat;

})(window);
