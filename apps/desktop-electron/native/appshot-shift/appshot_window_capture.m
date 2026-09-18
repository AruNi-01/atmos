/*
 * In-process AppShot capture for the Desktop Use host (DYLD_INSERT).
 *
 * Selects the frontmost eligible CG window (z-order, not largest area),
 * optionally aligned to the AX focused window, then captures that window id
 * with ScreenCaptureKit when available, else CGWindowListCreateImage.
 *
 * Does not request TCC prompts. Missing Screen Recording is reported as
 * need_grant so the desktop shell can show the drag-to-list overlay.
 */

#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

#if __has_include(<ScreenCaptureKit/ScreenCaptureKit.h>)
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#define ATMOS_APPSHOT_HAS_SCK 1
#endif

#include <dlfcn.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "appshot_window_capture.h"

enum { kMinEdge = 32 };

static BOOL bundle_is_self(NSString *bid) {
  if (!bid.length) return NO;
  return [bid isEqualToString:@"com.atmos.desktop"] ||
         [bid isEqualToString:@"com.atmos.desktop.dev"] ||
         [bid isEqualToString:@"com.atmos.desktop.use"];
}

static void append_escaped(NSMutableString *out, NSString *s) {
  if (!s) return;
  NSUInteger len = s.length;
  unichar *buf = malloc(sizeof(unichar) * len);
  if (!buf) return;
  [s getCharacters:buf range:NSMakeRange(0, len)];
  for (NSUInteger i = 0; i < len; i++) {
    unichar c = buf[i];
    switch (c) {
      case '"':
        [out appendString:@"\\\""];
        break;
      case '\\':
        [out appendString:@"\\\\"];
        break;
      case '\n':
        [out appendString:@"\\n"];
        break;
      case '\r':
        [out appendString:@"\\r"];
        break;
      case '\t':
        [out appendString:@"\\t"];
        break;
      default:
        if (c < 0x20) {
          [out appendFormat:@"\\u%04x", c];
        } else {
          [out appendFormat:@"%C", c];
        }
        break;
    }
  }
  free(buf);
}

static char *dup_line(NSString *json) {
  NSString *line = [json hasSuffix:@"\n"] ? json : [json stringByAppendingString:@"\n"];
  const char *utf8 = line.UTF8String;
  if (!utf8) return strdup("{\"t\":\"ignored\",\"reason\":\"utf8\"}\n");
  char *copy = strdup(utf8);
  return copy ? copy : strdup("{\"t\":\"ignored\",\"reason\":\"oom\"}\n");
}

static char *line_ignored(const char *reason) {
  char buf[160];
  snprintf(buf, sizeof(buf), "{\"t\":\"ignored\",\"reason\":\"%s\"}\n", reason);
  return strdup(buf);
}

static char *line_need_grant(const char *missing) {
  char buf[192];
  snprintf(buf, sizeof(buf),
           "{\"t\":\"need_grant\",\"missing\":[\"%s\"]}\n", missing);
  return strdup(buf);
}

static BOOL rects_close(CGRect a, CGRect b) {
  return fabs(a.origin.x - b.origin.x) <= 2.0 &&
         fabs(a.origin.y - b.origin.y) <= 2.0 &&
         fabs(a.size.width - b.size.width) <= 2.0 &&
         fabs(a.size.height - b.size.height) <= 2.0;
}

static BOOL ax_focused_bounds(pid_t pid, CGRect *outRect) {
  if (!outRect || !AXIsProcessTrusted()) return NO;
  AXUIElementRef app = AXUIElementCreateApplication(pid);
  if (!app) return NO;
  AXUIElementSetMessagingTimeout(app, 0.2f);
  CFTypeRef focused = NULL;
  AXError err = AXUIElementCopyAttributeValue(
      app, kAXFocusedWindowAttribute, &focused);
  CFRelease(app);
  if (err != kAXErrorSuccess || !focused) return NO;

  AXUIElementRef win = (AXUIElementRef)focused;
  CFTypeRef posVal = NULL;
  CFTypeRef sizeVal = NULL;
  if (AXUIElementCopyAttributeValue(win, kAXPositionAttribute, &posVal) !=
          kAXErrorSuccess ||
      AXUIElementCopyAttributeValue(win, kAXSizeAttribute, &sizeVal) !=
          kAXErrorSuccess ||
      !posVal || !sizeVal) {
    if (posVal) CFRelease(posVal);
    if (sizeVal) CFRelease(sizeVal);
    CFRelease(focused);
    return NO;
  }
  CGPoint origin = CGPointZero;
  CGSize size = CGSizeZero;
  BOOL ok = AXValueGetValue((AXValueRef)posVal, kAXValueCGPointType, &origin) &&
            AXValueGetValue((AXValueRef)sizeVal, kAXValueCGSizeType, &size);
  CFRelease(posVal);
  CFRelease(sizeVal);
  CFRelease(focused);
  if (!ok || size.width < kMinEdge || size.height < kMinEdge) return NO;
  *outRect = CGRectMake(origin.x, origin.y, size.width, size.height);
  return YES;
}

typedef struct {
  CGWindowID windowId;
  CGRect bounds;
  NSString *title;
} FrozenWindow;

