import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { StatusBar } from "./components/status-bar";
import type { AccessibilityNode } from "./components/accessibility-panel";
import { DevicePanel } from "./components/device-panel";
import { DeviceStream } from "./components/device-stream";
import { CloseIcon, PanelRightIcon, PowerIcon } from "./components/chrome-icons";
import { ControlBar, type HardwareKey } from "./components/control-bar";
import { SideTools } from "./components/side-tools";
import {
  useStream,
  type DeviceSize,
  type Sender,
  type StreamTransport,
} from "./lib/use-stream";
import {
  ViewerTransportControlsContext,
  type ViewerTransportControls,
} from "./lib/viewer-transport-context";

// Android KeyEvent meta state bits (AMETA_*).
const AMETA_SHIFT_ON = 0x1;
const AMETA_ALT_ON = 0x2;
const AMETA_CTRL_ON = 0x1000;

// Non-printable Android keycodes for editing/navigation keys the browser
// reports with a multi-character e.key (so the plain text-injection path
// below never sees them).
const NAV_KEYCODES: Record<string, number> = {
  Backspace: 67,
  Delete: 112,
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,
  Tab: 61,
  Home: 122,
  End: 123,
  PageUp: 92,
  PageDown: 93,
};

// Keyed by e.code (physical key) rather than e.key so Ctrl/Cmd shortcuts
// keep working on non-QWERTY layouts.
const SHORTCUT_KEYCODES: Record<string, number> = {
  KeyA: 29, // select all
  KeyC: 31, // copy
  KeyV: 50, // paste
  KeyX: 52, // cut
  KeyZ: 54, // undo
  KeyY: 53, // redo
};

type StreamControls = {
  canvasRef: RefObject<HTMLCanvasElement>;
  videoRef: RefObject<HTMLVideoElement>;
  send: Sender;
  deviceSize: DeviceSize | null;
  transport: StreamTransport | null;
};

const StreamControlsContext = createContext<StreamControls | null>(null);

const StableDevicePanel = memo(DevicePanel);
const StableControlBar = memo(ControlBar);

function useStreamControls(): StreamControls {
  const controls = useContext(StreamControlsContext);
  if (!controls) throw new Error("StreamControlsContext is missing");
  return controls;
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    state,
    send,
    transport,
    availableTransports,
    switchingTo,
    transportError,
    selectTransport,
    statsDownloadStatus,
    statsDownloadMessage,
    downloadStats,
  } = useStream(canvasRef, videoRef);
  const deviceWidth = state.deviceSize?.width;
  const deviceHeight = state.deviceSize?.height;
  const controls = useMemo<StreamControls>(
    () => ({
      canvasRef,
      videoRef,
      send,
      transport,
      deviceSize:
        deviceWidth === undefined || deviceHeight === undefined
          ? null
          : { width: deviceWidth, height: deviceHeight },
    }),
    [send, transport, deviceWidth, deviceHeight],
  );
  const viewerTransportControls = useMemo<ViewerTransportControls>(
    () => ({
      transport,
      availableTransports,
      switchingTo,
      error: transportError,
      selectTransport,
      statsDownloadStatus,
      statsDownloadMessage,
      downloadStats,
    }),
    [
      availableTransports,
      downloadStats,
      selectTransport,
      statsDownloadMessage,
      statsDownloadStatus,
      switchingTo,
      transport,
      transportError,
    ],
  );

  return (
    <>
      <StatusBar
        status={state.status}
        deviceSize={state.deviceSize}
        fps={state.fps}
        stats={state.stats}
        controlError={state.controlError}
      />
      <ViewerTransportControlsContext.Provider value={viewerTransportControls}>
        <StreamControlsContext.Provider value={controls}>
          <AppShell />
        </StreamControlsContext.Provider>
      </ViewerTransportControlsContext.Provider>
    </>
  );
}

