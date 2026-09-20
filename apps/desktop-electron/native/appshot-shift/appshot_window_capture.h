#ifndef ATMOS_APPSHOT_WINDOW_CAPTURE_H
#define ATMOS_APPSHOT_WINDOW_CAPTURE_H

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Freeze the frontmost eligible window and capture it in-process (Desktop Use
 * TCC identity). Returns a heap JSON line with a trailing newline. Caller
 * frees with free(). Never returns NULL.
 */
char *atmos_appshot_host_capture_now(void);

#ifdef __cplusplus
}
#endif

#endif /* ATMOS_APPSHOT_WINDOW_CAPTURE_H */
