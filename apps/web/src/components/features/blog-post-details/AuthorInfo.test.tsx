import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthorInfo } from "./AuthorInfo";

// next-intl requires a locale context; mock useLocale for unit tests
vi.mock("next-intl", () => ({
  useLocale: () => "es-AR",
}));

// next/image renders an <img> in test environments
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

const baseProps = {
  publishedDate: "2025-01-15",
};

const avatarDetails = {
  name: "Gabriel Damalis",
  avatar: { url: "https://example.com/avatar.jpg", title: "Gabriel avatar" },
};

const noAvatarDetails = {
  name: "Gabriel Damalis",
  avatar: undefined,
};

describe("AuthorInfo", () => {
  it("renders the avatar <img> when avatar is present", () => {
    render(
      <AuthorInfo
        authorDetails={avatarDetails}
        publishedDate={baseProps.publishedDate}
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", avatarDetails.avatar.url);
  });

  it("renders initials fallback when avatar is undefined — no crash", () => {
    render(
      <AuthorInfo
        authorDetails={noAvatarDetails}
        publishedDate={baseProps.publishedDate}
      />,
    );
    // Should show "GD" for "Gabriel Damalis"
    expect(screen.getByText("GD")).toBeDefined();
    // No img should be rendered
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders author name regardless of avatar presence", () => {
    render(
      <AuthorInfo
        authorDetails={noAvatarDetails}
        publishedDate={baseProps.publishedDate}
      />,
    );
    expect(screen.getByText("Gabriel Damalis")).toBeDefined();
  });
});
