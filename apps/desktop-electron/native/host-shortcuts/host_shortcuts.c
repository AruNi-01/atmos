/*
 * Swallow macOS screenshot chords (⌘⇧3/4/5/6) only for the key events that
 * happen while Atmos is frontmost. Returning NULL from a consuming CGEventTap
 * discards that event so Screenshot.app never sees it. System screenshot
 * hotkeys stay enabled — we do not toggle WindowServer symbolic hotkeys.
 *
 * Needs Accessibility on this process. Desktop Use inject is the usual path
 * (Atmos Electron often has no AX). JS polls atmos_host_shortcuts_take_digit().
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
static atomic_int g_status = 0; /* 0 idle, 1 starting, 2 ready, 3 failed */
static CFMachPortRef g_tap = NULL;
static CFRunLoopRef g_rl = NULL;
static CFRunLoopSourceRef g_source = NULL;

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

/* Fail open: if we cannot read the frontmost app, do not swallow. */
static bool frontmost_is_atmos(void) {
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
  return bundle_id_is_atmos(c);
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

static void *thread_main(void *arg) {
  (void)arg;
#if defined(__APPLE__)
  pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
#endif
  atomic_store(&g_status, 1);

  CGEventMask mask =
      CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventKeyUp);
  g_tap = CGEventTapCreate(kCGHIDEventTap, kCGHeadInsertEventTap,
                           kCGEventTapOptionDefault, mask, tap_callback, NULL);
  if (!g_tap) {
    g_tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap,
                             kCGEventTapOptionDefault, mask, tap_callback,
                             NULL);
  }
  if (!g_tap) {
    atomic_store(&g_status, 3);
    atomic_store(&g_running, false);
    return NULL;
  }

  g_source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, g_tap, 0);
  if (!g_source) {
    CFRelease(g_tap);
    g_tap = NULL;
    atomic_store(&g_status, 3);
    atomic_store(&g_running, false);
    return NULL;
  }

  g_rl = CFRunLoopGetCurrent();
  CFRunLoopAddSource(g_rl, g_source, kCFRunLoopCommonModes);
  CFRunLoopAddSource(g_rl, g_source, kCFRunLoopDefaultMode);
  CGEventTapEnable(g_tap, true);
  atomic_store(&g_status, 2);

  while (atomic_load(&g_running)) {
    if (g_tap && !CGEventTapIsEnabled(g_tap)) {
      CGEventTapEnable(g_tap, true);
    }
    CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.1, true);
  }

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
    return atomic_load(&g_status) == 2 ? 0 : -1;
  }
  if (!AXIsProcessTrusted()) {
    atomic_store(&g_status, 3);
    return -3;
  }
  atomic_store(&g_pending_digit, 0);
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
    if (st == 2) return 0;
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

int atmos_host_shortcuts_status(void) {
  return atomic_load(&g_status);
}

int atmos_host_shortcuts_ax_trusted(void) {
  return AXIsProcessTrusted() ? 1 : 0;
}

int atmos_host_shortcuts_tap_ready(void) {
  return (g_tap != NULL && atomic_load(&g_status) == 2) ? 1 : 0;
}
