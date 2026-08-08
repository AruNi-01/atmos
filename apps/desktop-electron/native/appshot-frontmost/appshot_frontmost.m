/*
 * Universal frontmost window geometry for AppShot (Tauri APP-021 parity).
 *
 * Uses NSWorkspace (frontmost app + pid) + CGWindowList (real window rects).
 * Works for native apps AND Electron/Chromium/custom-UI apps that expose
 * empty Accessibility trees to System Events.
 *
 * Prints one JSON object to stdout.
 */

#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#include <stdio.h>

enum { kMinEdge = 64 };

typedef struct {
  CGFloat bestArea;
  CGFloat bestX;
  CGFloat bestY;
  CGFloat bestW;
  CGFloat bestH;
  int bestWindowId;
} FrontScan;

static void json_escape(NSString *s, FILE *out) {
  if (!s) return;
  const char *utf8 = [s UTF8String];
  if (!utf8) return;
  for (const unsigned char *p = (const unsigned char *)utf8; *p; p++) {
    unsigned char c = *p;
    switch (c) {
      case '"': fputs("\\\"", out); break;
      case '\\': fputs("\\\\", out); break;
      case '\n': fputs("\\n", out); break;
      case '\r': fputs("\\r", out); break;
      case '\t': fputs("\\t", out); break;
      default:
        if (c < 0x20) fprintf(out, "\\u%04x", c);
        else fputc(c, out);
        break;
    }
  }
}

static BOOL usable_size(CGFloat w, CGFloat h) {
  return w >= kMinEdge && h >= kMinEdge;
}

/**
 * Scan CG window list for targetPid; update scan + bestTitleOut (retained NSString*).
 */
static void scan_window_list(
    CFArrayRef info,
    int targetPid,
    FrontScan *scan,
    NSString *__strong *bestTitleOut) {
  if (!info || !scan) return;
  CFIndex count = CFArrayGetCount(info);
  for (CFIndex i = 0; i < count; i++) {
    CFDictionaryRef win = CFArrayGetValueAtIndex(info, i);
    if (!win) continue;

    CFNumberRef layerRef = CFDictionaryGetValue(win, kCGWindowLayer);
    int layer = 0;
    if (layerRef) CFNumberGetValue(layerRef, kCFNumberIntType, &layer);
    if (layer != 0) continue;

    CFNumberRef pidRef = CFDictionaryGetValue(win, kCGWindowOwnerPID);
    int ownerPid = 0;
    if (pidRef) CFNumberGetValue(pidRef, kCFNumberIntType, &ownerPid);
    if (ownerPid != targetPid) continue;

    CFNumberRef alphaRef = CFDictionaryGetValue(win, kCGWindowAlpha);
    double alpha = 1.0;
    if (alphaRef) CFNumberGetValue(alphaRef, kCFNumberDoubleType, &alpha);
    if (alpha <= 0.01) continue;

    CFDictionaryRef bounds = CFDictionaryGetValue(win, kCGWindowBounds);
    if (!bounds) continue;
    CGRect r = CGRectZero;
    if (!CGRectMakeWithDictionaryRepresentation(bounds, &r)) continue;
    if (!usable_size(r.size.width, r.size.height)) continue;

    CGFloat area = r.size.width * r.size.height;
    if (area <= scan->bestArea) continue;

    scan->bestArea = area;
    scan->bestX = r.origin.x;
    scan->bestY = r.origin.y;
    scan->bestW = r.size.width;
    scan->bestH = r.size.height;

    scan->bestWindowId = 0;
    CFNumberRef numRef = CFDictionaryGetValue(win, kCGWindowNumber);
    if (numRef) CFNumberGetValue(numRef, kCFNumberIntType, &scan->bestWindowId);

    if (bestTitleOut) {
      CFStringRef nameRef = CFDictionaryGetValue(win, kCGWindowName);
      *bestTitleOut = nameRef ? [(__bridge NSString *)nameRef copy] : nil;
    }
  }
}

int main(int argc, const char *argv[]) {
  (void)argc;
  (void)argv;
  @autoreleasepool {
    NSRunningApplication *front = [[NSWorkspace sharedWorkspace] frontmostApplication];
    if (!front) {
      puts("{\"ok\":false,\"error\":\"no_frontmost_app\"}");
      return 1;
    }

    NSString *appName = front.localizedName ?: @"Unknown App";
    pid_t pid = front.processIdentifier;
    NSString *bundleId = front.bundleIdentifier;

    FrontScan scan = {0};
    NSString *bestTitle = nil;

    CFArrayRef onScreen = CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID);
    scan_window_list(onScreen, (int)pid, &scan, &bestTitle);
    if (onScreen) CFRelease(onScreen);

    if (scan.bestArea <= 0) {
      CFArrayRef all = CGWindowListCopyWindowInfo(
          kCGWindowListOptionAll | kCGWindowListExcludeDesktopElements,
          kCGNullWindowID);
      scan_window_list(all, (int)pid, &scan, &bestTitle);
      if (all) CFRelease(all);
    }

    printf("{\"ok\":true,\"app_name\":\"");
    json_escape(appName, stdout);
    printf("\",\"process_id\":%d", (int)pid);
    if (scan.bestArea > 0) {
      printf(",\"window_id\":\"%d\",\"window_title\":", scan.bestWindowId);
      if (bestTitle.length > 0) {
        printf("\"");
        json_escape(bestTitle, stdout);
        printf("\"");
      } else {
        fputs("null", stdout);
      }
      printf(",\"x\":%.0f,\"y\":%.0f,\"width\":%.0f,\"height\":%.0f",
             scan.bestX, scan.bestY, scan.bestW, scan.bestH);
    } else {
      fputs(",\"window_id\":null,\"window_title\":null,"
            "\"x\":null,\"y\":null,\"width\":null,\"height\":null",
            stdout);
    }
    fputs(",\"bundle_id\":", stdout);
    if (bundleId) {
      printf("\"");
      json_escape(bundleId, stdout);
      printf("\"");
    } else {
      fputs("null", stdout);
    }
    puts(",\"source\":\"cgwindowlist\"}");
    return 0;
  }
}
