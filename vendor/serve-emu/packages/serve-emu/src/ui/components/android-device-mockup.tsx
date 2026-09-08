import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AndroidMockup, AndroidTabMockup } from "react-device-mockup";
import { apiRequest } from "../lib/api-client";
import { fitAndroidMockupScreen } from "../lib/android-mockup-layout";
import { useDeviceSessionSnapshot } from "../lib/device-session-store";
import type { DeviceSize } from "../lib/use-stream";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const FALLBACK_SIZE: DeviceSize = { width: 1080, height: 2340 };
const FRAME_COLOR = "#1c1c1e";

function useHideNavBar(): boolean {
  const session = useDeviceSessionSnapshot();
  const [hideNavBar, setHideNavBar] = useState(true);

  useEffect(() => {
    if (session.transitioning) return;
    const controller = new AbortController();
    void apiRequest("/api/display-chrome", {
      method: "GET",
      signal: controller.signal,
    })
      .then((response) => {
        setHideNavBar(response.hasNavBar);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [session.revision, session.transitioning]);

  return hideNavBar;
}

type Props = {
  deviceSize: DeviceSize | null;
  children: ReactNode;
};

export function AndroidDeviceMockup({ deviceSize, children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hideNavBar = useHideNavBar();
  const size = deviceSize ?? FALLBACK_SIZE;
  const [fitted, setFitted] = useState(() =>
    fitAndroidMockupScreen(280, 560, size.width, size.height),
  );

  useIsoLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const box = host.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      setFitted(fitAndroidMockupScreen(box.width, box.height, size.width, size.height));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [size.width, size.height]);

  const style = {
    "--mockup-screen-width": `${fitted.screenWidth}px`,
    "--mockup-screen-height": `${fitted.screenHeight}px`,
  } as CSSProperties;

  const mockupProps = {
    screenWidth: fitted.screenWidth,
    isLandscape: fitted.isLandscape,
    hideStatusBar: true,
    hideNavBar,
    transparentNavBar: !hideNavBar,
    frameColor: FRAME_COLOR,
    navBarColor: "transparent",
    className: "android-device-mockup hide-camera",
    containerStlye: style,
  } as const;

  return (
    <div
      ref={hostRef}
      className="android-device-frame-host"
      data-atmos-android-mockup=""
      data-hide-camera="true"
      data-hide-nav={hideNavBar ? "true" : "false"}
    >
      {fitted.isTablet ? (
        <AndroidTabMockup {...mockupProps}>{children}</AndroidTabMockup>
      ) : (
        <AndroidMockup {...mockupProps} transparentCamArea>
          {children}
        </AndroidMockup>
      )}
    </div>
  );
}
