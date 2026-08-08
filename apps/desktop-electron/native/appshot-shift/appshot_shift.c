/*
 * In-process dual-shift detector (Left 0x38 + Right 0x3C).
 * Runs CGEventTap on a dedicated thread + CFRunLoop — same model as Tauri.
 * JS polls atmos_appshot_shift_take_chord() (no koffi callbacks from CF thread).
 */
#include <ApplicationServices/ApplicationServices.h>
#include <CoreFoundation/CoreFoundation.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

/* Raise QoS so the tap thread is less likely to freeze under App Nap. */
#if defined(__APPLE__)
#include <pthread/qos.h>
#endif

enum { VK_LEFT_SHIFT = 0x38, VK_RIGHT_SHIFT = 0x3C };

typedef enum { SIDE_NONE = 0, SIDE_LEFT = 1, SIDE_RIGHT = 2 } ShiftSide;

typedef struct {
  bool shift_active;
  ShiftSide last_side;
  bool chord_down;
} ChordState;

static pthread_t g_thread;
static atomic_bool g_running = false;
static atomic_bool g_thread_started = false;
static atomic_int g_chord_count = 0;
static atomic_int g_edge_count = 0;
static atomic_int g_last_edge_side = 0; /* 1 left 2 right */
static atomic_int g_last_edge_down = 0;
static atomic_int g_last_keycode = 0;
static atomic_int g_status = 0; /* 0 idle, 1 starting, 2 ready, 3 failed */
static CFMachPortRef g_tap = NULL;
static CFRunLoopRef g_rl = NULL;
static CFRunLoopSourceRef g_source = NULL;
static ChordState g_chord = {0};

static bool observe(ChordState *st, ShiftSide side, bool shift_active) {
  if (!shift_active) {
    st->shift_active = false;
    st->last_side = SIDE_NONE;
    st->chord_down = false;
    return false;
  }
  bool should = st->shift_active && st->last_side != SIDE_NONE &&
                st->last_side != side && !st->chord_down;
  st->shift_active = true;
  st->last_side = side;
  if (should) st->chord_down = true;
  return should;
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
  if (type != kCGEventFlagsChanged || !event) return event;

  CGEventFlags flags = CGEventGetFlags(event);
  bool shift_active = (flags & kCGEventFlagMaskShift) != 0;
  int64_t keycode =
      CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);

  ShiftSide side = SIDE_NONE;
  if (keycode == VK_LEFT_SHIFT) side = SIDE_LEFT;
  else if (keycode == VK_RIGHT_SHIFT) side = SIDE_RIGHT;

  if (side != SIDE_NONE) {
    atomic_store(&g_last_edge_side, (int)side);
    atomic_store(&g_last_edge_down, shift_active ? 1 : 0);
    atomic_store(&g_last_keycode, (int)keycode);
    atomic_fetch_add(&g_edge_count, 1);
    if (observe(&g_chord, side, shift_active)) {
      atomic_fetch_add(&g_chord_count, 1);
    }
  } else if (!shift_active) {
    observe(&g_chord, SIDE_LEFT, false);
  }
  return event;
}

