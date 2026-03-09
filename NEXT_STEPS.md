# Next Steps

## Camera and controls

- Keep tuning the on-foot camera follow so it feels stable during diagonal movement and quick stop-start changes.

## Vehicle handling

- Rework player car steering so low-speed turning is sharper and high-speed turning is less floaty.
- Replace the current circle-based vehicle collision with oriented bounds, because angled car contact still feels too loose.
- Add a lightweight recovery rule when the player car gets stuck against world edges or parked cars.

## Game feel

- Add a short hit reaction and screen feedback when police or traffic damage the player.
- Make HUD text configurable and clean up the remaining mixed encoding in older content like `README.md`.
- Add one smoke test for the main update loop so camera/input regressions are caught earlier than manual playtesting.
