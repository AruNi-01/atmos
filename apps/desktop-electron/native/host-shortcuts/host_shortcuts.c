/*
 * Swallow macOS screenshot chords (⌘⇧3/4/5/6) only for the key events that
 * happen while Atmos is frontmost. Returning NULL from a consuming CGEventTap
 * discards that event so Screenshot.app never sees it. System screenshot
 * hotkeys stay enabled — we do not toggle WindowServer symbolic hotkeys.
 *
 * A consuming tap needs Accessibility on this process. Do not prompt for it
 * here. Start without AX and watch up to 5 minutes for the first screenshot
 * steal so JS can show the drag-to-list overlay. After a hit, a grant, or
 * that deadline, stop scanning.
 * JS polls atmos_host_shortcuts_take_digit() and take_ax_nudge().
 *
 * This dylib is koffi-loaded into the Electron process, so it shares
 * Chromium PartitionAlloc. Stay on CoreGraphics + libproc — never AppKit.
 */
#include <ApplicationServices/ApplicationServices.h>
#include <CoreFoundation/CoreFoundation.h>
#include <CoreGraphics/CoreGraphics.h>
#include <dlfcn.h>
#include <libproc.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#if defined(__APPLE__)
#include <pthread/qos.h>
#endif

enum {
  VK_ANSI_3 = 0x14,
  VK_ANSI_4 = 0x15,
  VK_ANSI_5 = 0x17,
  VK_ANSI_6 = 0x16,
  /* First screenshot steal while untrusted: stop if nothing shows up. */
  kStealWatchSec = 5 * 60,
};

static pthread_t g_thread;
static atomic_bool g_running = false;
static atomic_bool g_thread_started = false;
static atomic_bool g_enabled = false;
static atomic_int g_pending_digit = 0;
static atomic_int g_pending_ax_nudge = 0;
static atomic_int g_status = 0; /* 0 idle, 1 starting, 2 tap ready, 3 failed, 4 observer */
static CFMachPortRef g_tap = NULL;
static CFRunLoopRef g_rl = NULL;
static CFRunLoopSourceRef g_source = NULL;
static bool g_prev_atmos_frontmost = false;
static bool g_prev_shot_present = false;
static bool g_steal_watch = false;
static time_t g_steal_deadline = 0;

static int digit_from_keycode(int64_t keycode) {
  switch (keycode) {
    case VK_ANSI_3:
      return 3;
    case VK_ANSI_4:
      return 4;
    case VK_ANSI_5:
      return 5;
    case VK_ANSI_6:
      return 6;
    default:
      return 0;
  }
}

static bool is_cmd_shift_only(CGEventFlags flags) {
  bool cmd = (flags & kCGEventFlagMaskCommand) != 0;
  bool shift = (flags & kCGEventFlagMaskShift) != 0;
  bool alt = (flags & kCGEventFlagMaskAlternate) != 0;
  bool ctrl = (flags & kCGEventFlagMaskControl) != 0;
  return cmd && shift && !alt && !ctrl;
}

/*
 * This process is Atmos (com.atmos.desktop / com.atmos.desktop.dev).
 * Do not call AppKit from this thread: LaunchServices XPC allocations
 * CHECK-fail in Chromium PartitionAlloc (EXC_BREAKPOINT / SIGTRAP).
 */
static bool name_is_screenshot(const char *n) {
  if (!n || !n[0]) return false;
  return strcasecmp(n, "screencaptureui") == 0 ||
         strcasecmp(n, "Screenshot") == 0 ||
         strcasecmp(n, "ScreenCaptureUI") == 0 ||
         strcmp(n, "截屏") == 0 ||
         strcmp(n, "屏幕截图") == 0;
}

/* ⌘⇧4 keeps Atmos frontmost and only launches screencaptureui
 * (com.apple.screencaptureui / com.apple.Screenshot /
 * com.apple.screenshot.launcher / com.apple.ScreenCaptureUI). */
