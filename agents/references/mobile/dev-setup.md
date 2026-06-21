# Atmos Mobile Dev Setup

This guide is written for agents setting up `apps/mobile` on a fresh machine. The app is a real Expo / React Native mobile app with `expo-dev-client`; do not treat it as a PWA and do not rely on Expo Go as the final smoke path.

## 0. What Success Looks Like

- `bun --filter @atmos/mobile typecheck` passes.
- `apps/mobile/script/build_and_run.sh --doctor` passes.
- iOS simulator can launch the native dev build and reach the Atmos onboarding screen.
- Android emulator can launch the native dev build and reach the Atmos onboarding screen.
- Expo Orbit Android check passes if Orbit is installed:

```bash
/Applications/Expo\ Orbit.app/Contents/Resources/orbit-cli-arm64 check-tools -p android
```

Expected:

```text
{ android: { success: true } }
```

## 1. Required Tools

### All Platforms

Install Homebrew, Git, and Bun first. Then from the repository root:

```bash
bun install
bun --filter @atmos/mobile typecheck
```

Useful diagnostics:

```bash
cd apps/mobile
bunx expo-doctor
```

### iOS

iOS development requires macOS and Xcode.

```bash
xcode-select -p
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -downloadPlatform iOS
```

Install CocoaPods:

```bash
brew install cocoapods
pod --version
```

Check available simulators:

```bash
xcrun simctl list devices available
```

### Android

Install Android command line tools, platform tools, Expo Orbit, CocoaPods, and JDK 17:

```bash
brew install openjdk@17 cocoapods
brew install --cask android-commandlinetools android-platform-tools expo-orbit
```

Use JDK 17 for Android builds. Add this block to `~/.zshrc`:

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="/opt/homebrew/opt/openjdk@17/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:/opt/homebrew/bin:$PATH"
```

For GUI apps such as Expo Orbit, also set the launch environment:

```bash
launchctl setenv JAVA_HOME /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
launchctl setenv ANDROID_HOME /opt/homebrew/share/android-commandlinetools
launchctl setenv ANDROID_SDK_ROOT /opt/homebrew/share/android-commandlinetools
launchctl setenv PATH "/opt/homebrew/opt/openjdk@17/bin:/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin:/opt/homebrew/share/android-commandlinetools/emulator:/opt/homebrew/share/android-commandlinetools/platform-tools:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
```

Install the Android SDK packages used by the project:

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="/opt/homebrew/opt/openjdk@17/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:/opt/homebrew/bin:$PATH"

yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses
sdkmanager --sdk_root="$ANDROID_HOME" \
  "platform-tools" \
  "emulator" \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "build-tools;35.0.0" \
  "system-images;android-36;google_apis;arm64-v8a" \
  "ndk;27.1.12297006" \
  "cmake;3.22.1"
```

Expo Orbit sometimes spawns binaries by name instead of resolving them from `ANDROID_HOME`. Put the key Android tools on the Homebrew PATH:

```bash
ln -sf "$ANDROID_HOME/emulator/emulator" /opt/homebrew/bin/emulator
ln -sf "$ANDROID_HOME/build-tools/36.0.0/aapt" /opt/homebrew/bin/aapt
ln -sf "$ANDROID_HOME/build-tools/36.0.0/aapt2" /opt/homebrew/bin/aapt2
```

Restart Expo Orbit after changing `launchctl` environment:

```bash
osascript -e 'quit app "Expo Orbit"' || true
open -a "Expo Orbit"
```

## 2. Create And Boot An Android Emulator

Create a standard project emulator:

```bash
avdmanager create avd \
  -n Atmos_Mobile_API_36 \
  -k "system-images;android-36;google_apis;arm64-v8a" \
  -d pixel_8
```

Boot it through Orbit CLI:

```bash
/Applications/Expo\ Orbit.app/Contents/Resources/orbit-cli-arm64 boot-device \
  -p android \
  --id Atmos_Mobile_API_36 \
  --no-audio
```

Verify:

```bash
adb devices
adb shell getprop sys.boot_completed
/Applications/Expo\ Orbit.app/Contents/Resources/orbit-cli-arm64 list-devices -p android
```

Expected `sys.boot_completed` value:

```text
1
```

## 3. Run iOS Dev Build

From `apps/mobile`:

```bash
EXPO_NO_TELEMETRY=1 bunx expo run:ios --device "iPhone 17" --port 8091
```

If the simulator is already booted and the app is installed, start Metro for the dev client:

```bash
EXPO_NO_TELEMETRY=1 bunx expo start --dev-client --port 8091
```

Smoke screenshot:

```bash
xcrun simctl io booted screenshot /tmp/atmos-mobile-ios.png
```

The expected screen is Atmos onboarding or the workspace list. A red screen means the dev build is not healthy.

## 4. Run Android Dev Build

Boot the emulator first, then from `apps/mobile`:

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="/opt/homebrew/opt/openjdk@17/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:/opt/homebrew/bin:$PATH"

