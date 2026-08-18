"use client";

import * as React from "react";
import Link from "next/link";
import { GeistPixelSquare } from "geist/font/pixel";
import { useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";

type BreakoutErrorKind = "notFound" | "server";
type GameStatus = "ready" | "playing" | "won" | "lost";

type BreakoutErrorPageProps = {
  kind: BreakoutErrorKind;
  className?: string;
  errorMessage?: string;
  onRetry?: () => void;
};

type Brick = {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  tone: number;
};

type Game = {
  width: number;
  height: number;
  bricks: Brick[];
  ballX: number;
  ballY: number;
  ballDx: number;
  ballDy: number;
  ballSize: number;
  paddleX: number;
  paddleY: number;
  paddleWidth: number;
  paddleHeight: number;
  lives: number;
  status: GameStatus;
  lastTime: number;
};

const BRICK_ROWS = [
  [0, 2, 3, 4, 6, 7, 8, 9, 10, 11, 13, 14, 15],
  [1, 2, 3, 5, 6, 7, 8, 11, 12, 13, 14],
  [0, 4, 5, 6, 7, 8, 9, 12, 13, 15],
  [0, 1, 2, 4, 7, 8, 10, 11, 12, 13, 14],
  [1, 3, 5, 6, 7, 8, 9, 10, 13, 14, 15],
  [0, 1, 4, 5, 8, 9, 12, 13, 14, 15],
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function buildBricks(width: number, height: number): Brick[] {
  const columnCount = 16;
  const gap = Math.max(8, Math.min(18, width * 0.009));
  const brickHeight = Math.max(18, Math.min(34, height * 0.032));
  const brickWidth = Math.max(46, (width - gap * (columnCount + 1)) / columnCount);
  const top = Math.max(26, height * 0.028);
  const bricks: Brick[] = [];

  BRICK_ROWS.forEach((columns, rowIndex) => {
    const rowOffset = rowIndex % 2 === 0 ? 0 : brickWidth * 0.36;
    const y = top + rowIndex * (brickHeight + gap * 0.9);

    columns.forEach((columnIndex) => {
      const x = gap + columnIndex * (brickWidth + gap) - rowOffset;
      if (x > width - gap || x + brickWidth < gap) return;

      bricks.push({
        x,
        y,
        width: brickWidth,
        height: brickHeight,
        active: true,
        tone: (rowIndex + columnIndex) % 4,
      });
    });
  });

  return bricks;
}

function createGame(width: number, height: number): Game {
  const paddleWidth = clamp(width * 0.11, 112, 230);
  const paddleHeight = clamp(height * 0.026, 18, 26);
  const bottomGap = clamp(height * 0.024, 16, 26);
  const paddleY = height - bottomGap - paddleHeight;

  return {
    width,
    height,
    bricks: buildBricks(width, height),
    ballX: width / 2,
    ballY: paddleY - 26,
    ballDx: width >= 900 ? 5.2 : 4.1,
    ballDy: width >= 900 ? -5.4 : -4.7,
    ballSize: clamp(width * 0.008, 9, 14),
    paddleX: (width - paddleWidth) / 2,
    paddleY,
    paddleWidth,
    paddleHeight,
    lives: 3,
    status: "ready",
    lastTime: 0,
  };
}

function resetBall(game: Game) {
  game.ballX = game.paddleX + game.paddleWidth / 2;
  game.ballY = game.paddleY - 24;
  game.ballDx = game.ballDx >= 0 ? Math.abs(game.ballDx) : -Math.abs(game.ballDx);
  game.ballDy = -Math.abs(game.ballDy || 5);
}

function resizeGame(current: Game, width: number, height: number): Game {
  const next = createGame(width, height);
  const progressByIndex = current.bricks.map((brick) => brick.active);

  next.bricks = next.bricks.map((brick, index) => ({
    ...brick,
    active: progressByIndex[index] ?? brick.active,
  }));
  next.status = current.status;
  next.lives = current.lives;
  next.ballDx = current.ballDx;
  next.ballDy = current.ballDy;
  next.paddleX = clamp(
    (current.paddleX / Math.max(current.width, 1)) * width,
    16,
    width - next.paddleWidth - 16,
  );

  if (current.status === "playing") {
    next.ballX = (current.ballX / Math.max(current.width, 1)) * width;
    next.ballY = (current.ballY / Math.max(current.height, 1)) * height;
  } else {
    resetBall(next);
  }

  return next;
}

function movePaddle(game: Game, x: number) {
  game.paddleX = clamp(x - game.paddleWidth / 2, 16, game.width - game.paddleWidth - 16);
  if (game.status !== "playing") {
    resetBall(game);
  }
}

function launch(gameRef: React.MutableRefObject<Game | null>) {
  const game = gameRef.current;
  if (!game) return;

  if (game.status === "won" || game.status === "lost") {
    gameRef.current = createGame(game.width, game.height);
    gameRef.current.status = "playing";
    return;
  }

  if (game.status === "ready") {
    game.status = "playing";
  }
}

function activeBrickCount(bricks: Brick[]) {
  return bricks.reduce((count, brick) => count + (brick.active ? 1 : 0), 0);
}

function drawGame(ctx: CanvasRenderingContext2D, game: Game, darkMode: boolean) {
  ctx.clearRect(0, 0, game.width, game.height);

  const brickColors = darkMode
    ? ["#242428", "#2b2b30", "#333339", "#3c3c42"]
    : ["#dcdcdc", "#d4d4d4", "#c9c9c9", "#bfbfbf"];
  for (const brick of game.bricks) {
    if (!brick.active) continue;
    ctx.fillStyle = brickColors[brick.tone] ?? brickColors[0];
    ctx.fillRect(Math.round(brick.x), Math.round(brick.y), Math.round(brick.width), Math.round(brick.height));
  }

  ctx.fillStyle = darkMode ? "#303036" : "#dedede";
  ctx.fillRect(
    Math.round(game.paddleX),
    Math.round(game.paddleY),
    Math.round(game.paddleWidth),
    Math.round(game.paddleHeight),
  );

  ctx.fillStyle = darkMode ? "#d9d9dd" : "#9f9f9f";
  ctx.fillRect(
    Math.round(game.ballX - game.ballSize / 2),
    Math.round(game.ballY - game.ballSize / 2),
    Math.round(game.ballSize),
    Math.round(game.ballSize),
  );
}

function stepGame(game: Game, frameScale: number) {
  if (game.status !== "playing") return;

  game.ballX += game.ballDx * frameScale;
  game.ballY += game.ballDy * frameScale;

  const radius = game.ballSize / 2;
  if (game.ballX <= radius || game.ballX >= game.width - radius) {
    game.ballDx = -game.ballDx;
    game.ballX = clamp(game.ballX, radius, game.width - radius);
  }
  if (game.ballY <= radius) {
    game.ballDy = Math.abs(game.ballDy);
    game.ballY = radius;
  }

  const ballBottom = game.ballY + radius;
  const ballTop = game.ballY - radius;
  const ballLeft = game.ballX - radius;
  const ballRight = game.ballX + radius;
  const paddleRight = game.paddleX + game.paddleWidth;

  if (
    game.ballDy > 0 &&
    ballBottom >= game.paddleY &&
    ballTop <= game.paddleY + game.paddleHeight &&
    ballRight >= game.paddleX &&
    ballLeft <= paddleRight
  ) {
    const paddleCenter = game.paddleX + game.paddleWidth / 2;
    const hit = clamp((game.ballX - paddleCenter) / (game.paddleWidth / 2), -1, 1);
    const speed = Math.min(9, Math.hypot(game.ballDx, game.ballDy) + 0.04);

    game.ballDx = hit * speed * 0.88;
    game.ballDy = -Math.sqrt(Math.max(speed * speed - game.ballDx * game.ballDx, 16));
    game.ballY = game.paddleY - radius - 1;
  }

  for (const brick of game.bricks) {
    if (!brick.active) continue;

    if (
      ballRight >= brick.x &&
      ballLeft <= brick.x + brick.width &&
      ballBottom >= brick.y &&
      ballTop <= brick.y + brick.height
    ) {
      brick.active = false;
      game.ballDy = -game.ballDy;

      if (activeBrickCount(game.bricks) === 0) {
        game.status = "won";
      }
      break;
    }
  }

  if (game.ballY - radius > game.height) {
    game.lives -= 1;
    if (game.lives <= 0) {
      game.status = "lost";
    } else {
      game.status = "ready";
      resetBall(game);
    }
  }
}

export function BreakoutErrorPage({
  kind,
  className,
  errorMessage,
  onRetry,
}: BreakoutErrorPageProps) {
  const t = useTranslations("app.errorBreakout");
  const code = kind === "notFound" ? "404" : "500";
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const gameRef = React.useRef<Game | null>(null);
  const frameRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const resize = () => {
      const width = Math.max(320, Math.round(window.innerWidth));
      const height = Math.max(520, Math.round(window.innerHeight));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      gameRef.current = gameRef.current
        ? resizeGame(gameRef.current, width, height)
        : createGame(width, height);
      drawGame(ctx, gameRef.current, document.documentElement.classList.contains("dark"));
    };

    const tick = (time: number) => {
      const game = gameRef.current;
      if (game) {
        const lastTime = game.lastTime || time;
        const frameScale = clamp((time - lastTime) / 16.67, 0.4, 2);
        game.lastTime = time;
        stepGame(game, frameScale);
        drawGame(ctx, game, document.documentElement.classList.contains("dark"));
      }

      frameRef.current = window.requestAnimationFrame(tick);
    };

    resize();
    frameRef.current = window.requestAnimationFrame(tick);
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const game = gameRef.current;
    if (!game) return;
    movePaddle(game, event.clientX);
  }, []);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const game = gameRef.current;
    if (!game) return;
    movePaddle(game, event.clientX);
    launch(gameRef);
  }, []);

  const stopActionPointer = React.useCallback((event: React.PointerEvent) => {
    event.stopPropagation();
  }, []);

  const homeButton =
    kind === "server" ? (
      <Button
        variant="ghost"
        data-error-action="home"
        // Native anchor, not next/link: a full document load leaves the
        // broken route even if reset() or the client router is wedged.
        render={<a href="/" onPointerDown={stopActionPointer} />}
      >
        {t("server.home")}
      </Button>
    ) : (
      <Button
        variant="default"
        data-error-action="home"
        render={<Link href="/" onPointerDown={stopActionPointer} />}
      >
        {t("notFound.home")}
      </Button>
    );

  const retryButton =
    kind === "server" && onRetry ? (
      <Button
        type="button"
        onClick={onRetry}
        onPointerDown={stopActionPointer}
        variant="default"
        data-error-action="retry"
      >
        {t("server.retry")}
      </Button>
    ) : null;

  return (
    <main
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      className={cn(
        "relative h-dvh w-screen overflow-hidden bg-[#fbfbfa] text-[#9d9d9d] dark:bg-[#09090b] dark:text-[#5f5f66]",
        "touch-none select-none [-webkit-font-smoothing:none] [font-variant-ligatures:none]",
        GeistPixelSquare.className,
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t(`canvasLabel.${kind}`)}
        className="pointer-events-none absolute inset-0 z-20 h-full w-full [image-rendering:pixelated]"
      />

      <section className="group pointer-events-auto absolute inset-x-4 top-[38%] z-10 flex -translate-y-1/2 flex-col items-center text-center sm:top-[54%]">
        <div className="text-[clamp(8rem,18vw,18rem)] font-normal leading-none text-[#ececec] transition-colors duration-150 group-hover:text-[#111112] dark:text-[#18181c] dark:group-hover:text-[#f5f5f7]">
          {code}
        </div>
        <h1 className="mt-5 max-w-[min(760px,calc(100vw-2rem))] text-[clamp(1rem,1.35vw,1.45rem)] font-normal leading-7 text-[#aaa] transition-colors duration-150 group-hover:text-[#111112] dark:text-[#5f5f66] dark:group-hover:text-[#f5f5f7]">
          {t(`${kind}.description`)}
        </h1>
        {kind === "server" && errorMessage ? (
          <p className="mt-3 max-w-[min(680px,calc(100vw-2rem))] truncate text-xs text-[#b8b8b8] transition-colors duration-150 group-hover:text-[#111112] dark:text-[#4f4f56] dark:group-hover:text-[#f5f5f7]">
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          {retryButton}
          {homeButton}
        </div>
      </section>
    </main>
  );
}
