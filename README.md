# Fixes in this zip

## 1 & 2 — swipe doesn't work from Notifications/More — NotificationsScreen.js, MoreScreen.js
Root cause: the swipe gesture only existed on `HomeScreen`. `Notifications` and `More`
are separate *pushed* screens, not in-place tabs, so once you're actually on one of
them there was no swipe handler at all — a gesture on Home has no way to reach a
component that isn't even mounted. Added matching `PanResponder`s to both screens,
using the real navigation stack rather than reconstructing history by hand: forward
(right-to-left) calls `navigation.navigate('More')`; backward (left-to-right) calls
`navigation.goBack()`, which correctly returns to wherever the sequence actually was
(Trips), not a hardcoded destination.

## 3 — back from a trip lands on the wrong Home tab — TripScreen.js, HomeScreen.js
`TripScreen`'s three back-to-Home code paths (header arrow, delete-trip success,
hardware back fallback) now explicitly pass `{ homeTab: 'overview' }`. `HomeScreen`
syncs its tab from that param — but only when a screen explicitly provides it, not on
every focus, since the Notifications/More swipe-back above needs Home to stay on
whatever tab it was actually left on (usually Trips). Both behaviors needed to coexist
without fighting each other.

## 4 — back button exits the app — TripScreen.js
Confirmed real: `SplashScreen` launches straight into an active trip via
`navigation.replace('Trip', ...)`, which makes Trip the root of the stack with nothing
below it. The on-screen back arrow already had a fallback for that case; Android's
hardware/gesture back button does not go through that code at all — it's handled by
React Navigation's default behavior, which lets the press fall through to the OS
(exiting the app) when there's nothing left to pop. Added a `BackHandler` listener that
intercepts exactly that case and routes to Home instead.

## 5 — stuck on a filtered Trips view — HomeScreen.js
The currency-filter cards only existed on the Overview tab, so once you'd drilled into
a filtered Trips view there was no way to switch currencies without backing all the way
out. Replaced the single "clear filter" chip with an always-visible All/INR/USD/etc.
switcher row directly on the Trips tab — only rendered at all when there's more than
one currency in play.

## 6 — People popup not themed — HomeScreen.js
Was a native `Alert.alert`, which always renders as the OS's own dialog regardless of
app theme (exactly the mismatched gray popup in your screenshot). Replaced with the
app's existing themed `BottomSheet` component, same as every other in-app sheet.

## 7 — keyboard auto-opening on Create Trip — CreateTripScreen.js
Removed `autoFocus` from the Trip Name field.

## 8 — bottom nav icons unevenly spaced — HomeScreen.js
The center "+" FAB had no `flex: 1` while its four sibling nav items did, so it wasn't
claiming an equal-width slot in the row. Wrapped it in an equal-width flex container
without changing the visual size of the circular button itself.

## 9 — "what else would you build as a user?"
Answered directly in the chat response, not as a code change.

Full suite: 74/74 passing. Whole-repo syntax check: 28/28 files clean with a real
JSX-aware parser.
