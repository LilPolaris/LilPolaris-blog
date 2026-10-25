"use client";

import { ImageIcon, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { thumbnailUrl } from "@/lib/media-thumbnail";

/**
 * Lazy thumbnail with a placeholder while the protected proxy fetches the
 * image from GitHub, and a retry instead of a broken-image icon on failure.
 */
export function MediaThumb({
  src,
  alt,
  width = 360,
  retryable = true,
}: {
  src?: string;
  alt: string;
  width?: number;
  /** False inside clickable cards, where a nested button is not allowed. */
  retryable?: boolean;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // A cached image can finish before hydration attaches onLoad, which would
  // leave it hidden behind the placeholder forever.
  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    const timer = window.setTimeout(
      () => setState(image.naturalWidth ? "loaded" : "error"),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [attempt, src]);

  if (!src) return <ImageIcon aria-hidden="true" size={28} />;

  const url = thumbnailUrl(src, width);
  return (
    <span className={`media-thumb ${state}`}>
      {state === "error" && !retryable ? (
        <ImageIcon aria-label="图片加载失败" size={24} />
      ) : state === "error" ? (
        <button
          className="media-thumb-retry"
          onClick={() => {
            setState("loading");
            setAttempt((value) => value + 1);
          }}
          type="button"
        >
          <RotateCw size={14} />
          重新加载
        </button>
      ) : (
        // Authenticated media is served through the protected proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          decoding="async"
          key={attempt}
          loading="lazy"
          onError={() => setState("error")}
          onLoad={() => setState("loaded")}
          ref={imageRef}
          src={attempt ? `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}` : url}
        />
      )}
    </span>
  );
}
