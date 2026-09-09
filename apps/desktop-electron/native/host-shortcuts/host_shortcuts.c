/*
 * Swallow macOS screenshot chords (⌘⇧3/4/5/6) only for the key events that
 * happen while Atmos is frontmost. Returning NULL from a consuming CGEventTap
 * discards that event so Screenshot.app never sees it. System screenshot
 * hotkeys stay enabled — we do not toggle WindowServer symbolic hotkeys.
 *
 * A consuming tap needs Accessibility on this process. Do not prompt for it
 * here. Start without AX and keep an observer so JS can show the drag-to-list
 * overlay on first screenshot steal.
 * JS polls atmos_host_shortcuts_take_digit() and take_ax_nudge().
 */
#include <ApplicationServices/ApplicationServices.h>
#include <CoreFoundation/CoreFoundation.h>
#include <dlfcn.h>
#include <objc/message.h>
#include <objc/runtime.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#if defined(__APPLE__)
#include <pthread/qos.h>
#endif

enum {
  VK_ANSI_3 = 0x14,
  VK_ANSI_4 = 0x15,
  VK_ANSI_5 = 0x17,
  VK_ANSI_6 = 0x16,
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

static bool bundle_id_is_atmos(const char *bid) {
  if (!bid) return false;
  return strcmp(bid, "com.atmos.desktop") == 0 ||
         strcmp(bid, "com.atmos.desktop.dev") == 0;
}

static bool bundle_id_is_screenshot(const char *bid) {
  if (!bid) return false;
  return strcmp(bid, "com.apple.screencaptureui") == 0 ||
         strcmp(bid, "com.apple.Screenshot") == 0 ||
         strcmp(bid, "com.apple.screenshot.launcher") == 0 ||
         strcmp(bid, "com.apple.ScreenCaptureUI") == 0;
}

static bool name_is_screenshot(const char *n) {
  if (!n || !n[0]) return false;
  return strcasecmp(n, "screencaptureui") == 0 ||
         strcasecmp(n, "Screenshot") == 0 ||
         strcasecmp(n, "ScreenCaptureUI") == 0 ||
         strcmp(n, "截屏") == 0 ||
         strcmp(n, "屏幕截图") == 0;
}

static const char *nsstring_utf8(id nsstr) {
  if (!nsstr) return NULL;
  return ((const char *(*)(id, SEL))objc_msgSend)(
      nsstr, sel_registerName("UTF8String"));
}

/* ⌘⇧4 keeps Atmos frontmost and only launches screencaptureui. */
static bool screenshot_process_running(void) {
  Class wsClass = objc_getClass("NSWorkspace");
  if (!wsClass) return false;
  id ws = ((id(*)(Class, SEL))objc_msgSend)(
      wsClass, sel_registerName("sharedWorkspace"));
  if (!ws) return false;
  id apps = ((id(*)(id, SEL))objc_msgSend)(
      ws, sel_registerName("runningApplications"));
  if (!apps) return false;
  unsigned long n = ((unsigned long (*)(id, SEL))objc_msgSend)(
      apps, sel_registerName("count"));
  for (unsigned long i = 0; i < n; i++) {
    id app = ((id(*)(id, SEL, unsigned long))objc_msgSend)(
        apps, sel_registerName("objectAtIndex:"), i);
    if (!app) continue;
    id bid = ((id(*)(id, SEL))objc_msgSend)(
        app, sel_registerName("bundleIdentifier"));
    if (bundle_id_is_screenshot(nsstring_utf8(bid))) return true;
    id loc = ((id(*)(id, SEL))objc_msgSend)(
        app, sel_registerName("localizedName"));
    if (name_is_screenshot(nsstring_utf8(loc))) return true;
    id url = ((id(*)(id, SEL))objc_msgSend)(
        app, sel_registerName("executableURL"));
    if (url) {
      id last = ((id(*)(id, SEL))objc_msgSend)(
          url, sel_registerName("lastPathComponent"));
      if (name_is_screenshot(nsstring_utf8(last))) return true;
    }
  }
  return false;
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

/* Fail open: empty string if we cannot read the frontmost app. */
static bool copy_frontmost_bundle_id(char *out, size_t out_len) {
  if (!out || out_len == 0) return false;
  out[0] = '\0';
  Class wsClass = objc_getClass("NSWorkspace");
  if (!wsClass) return false;
  id ws = ((id(*)(Class, SEL))objc_msgSend)(
      wsClass, sel_registerName("sharedWorkspace"));
  if (!ws) return false;
  id app = ((id(*)(id, SEL))objc_msgSend)(
      ws, sel_registerName("frontmostApplication"));
  if (!app) return false;
  id bid = ((id(*)(id, SEL))objc_msgSend)(
      app, sel_registerName("bundleIdentifier"));
  if (!bid) return false;
  const char *c = ((const char *(*)(id, SEL))objc_msgSend)(
      bid, sel_registerName("UTF8String"));
  if (!c) return false;
  strncpy(out, c, out_len - 1);
  out[out_len - 1] = '\0';
  return true;
}

static bool frontmost_is_atmos(void) {
  char bid[256];
  if (!copy_frontmost_bundle_id(bid, sizeof(bid))) return false;
  return bundle_id_is_atmos(bid);
}

static void poll_screenshot_steal(void) {
  bool atmos = frontmost_is_atmos();
  if (g_tap || AXIsProcessTrusted()) {
    g_prev_atmos_frontmost = atmos;
    g_prev_shot_present = screenshot_ui_present();
    return;
  }
  bool shot = screenshot_ui_present();
  if (shot && !g_prev_shot_present && (atmos || g_prev_atmos_frontmost)) {
    atomic_store(&g_pending_ax_nudge, 1);
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

  if (!install_tap()) {
    atomic_store(&g_status, 4);
  }

  while (atomic_load(&g_running)) {
    if (!g_tap) {
      (void)install_tap();
    }
    if (g_tap && !CGEventTapIsEnabled(g_tap)) {
      CGEventTapEnable(g_tap, true);
    }
    poll_screenshot_steal();
    CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.1, true);
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
