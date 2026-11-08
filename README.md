# Long Gong Scoring — Expo / React Native

Native Expo conversion of the Long Gong shooting match scorer.

## Rules implemented

- 5 strings per shooter.
- 10 shots per string.
- Targets: 8 in = 1 point, 6 in = 2 points, 4 in = 3 points.
- Every string starts on the 8 in target.
- Impact on the current smallest available target unlocks the next smaller target, down to 4 in.
- Miss makes the next larger target the smallest available target:
  - miss 4 in -> 6 in becomes smallest available
  - miss 6 in -> 8 in becomes smallest available
  - miss 8 in -> 8 in remains the only available target
- Undo Last Shot restores the complete pre-shot state, including target eligibility, score, and shooter/string transitions.
- Round 1 shoot order is randomized. Rounds 2-5 are sorted from lowest to highest score from the immediately preceding round; ties retain stable roster order.
- Final raw score is the total of all 5 strings.
- Series Points = (shooter Total Match Points / highest Total Match Points) x 100, so the top shooter receives 100 Series Points after the match is complete.
- 3-minute shooter timer starts automatically on the first scored shot; after start it can only be paused/resumed for range or equipment issues.
- Timer automatically resets to 3:00 when a shooter completes a string.
- Elapsed string time is recorded at every scored HIT or MISS. The completed string also stores its final elapsed time; a timeout records 3:00 for that string. Undo Last Shot does not alter the timer.
- CSV export includes shot-by-shot HIT/MISS data, elapsed time at every shot, each string's total time, total time across all five strings, Total Match Points, rank, and Series Points. Match-total time is not capped at 3:00.
- Match state is persisted locally with AsyncStorage.

## Requirements

- Node.js 22.13.x or newer compatible with Expo SDK 57.
- npm.
- Expo account for EAS cloud builds.
- Apple Developer account for App Store/TestFlight publishing.

## Windows setup

```powershell
cd long-gong-expo
npm install
npx expo-doctor
npx expo start
```

For an Android phone/tablet you can use Expo Go for quick testing. For iOS, Expo Go can also test the JavaScript app; App Store builds are produced in the EAS cloud.

## EAS setup

Install EAS CLI:

```powershell
npm install -g eas-cli
eas login
```

Link/configure the project:

```powershell
eas build:configure
```

If EAS asks to create or link an Expo project, accept the prompt. It may add an `extra.eas.projectId` value to `app.json`.

## Build iOS from Windows

```powershell
eas build --platform ios --profile production
```

EAS builds iOS on Expo's hosted macOS machines. Follow the prompts for Apple signing credentials.

## Submit to TestFlight / App Store Connect

After the build succeeds:

```powershell
eas submit --platform ios --profile production
```

You can then manage the build in App Store Connect/TestFlight from a web browser.

## Bundle identifier

Current iOS bundle ID:

`com.thrasher.longgongscoring`

If that identifier is already taken in your Apple Developer account or you want a different publisher namespace, change both:

- `expo.ios.bundleIdentifier`
- `expo.android.package`

in `app.json` before the first store build.

## CSV export

After all shooters complete all five strings, tap **Export Results CSV**. On iOS/iPadOS this opens the native share sheet so the CSV can be saved to Files, AirDropped, emailed, etc.

### Automatic timer start

The 3:00 shooter timer starts automatically when the first shot of each string is scored. The first shot may be either a HIT or MISS. The timer may still be stopped/resumed manually after it starts. Undo Last Shot does not rewind, restart, or otherwise change the timer.

### Shot-by-shot time recording

Every scored shot stores the elapsed time in that shot string at the moment HIT or MISS is entered. The first scored shot auto-starts the timer and is normally recorded at 0:00. If the 3:00 timer expires, later scored shots in that string record 3:00. The final match summary totals the time used for all five strings and can therefore exceed 180 seconds.


## Expo SDK 57 compatibility update (v1.3.1)

This revision aligns the project with the current Expo SDK 57 dependency checks:

- Expo `~57.0.9` or newer SDK 57 patch
- React Native `0.86.3` (Hermes regression fix)
- react-native-view-shot `5.1.0`
- expo-splash-screen `~57.0.10`
- Splash configuration moved from the legacy `expo.splash` field to the `expo-splash-screen` config plugin