EXPO_NO_TELEMETRY=1 bunx expo run:android -d Atmos_Mobile_API_36 --port 8092
```

If Gradle successfully builds the APK but the emulator disconnects before install, do not rebuild. Reboot the emulator and reuse the built APK:

```bash
EXPO_NO_TELEMETRY=1 bunx expo run:android \
  -d Atmos_Mobile_API_36 \
  --binary ./android/app/build/outputs/apk/debug/app-debug.apk \
  --port 8092
```

If the Expo dev launcher opens to a server list, tap the `Atmos` development server row. The app should then enter Atmos onboarding or the workspace list.

Smoke screenshot:

```bash
adb exec-out screencap -p > /tmp/atmos-mobile-android.png
```

## 5. Daily Dev Commands

Run static checks:

```bash
bun --filter @atmos/mobile typecheck
cd apps/mobile && bunx expo-doctor
```

Start Metro for an already installed dev build:

```bash
cd apps/mobile
bunx expo start --dev-client --port 8091
```

Run native builds:

```bash
cd apps/mobile
bunx expo run:ios --device "iPhone 17" --port 8091
bunx expo run:android -d Atmos_Mobile_API_36 --port 8092
```

Stop Gradle daemons after Android builds:

```bash
cd apps/mobile/android
./gradlew --stop
```

## 6. Troubleshooting

### Orbit says `adb command not found`

Check that `adb` exists:

```bash
adb version
which adb
```

If the shell works but Orbit still fails, Orbit was likely started with stale GUI environment. Re-run the `launchctl setenv` commands above and restart Orbit.

### Orbit says `spawn emulator ENOENT`

Expose `emulator` on the Homebrew PATH and restart Orbit:

```bash
ln -sf "$ANDROID_HOME/emulator/emulator" /opt/homebrew/bin/emulator
osascript -e 'quit app "Expo Orbit"' || true
open -a "Expo Orbit"
```

### Orbit says `spawn aapt ENOENT`

Install build tools and expose `aapt` / `aapt2`:

```bash
sdkmanager --sdk_root="$ANDROID_HOME" "build-tools;36.0.0"
ln -sf "$ANDROID_HOME/build-tools/36.0.0/aapt" /opt/homebrew/bin/aapt
ln -sf "$ANDROID_HOME/build-tools/36.0.0/aapt2" /opt/homebrew/bin/aapt2
```

### Android Gradle fails with `JvmVendorSpec IBM_SEMERU`

The build is using a newer JDK and Gradle is trying to resolve a JDK 17 toolchain through an incompatible foojay resolver path. Use Homebrew `openjdk@17`, then stop Gradle and retry:

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
cd apps/mobile/android
./gradlew --stop
cd ..
bunx expo run:android -d Atmos_Mobile_API_36 --port 8092
```

### Android build succeeds but install fails with `device not found`

The emulator disconnected during the long first build. Reboot the emulator and install the already built APK:

```bash
/Applications/Expo\ Orbit.app/Contents/Resources/orbit-cli-arm64 boot-device -p android --id Atmos_Mobile_API_36 --no-audio
adb devices
cd apps/mobile
bunx expo run:android -d Atmos_Mobile_API_36 --binary ./android/app/build/outputs/apk/debug/app-debug.apk --port 8092
```

### iOS red screen says `No script URL provided`

This app needs `expo-dev-client`; do not rely on Expo Go for the final smoke. Rebuild the native dev client:

```bash
cd apps/mobile
bunx expo install expo-dev-client
bunx expo run:ios --device "iPhone 17" --port 8091
```

### Android red screen mentions `ExpoUI_BasicTextFieldView`

This can happen in Expo Go or with stale native builds. The app has an Android fallback for text input, but the final smoke must be a real dev build:

```bash
cd apps/mobile
bunx expo run:android -d Atmos_Mobile_API_36 --port 8092
```

### App says it cannot connect to the server

Metro is probably stopped or the dev client is pointing at the wrong port. Restart Metro using the same port printed by the dev build command:

```bash
cd apps/mobile
bunx expo start --dev-client --port 8091
```

For Android, use the Android build port if different:

```bash
bunx expo start --dev-client --port 8092
```

## 7. Notes For Agents

- Keep this as a native mobile workflow. Do not replace it with PWA or hosted web setup.
- Prefer `expo run:ios` / `expo run:android` for smoke checks because this app uses native modules and `expo-dev-client`.
- `apps/mobile/ios` and `apps/mobile/android` are generated native folders and are ignored by `apps/mobile/.gitignore` in the managed Expo workflow.
- Do not paste Access Tokens, `client_token`, register tokens, or Relay secrets into logs or docs.
- If an Android build fails, fix the local SDK/JDK environment before changing app code.
- Before reporting success, include the exact typecheck, doctor, iOS smoke, and Android smoke commands that passed.