static void *thread_main(void *arg) {
  (void)arg;
#if defined(__APPLE__)
  /* User-interactive QoS: keep receiving HID events while Atmos is backgrounded. */
  pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
#endif
  atomic_store(&g_status, 1);

  CGEventMask mask = CGEventMaskBit(kCGEventFlagsChanged);
  /* HID first (Tauri parity) — true global modifier stream. Session fallback. */
  g_tap = CGEventTapCreate(kCGHIDEventTap, kCGHeadInsertEventTap,
                           kCGEventTapOptionListenOnly, mask, tap_callback,
                           NULL);
  if (!g_tap) {
    g_tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap,
                            kCGEventTapOptionListenOnly, mask, tap_callback,
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
    /* Default mode run keeps the port serviced; also re-enable if OS disabled tap. */
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

/* ---- C ABI for koffi ---- */

int atmos_appshot_shift_start(void) {
  if (atomic_load(&g_thread_started) || atomic_load(&g_running)) {
    return atomic_load(&g_status) == 2 ? 0 : -1;
  }
  atomic_store(&g_chord_count, 0);
  atomic_store(&g_edge_count, 0);
  memset(&g_chord, 0, sizeof(g_chord));
  atomic_store(&g_running, true);
  atomic_store(&g_status, 1);
  if (pthread_create(&g_thread, NULL, thread_main, NULL) != 0) {
    atomic_store(&g_running, false);
    atomic_store(&g_status, 3);
    return -2;
  }
  atomic_store(&g_thread_started, true);
  /* wait briefly for ready/fail */
  for (int i = 0; i < 50; i++) {
    int st = atomic_load(&g_status);
    if (st == 2) return 0;
    if (st == 3) {
      atomic_store(&g_thread_started, false);
      return -3;
    }
    usleep(10 * 1000);
  }
  /* still starting — treat as ok; poll status later */
  return 0;
}

void atmos_appshot_shift_stop(void) {
  if (!atomic_load(&g_thread_started)) return;
  atomic_store(&g_running, false);
  if (g_rl) CFRunLoopWakeUp(g_rl);
  pthread_join(g_thread, NULL);
  atomic_store(&g_thread_started, false);
  atomic_store(&g_status, 0);
}

/* Returns number of chords consumed (usually 0 or 1+). */
int atmos_appshot_shift_take_chord(void) {
  int n = atomic_exchange(&g_chord_count, 0);
  return n;
}

int atmos_appshot_shift_status(void) {
  return atomic_load(&g_status);
}

/* Snapshot last edge for diagnostics: writes side, down, keycode, edge_count */
void atmos_appshot_shift_last_edge(int *side, int *down, int *keycode,
                                   int *edge_count) {
  if (side) *side = atomic_load(&g_last_edge_side);
  if (down) *down = atomic_load(&g_last_edge_down);
  if (keycode) *keycode = atomic_load(&g_last_keycode);
  if (edge_count) *edge_count = atomic_load(&g_edge_count);
}

int atmos_appshot_shift_ax_trusted(void) {
  return AXIsProcessTrusted() ? 1 : 0;
}

/**
 * Blocking run for standalone helper process (ELECTRON_RUN_AS_NODE / CLI).
 * Starts the tap thread then parks this thread; wake via stop().
 * Returns 0 if tap is ready, negative on failure.
 */
int atmos_appshot_shift_run_blocking(void) {
  int rc = atmos_appshot_shift_start();
  if (rc != 0) return rc;
  /* Wait until ready or failed. */
  for (int i = 0; i < 100; i++) {
    int st = atomic_load(&g_status);
    if (st == 2) break;
    if (st == 3) return -3;
    usleep(10 * 1000);
  }
  if (atomic_load(&g_status) != 2) return -3;
  /* Park until stop(). */
  while (atomic_load(&g_running) && atomic_load(&g_thread_started)) {
    usleep(200 * 1000);
  }
  return 0;
}

/*
 * Host-process inject mode (DYLD_INSERT_LIBRARIES into Atmos Desktop Use
 * cua-driver). Dual-shift then runs under com.atmos.desktop.use — same TCC
 * identity as capture/control — and publishes chords on a Unix socket.
 *
 * Socket path: $ATMOS_HOME/desktop-use/appshot-shift.sock
 *          or: $HOME/.atmos/desktop-use/appshot-shift.sock
 * Protocol: NDJSON lines {"t":"chord"} / {"t":"ready","ax":bool}
 */
#if defined(ATMOS_APPSHOT_SHIFT_HOST_INJECT)
#include <crt_externs.h>
#include <errno.h>
#include <fcntl.h>
#include <stdlib.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>

enum { kHostShiftMaxClients = 4 };

static int g_host_listen_fd = -1;
static int g_host_clients[kHostShiftMaxClients];
static pthread_t g_host_broker_thread;
static atomic_bool g_host_broker_started = false;

static void host_shift_socket_path(char *out, size_t out_len) {
  const char *atmos_home = getenv("ATMOS_HOME");
  if (atmos_home && atmos_home[0]) {
    snprintf(out, out_len, "%s/desktop-use/appshot-shift.sock", atmos_home);
    return;
  }
  const char *home = getenv("HOME");
  if (home && home[0]) {
    snprintf(out, out_len, "%s/.atmos/desktop-use/appshot-shift.sock", home);
    return;
  }
  snprintf(out, out_len, "/tmp/atmos-appshot-shift.sock");
}

static void host_shift_broadcast(const char *line) {
  size_t n = strlen(line);
  for (int i = 0; i < kHostShiftMaxClients; i++) {
    int fd = g_host_clients[i];
    if (fd < 0) continue;
    ssize_t w = send(fd, line, n, 0);
    if (w < 0) {
      close(fd);
      g_host_clients[i] = -1;
    }
  }
}

static void host_shift_mkdir_p_parent(const char *sock_path) {
  char dir[512];
  snprintf(dir, sizeof(dir), "%s", sock_path);
  char *slash = strrchr(dir, '/');
  if (!slash || slash == dir) return;
  *slash = '\0';
  if (mkdir(dir, 0700) != 0 && errno != EEXIST) {
    char *slash2 = strrchr(dir, '/');
    if (slash2 && slash2 != dir) {
      *slash2 = '\0';
      (void)mkdir(dir, 0700);
      *slash2 = '/';
      (void)mkdir(dir, 0700);
    }
  }
}

static int host_shift_listen(void) {
  char path[512];
  host_shift_socket_path(path, sizeof(path));
  host_shift_mkdir_p_parent(path);
  unlink(path);

  int fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0) return -1;
  int flags = fcntl(fd, F_GETFL, 0);
  if (flags >= 0) (void)fcntl(fd, F_SETFL, flags | O_NONBLOCK);

  struct sockaddr_un addr;
  memset(&addr, 0, sizeof(addr));
  addr.sun_family = AF_UNIX;
  strncpy(addr.sun_path, path, sizeof(addr.sun_path) - 1);
  if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
    close(fd);
    return -1;
  }
  (void)chmod(path, 0600);
  if (listen(fd, 2) != 0) {
    close(fd);
    unlink(path);
    return -1;
  }
  return fd;
}

