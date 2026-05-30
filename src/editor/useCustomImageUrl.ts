import { useEffect, useState } from "react";
import { getImageUrl, subscribeImageStore } from "../io/imageStore";

// Resolve a content-addressed image hash to a blob URL for preview, and
// re-resolve when the image store changes (e.g. after an upload). Returns
// null when no hash is set or while the URL is still resolving. The cancelled
// flag guards against a late promise resolving after the hash changed/unmounted.
export function useCustomImageUrl(hash: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!hash) {
      setUrl(null);
      return;
    }
    const refresh = () => {
      getImageUrl(hash).then((u) => {
        if (!cancelled) setUrl(u);
      });
    };
    refresh();
    const unsub = subscribeImageStore(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [hash]);
  return url;
}
