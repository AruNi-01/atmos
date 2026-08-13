"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, WheelEvent } from "react";

import {
  encodeSimulatorInput,
  normalizePointer,
  parseConfigFrame,
  streamAvccUrl,
  streamMjpegUrl,
  streamWsUrl,
} from "@/features/simulator/lib/simulator-stream-client";
import { hidUsageForDomKey, HID_LEFT_SHIFT } from "@/features/simulator/lib/hid";
import { cn } from "@/shared/lib/utils";

type SimulatorScreenProps = {
  streamBaseUrl: string | null;
  codec: "h264" | "mjpeg" | null;
  transport: "http" | "webrtc" | null;
  size: { width: number; height: number } | null;
  disabled?: boolean;
  onFirstFrame?: () => void;
  className?: string;
};

export function SimulatorScreen({
  streamBaseUrl,
  codec,
  size,
  disabled = false,
  onFirstFrame,
  className,
}: SimulatorScreenProps) {
  const socketRef = useRef<WebSocket | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const frameNotifiedRef = useRef(false);
  const [frameStreamUrl, setFrameStreamUrl] = useState<string | null>(null);
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState(size);

  useEffect(() => {
    if (size?.width && size?.height) setFrameSize(size);
  }, [size]);

  const markFirstFrame = useCallback(() => {
    setFrameStreamUrl(streamBaseUrl);
    if (frameNotifiedRef.current) return;
    frameNotifiedRef.current = true;
    onFirstFrame?.();
  }, [onFirstFrame, streamBaseUrl]);

  useEffect(() => {
    frameNotifiedRef.current = false;
    socketRef.current?.close();
    socketRef.current = null;
    if (!streamBaseUrl || typeof WebSocket === "undefined") return;

    const socket = new WebSocket(streamWsUrl(streamBaseUrl));
    socket.binaryType = "arraybuffer";
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const parsed = parseConfigFrame(event.data);
      if (parsed?.width && parsed?.height) {
        setFrameSize({ width: parsed.width, height: parsed.height });
      }
    };
    socketRef.current = socket;

    return () => {
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [codec, streamBaseUrl]);

  const sendInput = useCallback((input: Parameters<typeof encodeSimulatorInput>[0]) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      encodeSimulatorInput(input) as unknown as ArrayBufferView<ArrayBuffer>,
    );
  }, []);

  const pointerPosition = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      try {
        return normalizePointer(
          event.clientX,
          event.clientY,
          event.currentTarget.getBoundingClientRect(),
        );
      } catch {
        return null;
      }
    },
    [],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    const point = pointerPosition(event);
    if (point) sendInput({ op: "touch", type: "begin", ...point });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const point = pointerPosition(event);
    if (point) sendInput({ op: "touch", type: "move", ...point });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const point = pointerPosition(event);
    if (point) sendInput({ op: "touch", type: "end", ...point });
    pointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    const point = pointerPosition(event as unknown as PointerEvent<HTMLDivElement>);
    if (point) {
      sendInput({
        op: "scroll",
        dx: event.deltaX,
        dy: event.deltaY,
        ...point,
      });
    }
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>, type: "down" | "up") => {
    if (disabled || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const hid = hidUsageForDomKey(event.key);
    if (!hid) return;
    event.preventDefault();
    if (type === "down") {
      if (hid.shift) sendInput({ op: "key", type: "down", usage: HID_LEFT_SHIFT });
      sendInput({ op: "key", type: "down", usage: hid.usage });
      return;
    }
    sendInput({ op: "key", type: "up", usage: hid.usage });
    if (hid.shift) sendInput({ op: "key", type: "up", usage: HID_LEFT_SHIFT });
  };

  const hasFrame = streamBaseUrl !== null && frameStreamUrl === streamBaseUrl;
  const showVideo = codec === "h264" && videoStreamUrl === streamBaseUrl;
  const aspectRatio = frameSize
    ? `${frameSize.width} / ${frameSize.height}`
    : "9 / 19.5";

  return (
    <div
      className={cn(
        "pointer-events-auto relative w-full overflow-hidden rounded-[1.75rem] touch-none outline-none",
        className,
      )}
      style={{ aspectRatio }}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onKeyDown={(event) => handleKey(event, "down")}
      onKeyUp={(event) => handleKey(event, "up")}
    >
      {!hasFrame ? (
        <div
          className="absolute inset-0 aspect-[9/19.5] rounded-[2rem] bg-muted/40"
          aria-hidden="true"
        />
      ) : null}
      {streamBaseUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`absolute inset-0 h-full w-full object-contain pointer-events-auto ${
              showVideo ? "opacity-0" : "opacity-100"
            }`}
            src={streamMjpegUrl(streamBaseUrl)}
            alt=""
            onLoad={() => {
              markFirstFrame();
            }}
          />
          {codec === "h264" ? (
            <video
              className={`absolute inset-0 h-full w-full object-contain pointer-events-auto ${
                showVideo ? "opacity-100" : "opacity-0"
              }`}
              src={streamAvccUrl(streamBaseUrl)}
              muted
              autoPlay
              playsInline
              onLoadedData={() => {
                setVideoStreamUrl(streamBaseUrl);
                markFirstFrame();
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export type { SimulatorScreenProps };
