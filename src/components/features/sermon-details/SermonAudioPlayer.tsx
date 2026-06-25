"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { PlayIcon, PauseIcon } from "@heroicons/react/24/solid";
import { trackEvent } from "@src/lib/analytics";

const SPEED_STEPS = [1, 1.25, 1.5, 2] as const;
type SpeedStep = (typeof SPEED_STEPS)[number];

/** Formats seconds to "m:ss" (e.g. 65 → "1:05", 3600 → "60:00"). */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface SermonAudioPlayerProps {
  src: string;
  title: string;
  durationSeconds?: number;
}

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  speed: SpeedStep;
  hasStartedPlaying: boolean;
}

export function SermonAudioPlayer({
  src,
  title,
  durationSeconds,
}: Readonly<SermonAudioPlayerProps>) {
  const t = useTranslations("Sermons");
  const audioRef = useRef<HTMLAudioElement>(null);

  // framer-motion's hook reads the OS preference and re-renders when it changes.
  // Returns null on the server, false when not set, true when reduced motion is on.
  const shouldReduceMotion = useReducedMotion();

  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: durationSeconds ?? 0,
    isBuffering: false,
    speed: 1,
    hasStartedPlaying: false,
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setState((prev) => ({ ...prev, duration: audio.duration }));
    };
    const handleTimeUpdate = () => {
      setState((prev) => ({ ...prev, currentTime: audio.currentTime }));
    };
    const handlePlay = () => {
      setState((prev) => ({ ...prev, isPlaying: true, isBuffering: false }));
    };
    const handlePause = () => {
      setState((prev) => ({ ...prev, isPlaying: false }));
    };
    const handleEnded = () => {
      setState((prev) => ({
        ...prev,
        isPlaying: false,
        currentTime: 0,
        hasStartedPlaying: false,
      }));
      audio.currentTime = 0;
    };
    const handleWaiting = () => {
      setState((prev) => ({ ...prev, isBuffering: true }));
    };
    const handlePlaying = () => {
      setState((prev) => ({ ...prev, isBuffering: false }));
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
    };
  }, []);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play();
      if (!state.hasStartedPlaying) {
        setState((prev) => ({ ...prev, hasStartedPlaying: true }));
        trackEvent("sermon_play", { slug: title });
      }
    } else {
      audio.pause();
    }
  }, [state.hasStartedPlaying, title]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const audio = audioRef.current;
      if (!audio) return;
      const newTime = Number(e.target.value);
      audio.currentTime = newTime;
      setState((prev) => ({ ...prev, currentTime: newTime }));
    },
    [],
  );

  const handleSpeedCycle = useCallback(() => {
    const audio = audioRef.current;
    const currentIndex = SPEED_STEPS.indexOf(state.speed);
    const nextSpeed = SPEED_STEPS[(currentIndex + 1) % SPEED_STEPS.length];
    if (audio) audio.playbackRate = nextSpeed;
    setState((prev) => ({ ...prev, speed: nextSpeed }));
  }, [state.speed]);

  const { isPlaying, currentTime, duration, isBuffering, speed } = state;

  // Animation variants: disabled when OS requests reduced motion
  const iconTransition = shouldReduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 700, damping: 20 };
  const iconInitial = shouldReduceMotion ? false : { scale: 0 };
  const iconExit = shouldReduceMotion ? undefined : { scale: 0 };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4">
      {/* Hidden native audio element — custom controls handle everything */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
      />

      {/* Buffering status (screen-reader live region) */}
      {isBuffering && (
        <span aria-live="polite" className="sr-only">
          {t("status.sr-loading" as Parameters<typeof t>[0])}
        </span>
      )}

      {/* Controls row */}
      <div className="flex items-center gap-3">
        {/* Play / Pause */}
        <motion.button
          type="button"
          onClick={handlePlayPause}
          aria-label={t(isPlaying ? "pause" : "play")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
          whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isPlaying ? (
              <motion.span
                key="pause"
                initial={iconInitial}
                animate={{ scale: 1 }}
                exit={iconExit}
                transition={iconTransition}
                className="inline-flex"
              >
                <PauseIcon className="h-4 w-4" />
              </motion.span>
            ) : (
              <motion.span
                key="play"
                initial={iconInitial}
                animate={{ scale: 1 }}
                exit={iconExit}
                transition={iconTransition}
                className="inline-flex"
              >
                <PlayIcon className="h-4 w-4" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          step={1}
          aria-label={t("seek")}
          onChange={handleSeek}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary"
        />

        {/* Time readout */}
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Speed cycle */}
        <button
          type="button"
          onClick={handleSpeedCycle}
          aria-label={t("speed")}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          {speed}x
        </button>
      </div>
    </div>
  );
}
