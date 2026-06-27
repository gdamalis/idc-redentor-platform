import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
// jsdom does not implement matchMedia or HTMLMediaElement playback; stub both.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ── jsdom stubs for HTMLMediaElement ──────────────────────────────────────────
// jsdom does not implement HTMLMediaElement playback; stub out what we need.
Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});
Object.defineProperty(HTMLMediaElement.prototype, "pause", {
  configurable: true,
  value: vi.fn(),
});
Object.defineProperty(HTMLMediaElement.prototype, "duration", {
  configurable: true,
  get: () => 0,
});
Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
  configurable: true,
  get: () => 0,
  set: vi.fn(),
});
Object.defineProperty(HTMLMediaElement.prototype, "playbackRate", {
  configurable: true,
  get: () => 1,
  set: vi.fn(),
});

// ── next-intl mock ────────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// ── framer-motion mock ────────────────────────────────────────────────────────
// Renders children directly; avoids animation-related DOM quirks in jsdom.
// Framer-motion mock: strip motion-only props (whileTap, initial, animate, exit,
// transition, whileInView, viewport) before forwarding to real DOM elements.
// We collect them all into `rest` via a type cast and forward only DOM-safe props.

function stripMotionProps<T extends Record<string, unknown>>(
  props: T,
): Record<string, unknown> {
  const {
    whileTap: _a,
    initial: _b,
    animate: _c,
    exit: _d,
    transition: _e,
    whileInView: _f,
    viewport: _g,
    ...domProps
  } = props;
  void _a; void _b; void _c; void _d; void _e; void _f; void _g;
  return domProps;
}

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) => (
      <button {...(stripMotionProps(rest) as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
        {children}
      </button>
    ),
    span: ({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) => (
      <span {...(stripMotionProps(rest) as React.HTMLAttributes<HTMLSpanElement>)}>
        {children}
      </span>
    ),
    div: ({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) => (
      <div {...(stripMotionProps(rest) as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useReducedMotion: () => false,
}));

import React from "react";
import { SermonAudioPlayer, formatTime } from "./SermonAudioPlayer";

// ─────────────────────────────────────────────────────────────────────────────
// formatTime helper
// ─────────────────────────────────────────────────────────────────────────────

describe("formatTime", () => {
  it("formats 0 seconds as 0:00", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  it("formats 65 seconds as 1:05", () => {
    expect(formatTime(65)).toBe("1:05");
  });

  it("formats 3600 seconds as 60:00", () => {
    expect(formatTime(3600)).toBe("60:00");
  });

  it("formats 90 seconds as 1:30", () => {
    expect(formatTime(90)).toBe("1:30");
  });

  it("pads single-digit seconds with leading zero", () => {
    expect(formatTime(61)).toBe("1:01");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SermonAudioPlayer component
// ─────────────────────────────────────────────────────────────────────────────

const defaultProps = {
  src: "https://example.com/sermon.mp3",
  title: "Gracia suficiente",
};

describe("SermonAudioPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a hidden <audio> element without the native controls attribute", () => {
    const { container } = render(<SermonAudioPlayer {...defaultProps} />);
    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio).not.toHaveAttribute("controls");
    expect(audio).toHaveClass("hidden");
  });

  it("renders a play button with a localized aria-label", () => {
    render(<SermonAudioPlayer {...defaultProps} />);
    // useTranslations returns the key itself in mock
    const playBtn = screen.getByRole("button", { name: /play/i });
    expect(playBtn).toBeDefined();
  });

  it("renders a time scrubber input of type range", () => {
    const { container } = render(<SermonAudioPlayer {...defaultProps} />);
    const scrubber = container.querySelector('input[type="range"]');
    expect(scrubber).not.toBeNull();
    expect(scrubber).toHaveAttribute("min", "0");
  });

  it("renders a time readout in mm:ss / mm:ss format", () => {
    render(<SermonAudioPlayer {...defaultProps} />);
    // With 0 duration the readout should be 0:00 / 0:00
    expect(screen.getByText(/0:00\s*\/\s*0:00/)).toBeDefined();
  });

  it("renders a speed button", () => {
    render(<SermonAudioPlayer {...defaultProps} />);
    // speed button shows current playback rate as text, e.g. "1x"
    expect(screen.getByText("1x")).toBeDefined();
  });

  it("seeds the total duration from durationSeconds prop", () => {
    render(
      <SermonAudioPlayer {...defaultProps} durationSeconds={90} />,
    );
    // total time should show 1:30 initially
    expect(screen.getByText(/0:00\s*\/\s*1:30/)).toBeDefined();
  });

  it("uses localized aria-labels from Sermons namespace", () => {
    render(<SermonAudioPlayer {...defaultProps} />);
    // The mock returns the key string; play button label = "play"
    expect(screen.getByRole("button", { name: "play" })).toBeDefined();
  });

  it("renders the speed button with accessible label", () => {
    render(<SermonAudioPlayer {...defaultProps} />);
    expect(screen.getByRole("button", { name: "speed" })).toBeDefined();
  });
});