static BOOL window_eligible(CFDictionaryRef win, pid_t targetPid, CGRect *outBounds) {
  CFNumberRef layerRef = CFDictionaryGetValue(win, kCGWindowLayer);
  int layer = 0;
  if (layerRef) CFNumberGetValue(layerRef, kCFNumberIntType, &layer);
  if (layer != 0) return NO;

  CFNumberRef pidRef = CFDictionaryGetValue(win, kCGWindowOwnerPID);
  int ownerPid = 0;
  if (pidRef) CFNumberGetValue(pidRef, kCFNumberIntType, &ownerPid);
  if (ownerPid != (int)targetPid) return NO;

  CFNumberRef alphaRef = CFDictionaryGetValue(win, kCGWindowAlpha);
  double alpha = 1.0;
  if (alphaRef) CFNumberGetValue(alphaRef, kCFNumberDoubleType, &alpha);
  if (!(alpha > 0.01)) return NO;

  CFBooleanRef onscreenRef = CFDictionaryGetValue(win, kCGWindowIsOnscreen);
  if (onscreenRef && !CFBooleanGetValue(onscreenRef)) return NO;

  CFDictionaryRef boundsDict = CFDictionaryGetValue(win, kCGWindowBounds);
  if (!boundsDict) return NO;
  CGRect r = CGRectZero;
  if (!CGRectMakeWithDictionaryRepresentation(boundsDict, &r)) return NO;
  if (r.size.width < kMinEdge || r.size.height < kMinEdge) return NO;
  if (outBounds) *outBounds = r;
  return YES;
}

static BOOL pick_front_window(pid_t pid, BOOL requireAxMatch, FrozenWindow *out) {
  CFArrayRef list = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID);
  if (!list) return NO;

  CGRect focused = CGRectZero;
  BOOL haveFocused = requireAxMatch && ax_focused_bounds(pid, &focused);

  BOOL found = NO;
  CFIndex count = CFArrayGetCount(list);
  for (CFIndex i = 0; i < count; i++) {
    CFDictionaryRef win = CFArrayGetValueAtIndex(list, i);
    if (!win) continue;
    CGRect bounds = CGRectZero;
    if (!window_eligible(win, pid, &bounds)) continue;
    if (haveFocused && !rects_close(bounds, focused)) continue;

    CFNumberRef numRef = CFDictionaryGetValue(win, kCGWindowNumber);
    int windowId = 0;
    if (numRef) CFNumberGetValue(numRef, kCFNumberIntType, &windowId);
    if (windowId <= 0) continue;

    CFStringRef nameRef = CFDictionaryGetValue(win, kCGWindowName);
    out->windowId = (CGWindowID)windowId;
    out->bounds = bounds;
    out->title = nameRef ? [(__bridge NSString *)nameRef copy] : nil;
    found = YES;
    break;
  }
  CFRelease(list);
  return found;
}

static NSData *png_from_cgimage(CGImageRef image) {
  if (!image) return nil;
  size_t width = CGImageGetWidth(image);
  size_t height = CGImageGetHeight(image);
  if (width < 8 || height < 8) return nil;
  NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithCGImage:image];
  if (!rep) return nil;
  return [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
}

typedef CGImageRef (*AtmosCGWindowListCreateImageFn)(
    CGRect screenBounds, CGWindowListOption listOption, CGWindowID windowID,
    uint32_t imageOption);

static NSData *capture_cg(CGWindowID windowId, CGRect bounds) {
  /* CGWindowListCreateImage is unavailable in the macOS 15+ SDK. Look it up
   * at runtime so older hosts still have a CG fallback when ScreenCaptureKit
   * cannot capture the frozen window. */
  static AtmosCGWindowListCreateImageFn create_image = NULL;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    create_image = (AtmosCGWindowListCreateImageFn)dlsym(
        RTLD_DEFAULT, "CGWindowListCreateImage");
  });
  if (!create_image) return nil;
  CGImageRef image = create_image(
      bounds, kCGWindowListOptionIncludingWindow, windowId,
      (uint32_t)((1u << 0) | (1u << 4)));
  NSData *png = png_from_cgimage(image);
  if (image) CGImageRelease(image);
  return png;
}

