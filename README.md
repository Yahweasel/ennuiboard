Ennuiboard converts Gamepad and MIDI events into keyboard events in the
browser. It is most useful for web applications with customizable hotkeys, in
particular because both gamepad and MIDI input are global, unlike keyboard
input which will only generate events when the browser window is activated.


## Using Ennuiboard

Load the library (e.g.
`https://unpkg.com/ennuiboard@^1.0.0/ennuiboard.min.js`), then use the
`Ennuiboard` object. `Ennuiboard.supported` maps input types to a boolean
indicating whether the browser supports that type of input. No inputs are
enabled by default; you must use `Ennuiboard.enable` to enable one. For
instance, `Ennuiboard.enable("gamepad")`. `Ennuiboard.enable` has an optional
second argument, an object with additional options. In particular, if the
`auto` option is set to `true`, then the next time the library is loaded on the
same site, that type of input will automatically be configured.
`Ennuiboard.enable` returns a `Promise` which resolves to `true` or `false`,
indicating whether the type of input was successfully enabled. If an input type
has been set to automatically load, you can use `Ennuiboard.disable`, e.g.
`Ennuiboard.disable("gamepad")`, to disable automatic loading.

The supported devices are `gamepad` and `midi`.

You can use `Ennuiboard.enabled` to check whether an input type is already
enabled, and `Ennuiboard.enabling` to check if it's in the process of enabling
but has not yet been enabled (e.g., a prompt has shown to the user but the user
has not yet responded).

You can use `Ennuiboard.requiresPermissions`, e.g.
`Ennuiboard.requiresPermissions.gamepad`, to determine if a given input type
requires explicit user permission, and so some kind of user interaction.

Once successfully enabled, a device will send normal `keydown` and `keyup`
events, like the keyboard. Use the `event.key` field to determine which "key"
was pressed.


## Gamepads

Gamepads send keys in the form `eb:gamepad:<gid>:<iid>`, where `<gid>` is the
ID of the gamepad, and `<iid>` is the ID of the particular input. The input
ID's are in the form `b<num>` for buttons, and `a<num>+` or `a<num>-` for
positive or negative axis inputs.

The web Gamepad API requires polling. If enabled normally, the gamepad will be
polled automatically on a 50ms interval. Alternatively, you may set the
`manualPoll` option to `true` when enabling, then call
`Ennuiboard.gamepad.poll` manually to poll gamepad input.


## MIDI

MIDI inputs send keys in the form `eb:midi:<mid>:<channel>:<note>`, where
`<mid>` is an ID for the MIDI input device, and `<channel>` and `<note>` are
the MIDI channel and note.