static bool screenshot_process_running(void) {
  int need = proc_listpids(PROC_ALL_PIDS, 0, NULL, 0);
  if (need <= 0) return false;
  need += (int)sizeof(pid_t) * 32;
  pid_t *pids = (pid_t *)malloc((size_t)need);
  if (!pids) return false;
  int bytes = proc_listpids(PROC_ALL_PIDS, 0, pids, need);
  if (bytes <= 0) {
    free(pids);
    return false;
  }
  int count = bytes / (int)sizeof(pid_t);
  char name[64];
  bool found = false;
  for (int i = 0; i < count; i++) {
    if (pids[i] <= 0) continue;
    if (proc_name((int)pids[i], name, sizeof(name)) <= 0) continue;
    if (name_is_screenshot(name)) {
      found = true;
      break;
    }
  }
  free(pids);
  return found;
}

/* Screenshot selection UI is often a non-zero window layer overlay. */
static bool screenshot_window_on_screen(void) {
  CFArrayRef list = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID);
  if (!list) return false;
  bool found = false;
  CFIndex n = CFArrayGetCount(list);
  for (CFIndex i = 0; i < n; i++) {
    CFDictionaryRef win = CFArrayGetValueAtIndex(list, i);
    if (!win) continue;
    char buf[128];
    CFStringRef owner = CFDictionaryGetValue(win, kCGWindowOwnerName);
    if (owner &&
        CFStringGetCString(owner, buf, sizeof(buf), kCFStringEncodingUTF8) &&
        name_is_screenshot(buf)) {
      found = true;
      break;
    }
    CFStringRef title = CFDictionaryGetValue(win, kCGWindowName);
    if (title &&
        CFStringGetCString(title, buf, sizeof(buf), kCFStringEncodingUTF8) &&
        name_is_screenshot(buf)) {
      found = true;
      break;
    }
  }
  CFRelease(list);
  return found;
}

static bool screenshot_ui_present(void) {
  return screenshot_process_running() || screenshot_window_on_screen();
}

static bool window_is_usable_layer0(CFDictionaryRef win) {
  if (!win) return false;
  int layer = 0;
  CFNumberRef layerRef = CFDictionaryGetValue(win, kCGWindowLayer);
  if (layerRef) CFNumberGetValue(layerRef, kCFNumberIntType, &layer);
  if (layer != 0) return false;
  CFDictionaryRef bounds = CFDictionaryGetValue(win, kCGWindowBounds);
  if (!bounds) return true;
  CGRect r = CGRectZero;
  if (!CGRectMakeWithDictionaryRepresentation(bounds, &r)) return true;
  return r.size.width >= 2 && r.size.height >= 2;
}

static bool frontmost_is_atmos(void) {
  CFArrayRef list = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID);
  if (!list) return false;
  pid_t self = getpid();
  bool found = false;
  CFIndex n = CFArrayGetCount(list);
  for (CFIndex i = 0; i < n; i++) {
    CFDictionaryRef win = CFArrayGetValueAtIndex(list, i);
    if (!window_is_usable_layer0(win)) continue;
    int ownerPid = 0;
    CFNumberRef pidRef = CFDictionaryGetValue(win, kCGWindowOwnerPID);
    if (pidRef) CFNumberGetValue(pidRef, kCFNumberIntType, &ownerPid);
    found = ownerPid == (int)self;
    break;
  }
  CFRelease(list);
  return found;
}

static void stop_steal_watch(void) { g_steal_watch = false; }

static bool steal_watch_active(void) {
  if (!g_steal_watch) return false;
  if (g_tap || AXIsProcessTrusted()) {
    stop_steal_watch();
    return false;
  }
  if (g_steal_deadline != 0 && time(NULL) >= g_steal_deadline) {
    stop_steal_watch();
    return false;
  }
  return true;
}

