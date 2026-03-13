import { useEffect } from "react";

export default function ViewportHeightFix() {
  useEffect(() => {
    let raf = 0;

    const apply = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = window.visualViewport?.height ?? window.innerHeight;
        const vh = h * 0.01;
        document.documentElement.style.setProperty("--app-vh", `${vh}px`);
      });
    };

    const vv = window.visualViewport;

    apply();
    // iOS a veces “asienta” el viewport tras 1-2 ticks
    setTimeout(apply, 50);
    setTimeout(apply, 250);

    window.addEventListener("resize", apply, { passive: true });
    window.addEventListener("orientationchange", apply, { passive: true });
    vv?.addEventListener("resize", apply, { passive: true });
    vv?.addEventListener("scroll", apply, { passive: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
    };
  }, []);

  return null;
}