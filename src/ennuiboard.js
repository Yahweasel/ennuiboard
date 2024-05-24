/*!
 * Copyright (c) 2019-2024 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export const Ennuiboard = {
    subsystems: {},
    supported: {
        any: false
    },
    enabled: {
        any: false
    },
    enabling: {},
    requiresPermission: {},
    /**
     * Enable this subsystem.
     */
    enable: function (t_1) {
        return __awaiter(this, arguments, void 0, function* (t, opts = {}) {
            if (!this.supported[t])
                return Promise.resolve(false);
            if (this.enabling[t])
                return this.enabling[t];
            const p = this.enabling[t] = (() => __awaiter(this, void 0, void 0, function* () {
                const ret = yield this.subsystems[t].enable(opts);
                if (!ret)
                    return ret;
                if (opts.auto && typeof localStorage !== "undefined") {
                    let auto = {};
                    const autoStr = localStorage.getItem("eb-auto");
                    if (autoStr)
                        auto = JSON.parse(autoStr);
                    auto[t] = opts;
                    localStorage.setItem("eb-auto", JSON.stringify(auto));
                }
                return true;
            }))();
            return p;
        });
    },
    /**
     * Remove this subsystem from autoloading.
     */
    disable: function (t) {
        // Only disables auto
        if (typeof localStorage === "undefined")
            return;
        var autoStr = localStorage.getItem("eb-auto");
        if (!autoStr)
            return;
        const auto = JSON.parse(autoStr);
        delete auto[t];
        if (Object.keys(auto).length === 0)
            localStorage.removeItem("eb-auto");
        else
            localStorage.setItem("eb-auto", JSON.stringify(auto));
    }
};
/**
 * Dispatch a faux keypress event in response to another kind of event.
 */
function dispatchKey(du, key) {
    var ev = new KeyboardEvent("key" + du, {
        key: key,
        bubbles: true
    });
    (document.activeElement || document.body).dispatchEvent(ev);
}
// Gamepad support
const GamepadSubsystem = {
    requiresPermission: false,
    supported: function () {
        return !!navigator.getGamepads;
    },
    enable: function (opts = {}) {
        if (!opts.manualPoll)
            this._interval = setInterval(this.poll.bind(this), 50);
        Ennuiboard.enabled.gamepad = Ennuiboard.enabled.any = true;
        return Promise.resolve(true);
    },
    _interval: 0,
    _bstate: {},
    _astate: {},
    // Gamepads are poll-based, so call this to check for events
    poll: function () {
        let pads = navigator.getGamepads();
        for (let pi = 0; pi < pads.length; pi++) {
            let pad = pads[pi];
            if (!pad)
                continue;
            if (!(pad.id in this._bstate)) {
                this._bstate[pad.id] = {};
                this._astate[pad.id] = {};
            }
            const bstate = this._bstate[pad.id];
            const astate = this._astate[pad.id];
            // Query buttons
            for (let bi = 0; bi < pad.buttons.length; bi++) {
                const bis = "b" + bi;
                if (!(bis in bstate))
                    bstate[bis] = false;
                const newState = this._queryButton(pad.buttons[bi]);
                if (newState !== bstate[bis]) {
                    // Send an event
                    dispatchKey(newState ? "down" : "up", "eb:gamepad:" + pad.id + ":" + bis);
                    bstate[bis] = newState;
                }
            }
            // And axes
            for (let ai = 0; ai < pad.axes.length; ai++) {
                const ais = "a" + ai;
                if (!(ais in astate))
                    astate[ais] = 0;
                const newState = ~~Math.round(pad.axes[ai]);
                if (newState !== astate[ais]) {
                    // Two phases in case we jumped all the way
                    const key = "eb:gamepad:" + pad.id + ":" + ais;
                    if (astate[ais]) {
                        const ukey = key + (astate[ais] > 0 ? "+" : "-");
                        dispatchKey("up", ukey);
                    }
                    if (newState) {
                        const dkey = key + (newState > 0 ? "+" : "-");
                        dispatchKey("down", dkey);
                    }
                    astate[ais] = newState;
                }
            }
        }
    },
    // Query a button using the standard interface
    _queryButton: function (b) {
        return (b.value > 0 || b.pressed);
    }
};
Ennuiboard.subsystems.gamepad = GamepadSubsystem;
// MIDI input
const MIDISubsystem = {
    requiresPermission: true,
    supported: function () {
        return !!(navigator.requestMIDIAccess);
    },
    _state: {},
    enable: function () {
        return __awaiter(this, arguments, void 0, function* (opts = {}) {
            try {
                const access = yield navigator.requestMIDIAccess();
                // Add all the inputs
                access.inputs.forEach((port, key) => {
                    let state = this._state[key] = {};
                    port.addEventListener("midimessage", (ev) => {
                        if (!ev.data || ev.data.length < 3)
                            return;
                        let oev = null;
                        // Check for recognized messages
                        let t = ev.data[0] & 0xF0;
                        if (t === 0x90 /* Note on */)
                            oev = ev.data[2] ? "down" : "up";
                        else if (t === 0x80 /* Note off */)
                            oev = "up";
                        // Handle the state
                        if (!oev)
                            return;
                        let note = (ev.data[0] & 0xF) /* Channel */ + ":" + ev.data[1];
                        if (!(note in state))
                            state[note] = "up";
                        if (oev === state[note])
                            return;
                        // Convert it into an event
                        dispatchKey(oev, "eb:midi:" + key + ":" + note);
                        state[note] = oev;
                    });
                });
                return true;
            }
            catch (ex) {
                return false;
            }
        });
    },
    poll: function () { }
};
Ennuiboard.subsystems.midi = MIDISubsystem;
// Set up support information
for (const t of ["gamepad", "midi"]) {
    if (Ennuiboard.supported[t] = Ennuiboard.subsystems[t].supported())
        Ennuiboard.supported.any = true;
    Ennuiboard.requiresPermission[t] = Ennuiboard.subsystems[t].requiresPermission;
}
// And autoload
if (typeof localStorage !== "undefined") {
    let autoStr = localStorage.getItem("eb-auto");
    if (!autoStr)
        autoStr = "{}";
    const auto = JSON.parse(autoStr);
    for (const t of Object.keys(auto).sort()) {
        if (auto[t])
            Ennuiboard.enable(t, auto[t]);
    }
}