After replacing an older project folder, remove any old dependency install and reinstall:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
npx expo install --fix
npx expo-doctor
```


## Version 1.4.0 match-operation updates

- Round 1 shooting order is randomized when the match starts.
- Before each round, a shoot-order screen appears for the scorer to announce the order.
- Rounds 2-5 are ordered from the lowest score to the highest score from the immediately preceding round.
- The current round order can be reopened from the scoring screen.
- Reshoot String is available after Shot 1 and before Shot 10. A confirmation prompt identifies the shooter and string. Confirming clears the active string score/shots and resets its timer to 3:00.
- The timer has no manual Start control. It starts automatically on the first scored IMPACT or MISS.
- Once started, the timer control is Pause Timer / Resume Timer for equipment or range interruptions.
- Undo Last Shot still does not affect the timer.

## v1.5.0 Scoreboard Mode

A dedicated full-screen Scoreboard Mode is available after the match starts. It is designed for landscape display, screen mirroring, HDMI, AirPlay, or casting.

The scoreboard shows:
- Club name, match name, match date, and current round.
- Current shooter and live countdown timer.
- A five-round by ten-shot score grid modeled after the match score sheet.
- Each scored shot as its point value (0 for miss, 1/2/3 for impact according to target).
- Live Round Total and Running Total columns.
- Final Score in the Round 5 running-total cell.
- Top 5 live standings based on accumulated match points, including the active shooter's in-progress score.
- Series Points only after the match is complete.

Version 1.6.0 adds the local-network transport layer described below, so the same scoreboard can now be viewed independently in a browser on another device.

## v1.6.0 Local Wi-Fi Scoreboard

Version 1.6.0 adds a read-only live scoreboard that can be opened in a normal browser on a TV, tablet, phone, or computer connected to the same local Wi-Fi network as the scoring device.

### How it works

1. Start the match on the scoring device.
2. Tap **Local Wi-Fi Scoreboard** (or **Start Wi-Fi Scoreboard** from the scoring screen).
3. The scoring device starts a local HTTP server, normally beginning on port 8080.
4. A viewer address and QR code are displayed.
5. Connect the TV/viewer device to the same Wi-Fi network and open the address, or scan the QR code.
6. The browser scoreboard refreshes automatically and is read-only.

The local scoreboard displays:

- Club name, match name, match date, and current round.
- Current shooter and live timer.
- Five-round by ten-shot shooter score grid.
- Round Total and Running Total.
- Top 5 live standings.
- Series Points only after the complete match is finished.

The browser automatically retries when Wi-Fi is interrupted. Viewer devices send a lightweight heartbeat so the scoring app can show the number of connected displays.

### No internet is required

The scoring device and viewer device only need to be on the same Wi-Fi LAN. A small travel router can be used at a range with no internet service; the router does not need an internet connection.

### Important: Expo Go limitation

The local HTTP server uses native iOS/Android code (`react-native-local-server`). It **does not run inside Expo Go**. The rest of the scoring UI may still be tested in Expo Go, but the Local Wi-Fi Scoreboard must be tested with an EAS development/preview/production build.

For an internal EAS build:

```powershell
eas build --platform android --profile preview
```

or for iOS/TestFlight production:

```powershell
eas build --platform ios --profile production
```

On iOS, the first time Local Wi-Fi Scoreboard is started, iOS may ask for Local Network permission. Choose **Allow** so other devices on the same Wi-Fi network can reach the scoreboard.

### Added native dependencies

- `react-native-local-server` 0.1.0 — local HTTP file server and Wi-Fi IP detection.
- `react-native-qrcode-svg` 6.3.21 — viewer-address QR code.
- `react-native-svg` 15.15.4 — Expo SDK 57-compatible SVG support.

After replacing an older project, perform a clean dependency install:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
npx expo install --fix
npx expo-doctor
```


## v1.6.1 iOS export/email fix

Final and detailed match results now have separate **Share / Save** and **Email** actions. On iOS, Email uses the native mail composer and attaches the generated files directly instead of passing a local file URI through a browser. Final Scores email attaches both the CSV and PNG in one message when the PNG is available.

After updating, run `npx expo install expo-mail-composer` (or `npx expo install --fix`) before rebuilding the native app. A new iOS/Android build is required because this update adds a native Expo module.


## v1.6.2 Reporting Changes

- Main **Export Results Score Sheets** creates an electronic score-sheet CSV for every shooter.
- Each shooter block contains Rounds 1-5, Shot 1-10 point values, Round Total, Running Total, String Time, and Final Score.
- The detailed diagnostic export was moved to the **Support** tab and renamed **Export Match Log File for Support**.
- The support log retains shot target, HIT/MISS, per-shot time, string time, totals, and Series Points for troubleshooting.
#   L o n g - G o n g - S c o r i n g  
 