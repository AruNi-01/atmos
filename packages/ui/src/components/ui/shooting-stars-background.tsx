"use client";

import { cn } from "../../lib/utils";
import { useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

function useMonoInk(): string {
  const [ink, setInk] = useState("#ffffff");

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      setInk(root.classList.contains("dark") ? "#ffffff" : "#000000");
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return ink;
}

function hexWithAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) {
    return hex;
  }
  const normalize = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const r = Number.parseInt(normalize.slice(1, 3), 16);
  const g = Number.parseInt(normalize.slice(3, 5), 16);
  const b = Number.parseInt(normalize.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type ShootingStar = {
  id: number;
  x: number;
  y: number;
  angle: number;
  scale: number;
  speed: number;
  distance: number;
};

export type ShootingStarsProps = {
  minSpeed?: number;
  maxSpeed?: number;
  minDelay?: number;
  maxDelay?: number;
  starColor?: string;
  trailColor?: string;
  starWidth?: number;
  starHeight?: number;
  className?: string;
};

function randomStartPoint(width: number, height: number) {
  const side = Math.floor(Math.random() * 4);
  switch (side) {
    case 0:
      return { x: Math.random() * width, y: 0, angle: 45 };
    case 1:
      return { x: width, y: Math.random() * height, angle: 135 };
    case 2:
      return { x: Math.random() * width, y: height, angle: 225 };
    case 3:
      return { x: 0, y: Math.random() * height, angle: 315 };
    default:
      return { x: 0, y: 0, angle: 45 };
  }
}

export function ShootingStars({
  minSpeed = 10,
  maxSpeed = 30,
  minDelay = 1200,
  maxDelay = 4200,
  starColor,
  trailColor,
  starWidth = 10,
  starHeight = 1,
  className,
}: ShootingStarsProps) {
  const ink = useMonoInk();
  const resolvedStarColor = starColor ?? ink;
  const resolvedTrailColor = trailColor ?? ink;
  const prefersReducedMotion = useReducedMotion();
  const [star, setStar] = useState<ShootingStar | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = useId().replace(/:/g, "");

  useEffect(() => {
    if (prefersReducedMotion) {
      setStar(null);
      return;
    }

    let cancelled = false;
    let timeoutId = 0;

    const createStar = () => {
      if (cancelled) return;
      const svg = svgRef.current;
      const width = svg?.clientWidth ?? 0;
      const height = svg?.clientHeight ?? 0;
      if (width < 2 || height < 2) {
        timeoutId = window.setTimeout(createStar, 400);
        return;
      }

      const { x, y, angle } = randomStartPoint(width, height);
      setStar({
        id: Date.now(),
        x,
        y,
        angle,
        scale: 1,
        speed: Math.random() * (maxSpeed - minSpeed) + minSpeed,
        distance: 0,
      });
      timeoutId = window.setTimeout(
        createStar,
        Math.random() * (maxDelay - minDelay) + minDelay,
      );
    };

    createStar();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [maxDelay, maxSpeed, minDelay, minSpeed, prefersReducedMotion]);

  useEffect(() => {
    if (!star || prefersReducedMotion) return;

    const moveStar = () => {
      setStar((prevStar) => {
        if (!prevStar) return null;
        const width = svgRef.current?.clientWidth ?? 0;
        const height = svgRef.current?.clientHeight ?? 0;
        const newX =
          prevStar.x + prevStar.speed * Math.cos((prevStar.angle * Math.PI) / 180);
        const newY =
          prevStar.y + prevStar.speed * Math.sin((prevStar.angle * Math.PI) / 180);
        const newDistance = prevStar.distance + prevStar.speed;
        if (
          newX < -20 ||
          newX > width + 20 ||
          newY < -20 ||
          newY > height + 20
        ) {
          return null;
        }
        return {
          ...prevStar,
          x: newX,
          y: newY,
          distance: newDistance,
          scale: 1 + newDistance / 100,
        };
      });
    };

    const animationFrame = requestAnimationFrame(moveStar);
    return () => cancelAnimationFrame(animationFrame);
  }, [prefersReducedMotion, star]);

  return (
    <svg
      ref={svgRef}
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      aria-hidden="true"
    >
      {star ? (
        <rect
          key={star.id}
          x={star.x}
          y={star.y}
          width={starWidth * star.scale}
          height={starHeight}
          fill={`url(#${gradientId})`}
          transform={`rotate(${star.angle}, ${
            star.x + (starWidth * star.scale) / 2
          }, ${star.y + starHeight / 2})`}
        />
      ) : null}
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={resolvedTrailColor} stopOpacity={0} />
          <stop offset="100%" stopColor={resolvedStarColor} stopOpacity={1} />
        </linearGradient>
      </defs>
    </svg>
  );
}

type Star = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  twinkleSpeed: number | null;
};

export type StarsBackgroundProps = {
  starDensity?: number;
  allStarsTwinkle?: boolean;
  twinkleProbability?: number;
  minTwinkleSpeed?: number;
  maxTwinkleSpeed?: number;
  starColor?: string;
  className?: string;
};

export function StarsBackground({
  starDensity = 0.00015,
  allStarsTwinkle = true,
  twinkleProbability = 0.7,
  minTwinkleSpeed = 0.5,
  maxTwinkleSpeed = 1,
  starColor,
  className,
}: StarsBackgroundProps) {
  const ink = useMonoInk();
  const resolvedStarColor = starColor ?? ink;
  const prefersReducedMotion = useReducedMotion();
  const [stars, setStars] = useState<Star[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateStars = useCallback(
    (width: number, height: number): Star[] => {
      const area = width * height;
      const numStars = Math.floor(area * starDensity);
      return Array.from({ length: numStars }, () => {
        const shouldTwinkle =
          !prefersReducedMotion &&
          (allStarsTwinkle || Math.random() < twinkleProbability);
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          radius: Math.random() * 0.05 + 0.5,
          opacity: Math.random() * 0.5 + 0.5,
          twinkleSpeed: shouldTwinkle
            ? minTwinkleSpeed + Math.random() * (maxTwinkleSpeed - minTwinkleSpeed)
            : null,
        };
      });
    },
    [
      allStarsTwinkle,
      maxTwinkleSpeed,
      minTwinkleSpeed,
      prefersReducedMotion,
      starDensity,
      twinkleProbability,
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateStars = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      setStars(generateStars(width, height));
    };

    updateStars();
    const resizeObserver = new ResizeObserver(updateStars);
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [generateStars]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const star of stars) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(resolvedStarColor, star.opacity);
        ctx.fill();
        if (star.twinkleSpeed !== null) {
          star.opacity =
            0.5 + Math.abs(Math.sin((Date.now() * 0.001) / star.twinkleSpeed) * 0.5);
        }
      }
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [resolvedStarColor, stars]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      aria-hidden="true"
    />
  );
}

export type ShootingStarsBackgroundProps = ShootingStarsProps &
  StarsBackgroundProps;

export function ShootingStarsBackground({
  className,
  starColor,
  trailColor,
  minSpeed,
  maxSpeed,
  minDelay,
  maxDelay,
  starWidth,
  starHeight,
  starDensity,
  allStarsTwinkle,
  twinkleProbability,
  minTwinkleSpeed,
  maxTwinkleSpeed,
}: ShootingStarsBackgroundProps) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      <StarsBackground
        starColor={starColor}
        starDensity={starDensity}
        allStarsTwinkle={allStarsTwinkle}
        twinkleProbability={twinkleProbability}
        minTwinkleSpeed={minTwinkleSpeed}
        maxTwinkleSpeed={maxTwinkleSpeed}
      />
      <ShootingStars
        starColor={starColor}
        trailColor={trailColor}
        minSpeed={minSpeed}
        maxSpeed={maxSpeed}
        minDelay={minDelay}
        maxDelay={maxDelay}
        starWidth={starWidth}
        starHeight={starHeight}
      />
    </div>
  );
}