static void host_shift_accept_clients(void) {
  if (g_host_listen_fd < 0) return;
  for (;;) {
    int cfd = accept(g_host_listen_fd, NULL, NULL);
    if (cfd < 0) break;
    int slot = -1;
    for (int i = 0; i < kHostShiftMaxClients; i++) {
      if (g_host_clients[i] < 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      close(cfd);
      continue;
    }
    g_host_clients[slot] = cfd;
    int ax = atmos_appshot_shift_ax_trusted();
    char ready[64];
    snprintf(ready, sizeof(ready), "{\"t\":\"ready\",\"ax\":%s}\n",
             ax ? "true" : "false");
    (void)send(cfd, ready, strlen(ready), 0);
  }
}

static void *host_shift_broker_main(void *arg) {
  (void)arg;
#if defined(__APPLE__)
  pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
#endif
  for (int i = 0; i < kHostShiftMaxClients; i++) g_host_clients[i] = -1;

  (void)atmos_appshot_shift_start();
  g_host_listen_fd = host_shift_listen();

  while (atomic_load(&g_host_broker_started)) {
    host_shift_accept_clients();
    int chords = atmos_appshot_shift_take_chord();
    for (int i = 0; i < chords; i++) {
      host_shift_broadcast("{\"t\":\"chord\"}\n");
    }
    usleep(16 * 1000);
  }

  if (g_host_listen_fd >= 0) {
    close(g_host_listen_fd);
    g_host_listen_fd = -1;
  }
  char path[512];
  host_shift_socket_path(path, sizeof(path));
  unlink(path);
  for (int i = 0; i < kHostShiftMaxClients; i++) {
    if (g_host_clients[i] >= 0) {
      close(g_host_clients[i]);
      g_host_clients[i] = -1;
    }
  }
  return NULL;
}

static bool host_shift_argv_is_serve(void) {
  const char *force = getenv("ATMOS_APPSHOT_SHIFT_INJECT");
  if (force && (strcmp(force, "1") == 0 || strcmp(force, "true") == 0)) {
    return true;
  }
  if (force && (strcmp(force, "0") == 0 || strcmp(force, "false") == 0)) {
    return false;
  }
  int argc = *_NSGetArgc();
  char **argv = *_NSGetArgv();
  if (!argv || argc <= 0) return false;
  for (int i = 1; i < argc; i++) {
    if (argv[i] && strcmp(argv[i], "serve") == 0) return true;
  }
  return false;
}

__attribute__((constructor)) static void atmos_appshot_shift_host_inject_ctor(void) {
  if (atomic_exchange(&g_host_broker_started, true)) return;
  /* One-shot `call`/`stop` must not install a global event tap. */
  if (!host_shift_argv_is_serve()) {
    atomic_store(&g_host_broker_started, false);
    return;
  }
  if (pthread_create(&g_host_broker_thread, NULL, host_shift_broker_main, NULL) !=
      0) {
    atomic_store(&g_host_broker_started, false);
    return;
  }
  pthread_detach(g_host_broker_thread);
}
#endif /* ATMOS_APPSHOT_SHIFT_HOST_INJECT */
