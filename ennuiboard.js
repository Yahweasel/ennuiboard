/*
 * Copyright (c) 2019, 2020 Yahweasel
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

Ennuiboard = (function() {
    var eb = {
        supported: {
            any: false
        },
        enabled: {
            any: false
        },
        enabling: {},
        requiresPermissions: {},

        enable: function(t, opts) {
            if (!this.supported[t])
                return Promise.resolve(false);
            if (this.enabling[t])
                return this.enabling[t];
            return (this.enabling[t] = this[t].enable(opts).then(function(res) {
                if (res && opts && opts.auto && typeof localStorage !== "undefined") {
                    var auto = localStorage.getItem("eb-auto");
                    if (auto)
                        auto = JSON.parse(auto);
                    else
                        auto = {};
                    auto[t] = opts;
                    localStorage.setItem("eb-auto", JSON.stringify(auto));
                }

                delete eb.enabling[t];
                return res;
            }));
        },

        disable: function(t) {
            // Only disables auto
            if (typeof localStorage === "undefined")
                return;
            var auto = localStorage.getItem("eb-auto");
            if (!auto)
                return;
            auto = JSON.parse(auto);
            delete auto[t];
            if (Object.keys(auto).length === 0)
                localStorage.removeItem("eb-auto");
            else
                localStorage.setItem("eb-auto", JSON.stringify(auto));
        }
    };

    function dispatchKey(du, key) {
        var ev = new KeyboardEvent("key" + du, {
            key: key,
            bubbles: true
        });
        (document.activeElement || document.body).dispatchEvent(ev);
    }

    // Gamepad support
    eb.gamepad = {
        requiresPermissions: false,

        supported: function() {
            return !!(navigator.getGamepads || navigator.webkitGetGamepads);
        },

        enable: function(opts) {
            if (eb.enabled.gamepad) return Promise.resolve(true);
            opts = opts || {};

            if (navigator.getGamepads) {
                this._getGamepads = navigator.getGamepads.bind(navigator);
                this._queryButton = this._standardQueryButton;
            } else {
                this._getGamepads = navigator.webkitGetGamepads.bind(navigator);
                this._queryButton = this._webkitQueryButton;
            }

            if (!opts.manualPoll)
                this._interval = setInterval(this.poll.bind(this), 50);

            eb.enabled.gamepad = eb.enabled.any = true;

            return Promise.resolve(true);
        },

        state: {},

        // Gamepads are poll-based, so call this to check for events
        poll: function() {
            var pads = this._getGamepads();
            for (var pi = 0; pi < pads.length; pi++) {
                var pad = pads[pi];
                if (!pad) continue;
                if (!(pad.id in this.state))
                    this.state[pad.id] = {};
                var state = this.state[pad.id];

                // Query buttons
                for (var bi = 0; bi < pad.buttons.length; bi++) {
                    var bis = "b" + bi;
                    if (!(bis in state))
                        state[bis] = false;

                    var newState = this._queryButton(pad.buttons[bi]);
                    if (newState !== state[bis]) {
                        // Send an event
                        dispatchKey(newState?"down":"up", "eb:gamepad:" + pad.id + ":" + bis);
                        state[bis] = newState;
                    }
                }

                // And axes
                for (var ai = 0; ai < pad.axes.length; ai++) {
                    var ais = "a" + ai;
                    if (!(ais in state))
                        state[ais] = 0;

                    var newState = ~~Math.round(pad.axes[ai]);
                    if (newState !== state[ais]) {
                        // Two phases in case we jumped all the way
                        var key = "eb:gamepad:" + pad.id + ":" + ais;
                        if (state[ais]) {
                            var ukey = key + (state[ais]>0?"+":"-");
                            dispatchKey("up", ukey);
                        }
                        if (newState) {
                            var dkey = key + (newState>0?"+":"-");
                            dispatchKey("down", dkey);
                        }
                        state[ais] = newState;
                    }
                }
            }
        },

        // Query a button using the standard interface
        _standardQueryButton: function(b) {
            return (b.value > 0 || b.pressed);
        },

        // Query a button using the old interface
        _webkitQueryButtons: function(b) {
            return b > 0;
        }
    };

    // MIDI input
    eb.midi = {
        requiresPermissions: true,

        supported: function() {
            return !!(navigator.requestMIDIAccess);
        },

        state: {},

        enable: function(opts) {
            if (eb.enabled.midi) return Promise.resolve(true);
            var self = this;

            return navigator.requestMIDIAccess().then(function(access) {
                // Add all the inputs
                access.inputs.forEach(function(port, key) {
                    var state = self.state[key] = {};

                    port.addEventListener("midimessage", function(ev) {
                        if (ev.data.length < 3) return;
                        var oev = null;

                        // Check for recognized messages
                        var t = ev.data[0] & 0xF0;
                        if (t === 0x90 /* Note on */)
                            oev = ev.data[2] ? "down" : "up";
                        else if (t === 0x80 /* Note off */)
                            oev = "up";

                        // Handle the state
                        if (!oev) return;
                        var note = (ev.data[0]&0xF) /* Channel */ + ":" + ev.data[1];
                        if (!(note in state))
                            state[note] = "up";
                        if (oev === state[note]) return;

                        // Convert it into an event
                        dispatchKey(oev, "eb:midi:" + key + ":" + note);
                        state[note] = oev;
                    });
                });

                return true;

            }).catch(function() {
                return false;

            });
        }

    };

    // Set up support information
    ["gamepad", "midi"].forEach(function(t) {
        if (eb.supported[t] = eb[t].supported())
            eb.supported.any = true;
        eb.requiresPermissions[t] = eb[t].requiresPermission;
    });

    // And autoload
    if (typeof localStorage !== "undefined") {
        var auto = localStorage.getItem("eb-auto");
        if (!auto) auto = "{}";
        auto = JSON.parse(auto);
        Object.keys(auto).sort().forEach(function(t) {
            if (auto[t])
                eb.enable(t, auto[t]);
        });
    }

    return eb;
})();
