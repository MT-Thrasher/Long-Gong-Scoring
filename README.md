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
- After each completed string, next-string order is sorted by that completed string's score, descending. Ties use the shooter who achieved the higher string score earlier.
- Final raw score is the total of all 5 strings.
- Match points = (shooter raw score / highest raw score) x 100, so the top shooter receives 100 points.
- 3-minute shooter timer with Start/Stop control for each string.
- Timer automatically resets to 3:00 when a shooter completes a string.
- Elapsed string time is recorded at every scored HIT or MISS. The completed string also stores its final elapsed time; a timeout records 3:00 for that string. Undo Last Shot does not alter the timer.
- CSV export includes shot-by-shot HIT/MISS data, elapsed time at every shot, each string's total time, total time across all five strings, final raw score, rank, and match points. Match-total time is not capped at 3:00.
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
