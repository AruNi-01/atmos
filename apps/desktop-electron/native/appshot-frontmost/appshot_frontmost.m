/*
 * Universal frontmost window geometry for AppShot (Tauri APP-021 parity).
 *
 * Uses NSWorkspace (frontmost app + pid) + CGWindowList (real window rects).
 * Works for native apps AND Electron/Chromium/custom-UI apps that expose
 * empty Accessibility trees to System Events.
 *
 * Prints one JSON object to stdout:
 *   {"ok":true,"app_name":"...","process_id":123,"window_id":"456",
 *    "window_title":"...","x":0,"y":0,"width":800,"height":600}
 */

#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#include <stdio.h>
#include <string.h>

enum { kMinEdge = 64 };

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

    CFArrayRef info = CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID);
    if (!info) {
      printf("{\"ok\":true,\"app_name\":\"");
      json_escape(appName, stdout);
      printf("\",\"process_id\":%d,\"window_id\":null,\"window_title\":null,"
             "\"x\":null,\"y\":null,\"width\":null,\"height\":null,"
             "\"bundle_id\":",
             (int)pid);
      if (bundleId) {
        printf("\"");
        json_escape(bundleId, stdout);
        printf("\"");
      } else {
        fputs("null", stdout);
      }
      puts(",\"source\":\"nsworkspace_only\"}");
      return 0;
    }

    // Among layer-0 windows owned by frontmost pid, pick largest content rect.
    // (Matches host-list scoring: ignore title-bar strips, prefer area.)
    CGFloat bestArea = 0;
    CGFloat bestX = 0, bestY = 0, bestW = 0, bestH = 0;
    int bestWindowId = 0;
    NSString *bestTitle = nil;
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
      if (ownerPid != (int)pid) continue;

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
      if (area <= bestArea) continue;

      bestArea = area;
      bestX = r.origin.x;
      bestY = r.origin.y;
      bestW = r.size.width;
      bestH = r.size.height;

      CFNumberRef numRef = CFDictionaryGetValue(win, kCGWindowNumber);
      bestWindowId = 0;
      if (numRef) CFNumberGetValue(numRef, kCFNumberIntType, &bestWindowId);

      CFStringRef nameRef = CFDictionaryGetValue(win, kCGWindowName);
      bestTitle = nameRef ? (__bridge NSString *)nameRef : nil;
    }

    CFRelease(info);

    printf("{\"ok\":true,\"app_name\":\"");
    json_escape(appName, stdout);
    printf("\",\"process_id\":%d", (int)pid);
    if (bestArea > 0) {
      printf(",\"window_id\":\"%d\",\"window_title\":", bestWindowId);
      if (bestTitle.length > 0) {
        printf("\"");
        json_escape(bestTitle, stdout);
        printf("\"");
      } else {
        fputs("null", stdout);
      }
      printf(",\"x\":%.0f,\"y\":%.0f,\"width\":%.0f,\"height\":%.0f",
             bestX, bestY, bestW, bestH);
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