#ifdef ATMOS_APPSHOT_HAS_SCK
static NSData *capture_sck(CGWindowID windowId, CGFloat pointsW, CGFloat pointsH) {
  if (@available(macOS 14.0, *)) {
    __block SCShareableContent *content = nil;
    dispatch_semaphore_t sema = dispatch_semaphore_create(0);
    [SCShareableContent
        getShareableContentExcludingDesktopWindows:YES
                               onScreenWindowsOnly:NO
                                 completionHandler:^(SCShareableContent *c, NSError *error) {
                                   (void)error;
                                   content = c;
                                   dispatch_semaphore_signal(sema);
                                 }];
    if (dispatch_semaphore_wait(
            sema, dispatch_time(DISPATCH_TIME_NOW, 4 * NSEC_PER_SEC)) != 0) {
      return nil;
    }
    if (!content) return nil;

    SCWindow *match = nil;
    for (SCWindow *win in content.windows) {
      if ((CGWindowID)win.windowID == windowId) {
        match = win;
        break;
      }
    }
    if (!match) return nil;

    SCContentFilter *filter =
        [[SCContentFilter alloc] initWithDesktopIndependentWindow:match];
    SCStreamConfiguration *config = [SCStreamConfiguration new];
    CGFloat longest = MAX(MAX(pointsW, pointsH), 1.0);
    CGFloat scale = MIN(2.0, 4096.0 / longest);
    config.width = (NSInteger)MAX(1, lround(pointsW * scale));
    config.height = (NSInteger)MAX(1, lround(pointsH * scale));
    config.showsCursor = NO;
    config.scalesToFit = YES;
    if ([config respondsToSelector:@selector(setIgnoreShadowsSingleWindow:)]) {
      config.ignoreShadowsSingleWindow = YES;
    }

    __block CGImageRef captured = NULL;
    dispatch_semaphore_t sema2 = dispatch_semaphore_create(0);
    [SCScreenshotManager captureImageWithFilter:filter
                                  configuration:config
                              completionHandler:^(CGImageRef image, NSError *error) {
                                (void)error;
                                if (image) captured = CGImageRetain(image);
                                dispatch_semaphore_signal(sema2);
                              }];
    if (dispatch_semaphore_wait(
            sema2, dispatch_time(DISPATCH_TIME_NOW, 4 * NSEC_PER_SEC)) != 0) {
      return nil;
    }
    NSData *png = png_from_cgimage(captured);
    if (captured) CGImageRelease(captured);
    return png;
  }
  return nil;
}
#endif

static NSString *png_output_path(void) {
  NSDictionary *env = [[NSProcessInfo processInfo] environment];
  NSString *atmosHome = env[@"ATMOS_HOME"];
  NSString *base = nil;
  if (atmosHome.length) {
    base = [atmosHome stringByAppendingPathComponent:@"data/appshots/tmp"];
  } else {
    base = [NSHomeDirectory()
        stringByAppendingPathComponent:@".atmos/data/appshots/tmp"];
  }
  NSError *err = nil;
  [[NSFileManager defaultManager] createDirectoryAtPath:base
                            withIntermediateDirectories:YES
                                             attributes:nil
                                                  error:&err];
  long long stamp = (long long)([[NSDate date] timeIntervalSince1970] * 1000.0);
  return [base stringByAppendingPathComponent:
                   [NSString stringWithFormat:@"host-%lld-%d.png", stamp,
                                              (int)getpid()]];
}

char *atmos_appshot_host_capture_now(void) {
  @autoreleasepool {
    if (!CGPreflightScreenCaptureAccess()) {
      return line_need_grant("screen_recording");
    }

    NSRunningApplication *front =
        [[NSWorkspace sharedWorkspace] frontmostApplication];
    if (!front) return line_ignored("no_window");
    if (front.processIdentifier == getpid()) return line_ignored("self");
    NSString *bundleId = front.bundleIdentifier;
    if (bundle_is_self(bundleId)) return line_ignored("self");

    pid_t pid = front.processIdentifier;
    FrozenWindow frozen = {0};
    if (!pick_front_window(pid, YES, &frozen)) {
      if (!pick_front_window(pid, NO, &frozen)) {
        return line_ignored("no_window");
      }
    }

    NSData *png = nil;
#ifdef ATMOS_APPSHOT_HAS_SCK
    png = capture_sck(frozen.windowId, frozen.bounds.size.width,
                      frozen.bounds.size.height);
#endif
    if (!png) {
      png = capture_cg(frozen.windowId, frozen.bounds);
    }
    if (!png.length) {
      return line_need_grant("screen_recording");
    }

    NSString *path = png_output_path();
    if (![png writeToFile:path atomically:YES]) {
      return line_ignored("write_failed");
    }

    NSString *appName = front.localizedName ?: @"Application";
    NSMutableString *json = [NSMutableString stringWithString:@"{\"t\":\"captured\""];
    [json appendString:@",\"app_name\":\""];
    append_escaped(json, appName);
    [json appendString:@"\""];
    if (bundleId.length) {
      [json appendString:@",\"bundle_id\":\""];
      append_escaped(json, bundleId);
      [json appendString:@"\""];
    } else {
      [json appendString:@",\"bundle_id\":null"];
    }
    [json appendFormat:@",\"process_id\":%d,\"window_id\":%u", (int)pid,
                       (unsigned)frozen.windowId];
    if (frozen.title.length) {
      [json appendString:@",\"window_title\":\""];
      append_escaped(json, frozen.title);
      [json appendString:@"\""];
    } else {
      [json appendString:@",\"window_title\":null"];
    }
    [json appendFormat:
              @",\"x\":%.0f,\"y\":%.0f,\"width\":%.0f,\"height\":%.0f",
              frozen.bounds.origin.x, frozen.bounds.origin.y,
              frozen.bounds.size.width, frozen.bounds.size.height];
    [json appendString:@",\"png_path\":\""];
    append_escaped(json, path);
    [json appendString:@"\",\"quality\":\"window\"}"];
    return dup_line(json);
  }
}