static void poll_screenshot_steal(void) {
  if (!steal_watch_active()) return;
  bool atmos = frontmost_is_atmos();
  bool shot = screenshot_ui_present();
  if (shot && !g_prev_shot_present && (atmos || g_prev_atmos_frontmost)) {
    atomic_store(&g_pending_ax_nudge, 1);
    stop_steal_watch();
  }
  g_prev_atmos_frontmost = atmos;
  g_prev_shot_present = shot;
}

static CGEventRef tap_callback(CGEventTapProxy proxy, CGEventType type,
                               CGEventRef event, void *refcon) {
  (void)proxy;
  (void)refcon;
  if (type == kCGEventTapDisabledByTimeout ||
      type == kCGEventTapDisabledByUserInput) {
    if (g_tap) CGEventTapEnable(g_tap, true);
    return event;
  }
  if ((type != kCGEventKeyDown && type != kCGEventKeyUp) || !event) {
    return event;
  }
  if (!atomic_load(&g_enabled)) return event;
  if (!is_cmd_shift_only(CGEventGetFlags(event))) return event;

  int digit = digit_from_keycode(
      CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode));
  if (digit == 0) return event;
  if (!frontmost_is_atmos()) return event;

  if (type == kCGEventKeyDown &&
      !CGEventGetIntegerValueField(event, kCGKeyboardEventAutorepeat)) {
    atomic_store(&g_pending_digit, digit);
  }
  return NULL;
}

static bool install_tap(void) {
  if (g_tap) return true;
  if (!AXIsProcessTrusted()) return false;

  CGEventMask mask =
      CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventKeyUp);
  CFMachPortRef tap = CGEventTapCreate(kCGHIDEventTap, kCGHeadInsertEventTap,
                                       kCGEventTapOptionDefault, mask,
                                       tap_callback, NULL);
  if (!tap) {
    tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap,
                           kCGEventTapOptionDefault, mask, tap_callback,
                           NULL);
  }
  if (!tap) return false;

  CFRunLoopSourceRef source =
      CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
  if (!source) {
    CFRelease(tap);
    return false;
  }

  CFRunLoopRef rl = g_rl ? g_rl : CFRunLoopGetCurrent();
  CFRunLoopAddSource(rl, source, kCFRunLoopCommonModes);
  CFRunLoopAddSource(rl, source, kCFRunLoopDefaultMode);
  CGEventTapEnable(tap, true);
  g_tap = tap;
  g_source = source;
  g_rl = rl;
  atomic_store(&g_status, 2);
  return true;
}

static void teardown_tap(void) {
  if (g_tap) CGEventTapEnable(g_tap, false);
  if (g_source && g_rl) {
    CFRunLoopRemoveSource(g_rl, g_source, kCFRunLoopCommonModes);
    CFRunLoopRemoveSource(g_rl, g_source, kCFRunLoopDefaultMode);
  }
  if (g_source) {
    CFRelease(g_source);
    g_source = NULL;
  }
  if (g_tap) {
    CFRelease(g_tap);
    g_tap = NULL;
  }
}

static void *thread_main(void *arg) {
  (void)arg;
#if defined(__APPLE__)
  pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
#endif
  atomic_store(&g_status, 1);
  g_rl = CFRunLoopGetCurrent();
  g_prev_atmos_frontmost = frontmost_is_atmos();
  g_prev_shot_present = screenshot_ui_present();
  g_steal_deadline = time(NULL) + kStealWatchSec;
  g_steal_watch = true;

  if (!install_tap()) {
    atomic_store(&g_status, 4);
  } else {
    stop_steal_watch();
  }

  while (atomic_load(&g_running)) {
    if (!g_tap) {
      (void)install_tap();
      if (g_tap) stop_steal_watch();
    }
    if (g_tap && !CGEventTapIsEnabled(g_tap)) {
      CGEventTapEnable(g_tap, true);
    }
    if (steal_watch_active()) poll_screenshot_steal();
    /* Tap sources wake this immediately. 0.1s only while steal-watching. */
    CFTimeInterval wait = (g_tap || !g_steal_watch) ? 1.0 : 0.1;
    CFRunLoopRunInMode(kCFRunLoopDefaultMode, wait, true);
  }

  teardown_tap();
  g_rl = NULL;
  atomic_store(&g_status, 0);
  return NULL;
}

