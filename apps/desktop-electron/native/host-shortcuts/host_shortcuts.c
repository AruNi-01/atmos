/*
 * Swallow macOS-reserved chords (⌘⇧3/4/5/6 screenshots) while Atmos is active,
 * then surface the digit to JS so product shortcuts can run instead.
 *
 * CGEventTap must NOT be listen-only — returning NULL consumes the event
 * before Screenshot.app's hotkey. Dedicated CFRunLoop thread; JS polls
 * atmos_host_shortcuts_take_digit() (no koffi callbacks from the CF thread).
 */
#include <ApplicationServices/ApplicationServices.h>
#include <CoreFoundation/CoreFoundation.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <unistd.h>

#if defined(__APPLE__)
#include <pthread/qos.h>
#endif

/* HIToolbox ANSI digit keycodes. */
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
static atomic_int g_pending_digit = 0; /* 0 empty, else 3-6 */
static atomic_int g_status = 0;        /* 0 idle, 1 starting, 2 ready, 3 failed */
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

static CGEventRef tap_callback(CGEventTapProxy proxy, CGEventType type,
                               CGEventRef event, void *refcon) {
  (void)proxy;
  (void)refcon;
  if (type == kCGEventTapDisabledByTimeout ||
      type == kCGEventTapDisabledByUserInput) {
    if (g_tap) CGEventTapEnable(g_tap, true);
    return event;
  }
  if (type != kCGEventKeyDown || !event) return event;
  if (!atomic_load(&g_enabled)) return event;
  if (!is_cmd_shift_only(CGEventGetFlags(event))) return event;

  int digit = digit_from_keycode(
      CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode));
  if (digit == 0) return event;

  atomic_store(&g_pending_digit, digit);
  return NULL;
}

static void *thread_main(void *arg) {
  (void)arg;
#if defined(__APPLE__)
  pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
#endif
  atomic_store(&g_status, 1);

  CGEventMask mask = CGEventMaskBit(kCGEventKeyDown);
  /* Default options (not listen-only) so returning NULL can consume the chord. */
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

int atmos_host_shortcuts_start(void) {
  if (atomic_load(&g_thread_started) || atomic_load(&g_running)) {
    return atomic_load(&g_status) == 2 ? 0 : -1;
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
      atomic_store(&g_thread_started, false);
      return -3;
    }
    usleep(10 * 1000);
  }
  return 0;
}

void atmos_host_shortcuts_stop(void) {
  if (!atomic_load(&g_thread_started)) return;
  atomic_store(&g_enabled, false);
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