const AppShell = memo(function AppShell() {
  const { canvasRef, videoRef, send, deviceSize, transport } =
    useStreamControls();
  const keyboardProxyRef = useRef<HTMLInputElement>(null);
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const [accessibilityEnabled, setAccessibilityEnabled] = useState(false);
  const [accessibilityNodes, setAccessibilityNodes] = useState<AccessibilityNode[]>([]);
  const [highlightedAccessibilityId, setHighlightedAccessibilityId] = useState<string | null>(null);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [keyboardActive, setKeyboardActive] = useState(true);
  const deviceLabel = useClaimedDeviceLabel();

  // Keyboard input is captured on a hidden, always-focusable proxy input
  // rather than document.body: that's what lets the OS/browser IME attach
  // and fire composition events for CJK and other composed text, and it
  // gives an unambiguous signal (focus/blur) for whether keys are currently
  // routed to the device vs. a sidebar text field.
  useEffect(() => {
    keyboardProxyRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!stopOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".chrome-stop-wrap")) return;
      setStopOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [stopOpen]);

  useEffect(() => {
    const proxy = keyboardProxyRef.current;
    if (!proxy) return;

    const metaStateFor = (e: KeyboardEvent) =>
      (e.shiftKey ? AMETA_SHIFT_ON : 0) |
      (e.ctrlKey ? AMETA_CTRL_ON : 0) |
      (e.altKey ? AMETA_ALT_ON : 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;

      if (e.key === "Escape") {
        e.preventDefault();
        send({ type: "back" });
        return;
      }

      const shortcutKeycode = (e.ctrlKey || e.metaKey) ? SHORTCUT_KEYCODES[e.code] : undefined;
      if (shortcutKeycode !== undefined) {
        e.preventDefault();
        send({ type: "key", keycode: shortcutKeycode, metaState: AMETA_CTRL_ON });
        return;
      }

      const navKeycode = NAV_KEYCODES[e.key];
      if (navKeycode !== undefined) {
        e.preventDefault();
        send({ type: "key", keycode: navKeycode, metaState: metaStateFor(e) });
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        send({ type: "key", keycode: 66, metaState: metaStateFor(e) });
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        send({ type: "text", text: e.key });
      }
    };

    const onCompositionEnd = (e: CompositionEvent) => {
      proxy.value = "";
      if (e.data) send({ type: "text", text: e.data });
    };

    const onFocus = () => setKeyboardActive(true);
    const onBlur = () => setKeyboardActive(false);

    proxy.addEventListener("keydown", onKeyDown);
    proxy.addEventListener("compositionend", onCompositionEnd);
    proxy.addEventListener("focus", onFocus);
    proxy.addEventListener("blur", onBlur);
    return () => {
      proxy.removeEventListener("keydown", onKeyDown);
      proxy.removeEventListener("compositionend", onCompositionEnd);
      proxy.removeEventListener("focus", onFocus);
      proxy.removeEventListener("blur", onBlur);
    };
  }, [send]);

  const onPress = useCallback(
    (key: HardwareKey) => send({ type: key }),
    [send],
  );

  return (
    <>
      <main
        className={[
          "app-layout",
          devicesOpen ? "devices-open" : "devices-collapsed",
          toolsOpen ? "tools-open" : "tools-collapsed",
        ].join(" ")}
        data-app-shell-renders={renderCountRef.current}
      >
        <aside
          className="device-sidebar chrome-overlay-panel"
          aria-label="Devices"
          aria-hidden={!devicesOpen}
        >
          <div className="chrome-panel-header">
            <span className="chrome-panel-title">Devices</span>
            <button
              type="button"
              className="chrome-icon-btn"
              onClick={() => setDevicesOpen(false)}
              aria-label="Close devices"
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>
          <StableDevicePanel />
        </aside>
        <div className="device" data-atmos-device-stage="">
          <div className="atmos-device-chrome">
            <div className="chrome-pill" data-atmos-device-identity="">
              <button
                type="button"
                className="chrome-device-name"
                onClick={() => setDevicesOpen((open) => !open)}
                aria-label="Open device list"
                aria-pressed={devicesOpen}
              >
                {deviceLabel}
              </button>
            </div>
            <div className="chrome-pill chrome-actions-pill">
              <div className="chrome-stop-wrap">
                <button
                  type="button"
                  className="chrome-icon-btn atmos-stop"
                  style={{ color: "#f87171" }}
                  onClick={() => setStopOpen((open) => !open)}
                  aria-label="Stop preview"
                  aria-expanded={stopOpen}
                  title="Stop"
                >
                  <PowerIcon />
                </button>
                {stopOpen ? (
                  <div className="atmos-stop-confirm">
                    <p>Stop the emulator preview?</p>
                    <div className="atmos-stop-actions">
                      <button
                        type="button"
                        className="chrome-text-btn"
                        onClick={() => setStopOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="confirm-stop"
                        onClick={() => {
                          if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: "atmos:simulator-stop" }, "*");
                          }
                          setStopOpen(false);
                        }}
                      >
                        Stop
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={toolsOpen ? "chrome-icon-btn pressed" : "chrome-icon-btn"}
                onClick={() => setToolsOpen((open) => !open)}
                aria-label="Open tools panel"
                aria-pressed={toolsOpen}
                title="Tools"
              >
                <PanelRightIcon />
              </button>
            </div>
          </div>
          <DeviceStream
            canvasRef={canvasRef}
            videoRef={videoRef}
            transport={transport}
            send={send}
            accessibilityEnabled={accessibilityEnabled}
            accessibilityNodes={accessibilityNodes}
            highlightedAccessibilityId={highlightedAccessibilityId}
            onAccessibilityHover={setHighlightedAccessibilityId}
            deviceSize={deviceSize}
            keyboardProxyRef={keyboardProxyRef}
            keyboardActive={keyboardActive}
          />
          <input
            ref={keyboardProxyRef}
            className="keyboard-proxy"
            aria-hidden="true"
            tabIndex={-1}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="chrome-pill chrome-nav-pill" data-atmos-device-actions="">
            <StableControlBar onPress={onPress} />
          </div>
        </div>
        <aside
          className="side-panel chrome-overlay-panel"
          data-atmos-tools-panel=""
          aria-label="Tools"
          aria-hidden={!toolsOpen}
        >
          <div className="chrome-panel-header">
            <span className="chrome-panel-title">Tools</span>
            <button
              type="button"
              className="chrome-icon-btn"
              onClick={() => setToolsOpen(false)}
              aria-label="Close tools"
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="side-panel-body">
            <SideTools
              accessibilityEnabled={accessibilityEnabled}
              accessibilityNodes={accessibilityNodes}
              highlightedAccessibilityId={highlightedAccessibilityId}
              onAccessibilityEnabledChange={setAccessibilityEnabled}
              onAccessibilityNodesChange={setAccessibilityNodes}
              onAccessibilityHighlight={setHighlightedAccessibilityId}
            />
          </div>
        </aside>
      </main>
    </>
  );
});

function useClaimedDeviceLabel(): string {
  const locked = new URLSearchParams(window.location.search).get("device")?.trim() || "";
  const [label, setLabel] = useState(locked || "Device");
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/device-grid", { cache: "no-store" })
      .then((res) => res.json() as Promise<{
        devices?: Array<{
          name: string;
          current?: boolean;
          id?: string;
          serial?: string | null;
          avd?: string | null;
        }>;
      }>)
      .then((json) => {
        if (cancelled) return;
        const devices = json.devices ?? [];
        const match = devices.find((device) => device.current)
          ?? devices.find((device) =>
            [device.id, device.serial, device.avd].some((id) => id && id === locked),
          );
        if (match?.name) setLabel(match.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locked]);
  return label;
}

