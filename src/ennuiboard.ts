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

interface SubsystemOpts {
    auto?: boolean;
    manualPoll?: boolean;
}

interface Subsystem {
    requiresPermission: boolean;
    supported: () => boolean;
    enable: (opts: SubsystemOpts) => Promise<boolean>;
}

const eb = {
    subsystems: <Record<string, any /* Subsystem */>> {},
    supported: <Record<string, boolean>> {
        any: false
    },
    enabled: <Record<string, boolean>> {
        any: false
    },
    enabling: <Record<string, Promise<boolean> | undefined>> {},
    requiresPermissions: <Record<string, boolean>> {},

    /**
     * Enable this subsystem.
     */
    enable: async function(
        t: string, opts: SubsystemOpts = {}
    ): Promise<boolean> {
        if (!this.supported[t])
            return Promise.resolve(false);
        if (this.enabling[t])
            return this.enabling[t]!;

        const p = this.enabling[t] = (async () => {
            const ret = await this.subsystems[t].enable(opts);
            if (!ret) return ret;
            if (opts.auto && typeof localStorage !== "undefined") {
                let auto: Record<string, SubsystemOpts> = {};
                const autoStr = localStorage.getItem("eb-auto");
                if (autoStr)
                    auto = JSON.parse(autoStr);
                auto[t] = opts;
                localStorage.setItem("eb-auto", JSON.stringify(auto));
            }
        })();

        return p;
    },

    /**
     * Remove this subsystem from autoloading.
     */
    disable: function(t: string) {
        // Only disables auto
        if (typeof localStorage === "undefined")
            return;
        var autoStr = localStorage.getItem("eb-auto");
        if (!autoStr)
            return;
        const auto: Record<string, SubsystemOpts> = JSON.parse(autoStr);
        delete auto[t];
        if (Object.keys(auto).length === 0)
            localStorage.removeItem("eb-auto");
        else
            localStorage.setItem("eb-auto", JSON.stringify(auto));
    }
};

export default eb;

/**
 * Dispatch a faux keypress event in response to another kind of event.
 */
function dispatchKey(du: string, key: string) {
    var ev = new KeyboardEvent("key" + du, {
        key: key,
        bubbles: true
    });
    (document.activeElement || document.body).dispatchEvent(ev);
}

// Gamepad support
eb.subsystems.gamepad = {
    requiresPermissions: false,

    supported: function() {
        return !!(navigator.getGamepads || (<any> navigator).webkitGetGamepads);
    },

    enable: function(opts: SubsystemOpts = {}) {
        if (navigator.getGamepads) {
            this._getGamepads = navigator.getGamepads.bind(navigator);
            this._queryButton = this._standardQueryButton;
        } else {
            this._getGamepads = (<any> navigator).webkitGetGamepads.bind(navigator);
            this._queryButton = this._webkitQueryButton;
        }

        if (!opts.manualPoll)
            this._interval = setInterval(this.poll.bind(this), 50);

        eb.enabled.gamepad = eb.enabled.any = true;

        return Promise.resolve(true);
    },

    _state: {},

    // Gamepads are poll-based, so call this to check for events
    poll: function() {
        let pads = this._getGamepads();
        for (let pi = 0; pi < pads.length; pi++) {
            let pad = pads[pi];
            if (!pad) continue;
            if (!(pad.id in this._state))
                this._state[pad.id] = {};
            let state = this._state[pad.id];

            // Query buttons
            for (let bi = 0; bi < pad.buttons.length; bi++) {
                const bis = "b" + bi;
                if (!(bis in state))
                    state[bis] = false;

                const newState = this._queryButton(pad.buttons[bi]);
                if (newState !== state[bis]) {
                    // Send an event
                    dispatchKey(newState?"down":"up", "eb:gamepad:" + pad.id + ":" + bis);
                    state[bis] = newState;
                }
            }

            // And axes
            for (let ai = 0; ai < pad.axes.length; ai++) {
                const ais = "a" + ai;
                if (!(ais in state))
                    state[ais] = 0;

                const newState = ~~Math.round(pad.axes[ai]);
                if (newState !== state[ais]) {
                    // Two phases in case we jumped all the way
                    const key = "eb:gamepad:" + pad.id + ":" + ais;
                    if (state[ais]) {
                        const ukey = key + (state[ais]>0?"+":"-");
                        dispatchKey("up", ukey);
                    }
                    if (newState) {
                        const dkey = key + (newState>0?"+":"-");
                        dispatchKey("down", dkey);
                    }
                    state[ais] = newState;
                }
            }
        }
    },

    // Query a button using the standard interface
    _standardQueryButton: function(b: GamepadButton) {
        return (b.value > 0 || b.pressed);
    },

    // Query a button using the old interface
    _webkitQueryButtons: function(b: number) {
        return b > 0;
    }
};

// MIDI input
eb.subsystems.midi = {
    requiresPermissions: true,

    supported: function() {
        return !!(navigator.requestMIDIAccess);
    },

    _state: <Record<string, Record<string, string>>> {},

    enable: async function(opts: SubsystemOpts = {}) {
        try {
            const access = await navigator.requestMIDIAccess();

            // Add all the inputs
            access.inputs.forEach((port, key) => {
                let state = this._state[key] = <Record<string, string>> {};

                port.addEventListener("midimessage", (ev) => {
                    if (!ev.data || ev.data.length < 3) return;
                    let oev = null;

                    // Check for recognized messages
                    let t = ev.data[0] & 0xF0;
                    if (t === 0x90 /* Note on */)
                        oev = ev.data[2] ? "down" : "up";
                    else if (t === 0x80 /* Note off */)
                        oev = "up";

                    // Handle the state
                    if (!oev) return;
                    let note = (ev.data[0]&0xF) /* Channel */ + ":" + ev.data[1];
                    if (!(note in state))
                        state[note] = "up";
                    if (oev === state[note]) return;

                    // Convert it into an event
                    dispatchKey(oev, "eb:midi:" + key + ":" + note);
                    state[note] = oev;
                });
            });

            return true;

        } catch (ex) {
            return false;

        }
    }

};

// Set up support information
for (const t of ["gamepad", "midi"]) {
    if (eb.supported[t] = eb.subsystems[t].supported())
        eb.supported.any = true;
    eb.requiresPermissions[t] = eb.subsystems[t].requiresPermission;
}

// And autoload
if (typeof localStorage !== "undefined") {
    let autoStr = localStorage.getItem("eb-auto");
    if (!autoStr) autoStr = "{}";
    const auto: Record<string, SubsystemOpts> = JSON.parse(autoStr);
    for (const t of Object.keys(auto).sort()) {
        if (auto[t])
            eb.enable(t, auto[t]);
    }
}
