# Fixes in this zip

Drop these two files into your project at the SAME paths, overwriting what's there.
Nothing else changed — everything from prior sessions (finance engine, tests, delete
trip, edit-flow fix) is untouched.

## app.json
Added `"allowBackup": false` under `expo.android`.

**Root cause of "cleared data, reinstalled, but old data came back":** without this,
Android's OS-level Auto Backup silently backs up the app's database to the user's Google
account and restores it automatically on install — independent of "clear app data" and
independent of anything the app itself does. This is why it looked like the app was
ignoring the reset: it wasn't, Android was restoring behind the scenes.

**This requires a rebuild** (it's a native manifest setting) — clearing data alone in
the already-installed old build won't pick it up. After rebuilding: uninstall the app
completely once (not just "clear data") to also clear the already-existing Auto Backup
snapshot tied to the old build, then reinstall the new build.

## components/UI.js
Fixed `BottomSheet` (the shared component behind every form sheet — Add Expense, Edit
Expense, Edit Contribution, Edit Exchange, Rename Trip):

**Root cause of "keyboard takes over, can't type":** the sheet's card wrapper used
`<View onStartShouldSetResponder={() => true}>` to stop taps on the card's padding from
closing the sheet. That unconditionally claims the touch responder for *any* tap
starting inside the card — including on a nested `TextInput` — before the input's own
native touch handling gets a chance to claim it. On Android that meant tapping a field
never actually gave the field focus, so no keystroke ever reached it — it wasn't really
"the keyboard covering fields," it was fields never actually receiving input at all.

Replaced with `<Pressable onPress={() => {}}>`, which participates in React Native's
touch responder negotiation the same way `TouchableOpacity` already does one line above
it for the backdrop — it still stops a tap on empty card space from closing the sheet,
but without blocking a nested `TextInput` from claiming its own touch first.

This is a **pure JS change** — no rebuild required beyond a normal JS bundle update
(same as any other code change), unlike the `app.json` fix above.
