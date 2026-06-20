#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-start}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

show_usage() {
  cat <<'USAGE'
usage: ./script/build_and_run.sh [mode]

Modes:
  start, run        Start the Expo dev server for the development client
  --ios, ios        Start Expo for the development client and open iOS
  --android, android
                   Start Expo for the development client and open Android
  run-ios           Build and run the iOS development client
  run-android       Build and run the Android development client
  --dev-client, dev-client
                   Start Expo in development-client mode
  --tunnel, tunnel Start Expo using tunnel transport
  --doctor, doctor Run Expo diagnostics
  --help, help     Show this help
USAGE
}

resolve_expo_cmd() {
  if [[ -n "${EXPO_CLI:-}" ]]; then
    # shellcheck disable=SC2206
    EXPO_CMD=(${EXPO_CLI})
    return
  fi

  if [[ -f ../../bun.lock ]] && command -v bun >/dev/null 2>&1; then
    EXPO_CMD=(bunx expo)
  elif command -v npx >/dev/null 2>&1; then
    EXPO_CMD=(npx expo)
  else
    echo "Could not find bunx or npx to run Expo." >&2
    exit 1
  fi
}

run_doctor() {
  if command -v bun >/dev/null 2>&1; then
    bunx expo-doctor
  else
    npx expo-doctor
  fi
}

patch_ios_pods() {
  local script
  while IFS= read -r -d '' script; do
    perl -0pi -e 's/\A#!\/bin\/sh/#!\/usr\/bin\/env bash/' "$script"
  done < <(find "$ROOT_DIR/ios/Pods/Target Support Files" -name '*-xcframeworks.sh' -print0 2>/dev/null)
}

configure_android_env() {
  if [[ -z "${ANDROID_HOME:-}" || ! -d "${ANDROID_HOME:-}/platform-tools" ]]; then
    local sdk_dir
    for sdk_dir in \
      "$HOME/Library/Android/sdk" \
      "/opt/homebrew/share/android-commandlinetools"; do
      if [[ -d "$sdk_dir/platform-tools" ]]; then
        export ANDROID_HOME="$sdk_dir"
        export ANDROID_SDK_ROOT="$sdk_dir"
        break
      fi
    done
  fi

  if [[ -n "${ANDROID_HOME:-}" ]]; then
    export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
  fi

  if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME:-}/bin/java" ]]; then
    local java_home
    for java_home in \
      "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
      "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home"; do
      if [[ -x "$java_home/bin/java" ]]; then
        export JAVA_HOME="$java_home"
        export PATH="$JAVA_HOME/bin:$PATH"
        break
      fi
    done
  fi
}

resolve_expo_cmd

case "$MODE" in
  start|run)
    exec "${EXPO_CMD[@]}" start --dev-client --scheme atmos
    ;;
  --ios|ios)
    exec "${EXPO_CMD[@]}" start --dev-client --scheme atmos --ios
    ;;
  --android|android)
    configure_android_env
    exec "${EXPO_CMD[@]}" start --dev-client --scheme atmos --android
    ;;
  run-ios)
    patch_ios_pods
    exec "${EXPO_CMD[@]}" run:ios "${@:2}"
    ;;
  run-android)
    configure_android_env
    exec "${EXPO_CMD[@]}" run:android "${@:2}"
    ;;
  --dev-client|dev-client)
    exec "${EXPO_CMD[@]}" start --dev-client --scheme atmos
    ;;
  --tunnel|tunnel)
    exec "${EXPO_CMD[@]}" start --tunnel
    ;;
  --doctor|doctor)
    run_doctor
    ;;
  --help|help)
    show_usage
    ;;
  *)
    show_usage >&2
    exit 2
    ;;
esac