/* Previous builds toggled WindowServer screenshot hotkeys and could leak that
 * disable across a crash. Restore once from the sentinel, then never write it. */
static void restore_leaked_symbolic_hotkeys(void) {
  char path[512];
  const char *atmos = getenv("ATMOS_HOME");
  if (atmos && atmos[0]) {
    snprintf(path, sizeof(path), "%s/state/host-shortcuts-symhotkeys", atmos);
  } else {
    const char *home = getenv("HOME");
    if (home && home[0]) {
      snprintf(path, sizeof(path), "%s/.atmos/state/host-shortcuts-symhotkeys",
               home);
    } else {
      snprintf(path, sizeof(path), "/tmp/atmos-host-shortcuts-symhotkeys");
    }
  }
  FILE *f = fopen(path, "r");
  if (!f) return;
  void *handle =
      dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",
             RTLD_LAZY);
  typedef int (*set_fn)(int, bool);
  set_fn set = handle ? (set_fn)dlsym(handle, "CGSSetSymbolicHotKeyEnabled")
                      : NULL;
  int key = 0;
  int enabled = 0;
  while (fscanf(f, "%d %d", &key, &enabled) == 2) {
    if (set) set(key, enabled != 0);
  }
  fclose(f);
  unlink(path);
}

int atmos_host_shortcuts_start(void) {
  restore_leaked_symbolic_hotkeys();
  if (atomic_load(&g_thread_started) || atomic_load(&g_running)) {
    int st = atomic_load(&g_status);
    return (st == 2 || st == 4) ? 0 : -1;
  }
  atomic_store(&g_pending_digit, 0);
  atomic_store(&g_pending_ax_nudge, 0);
  atomic_store(&g_running, true);
  atomic_store(&g_status, 1);
  if (pthread_create(&g_thread, NULL, thread_main, NULL) != 0) {
    atomic_store(&g_running, false);
    atomic_store(&g_status, 3);
    return -2;
  }
  atomic_store(&g_thread_started, true);
  for (int i = 0; i < 50; i++) {
    int st = atomic_load(&g_status);
    if (st == 2 || st == 4) return 0;
    if (st == 3) {
      pthread_join(g_thread, NULL);
      atomic_store(&g_thread_started, false);
      return -3;
    }
    usleep(10 * 1000);
  }
  return 0;
}

void atmos_host_shortcuts_stop(void) {
  atomic_store(&g_enabled, false);
  if (!atomic_load(&g_thread_started)) {
    atomic_store(&g_status, 0);
    return;
  }
  atomic_store(&g_running, false);
  if (g_rl) CFRunLoopWakeUp(g_rl);
  pthread_join(g_thread, NULL);
  atomic_store(&g_thread_started, false);
  stop_steal_watch();
  atomic_store(&g_status, 0);
}

void atmos_host_shortcuts_set_enabled(int enabled) {
  atomic_store(&g_enabled, enabled != 0);
}

int atmos_host_shortcuts_take_digit(void) {
  return atomic_exchange(&g_pending_digit, 0);
}

int atmos_host_shortcuts_take_ax_nudge(void) {
  return atomic_exchange(&g_pending_ax_nudge, 0);
}

int atmos_host_shortcuts_status(void) {
  return atomic_load(&g_status);
}

int atmos_host_shortcuts_ax_trusted(void) {
  return AXIsProcessTrusted() ? 1 : 0;
}

int atmos_host_shortcuts_tap_ready(void) {
  return (g_tap != NULL && atomic_load(&g_status) == 2) ? 1 : 0;
}
