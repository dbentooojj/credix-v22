"use client";

import { useEffect } from "react";

let activeLocks = 0;
let lockedScrollY = 0;

function applyLock() {
  if (typeof window === "undefined") return;

  const html = document.documentElement;
  const body = document.body;

  lockedScrollY = window.scrollY || window.pageYOffset || 0;

  html.style.overflow = "hidden";
  html.style.overscrollBehavior = "none";

  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";
  body.style.position = "fixed";
  body.style.top = `-${lockedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.touchAction = "none";
}

function releaseLock() {
  if (typeof window === "undefined") return;

  const html = document.documentElement;
  const body = document.body;
  const top = body.style.top;

  html.style.overflow = "";
  html.style.overscrollBehavior = "";

  body.style.overflow = "";
  body.style.overscrollBehavior = "";
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  body.style.touchAction = "";

  const restoredY = top ? Math.abs(parseInt(top, 10)) : lockedScrollY;
  window.scrollTo(0, Number.isFinite(restoredY) ? restoredY : 0);
}

function lockScroll() {
  if (activeLocks === 0) applyLock();
  activeLocks += 1;
}

function unlockScroll() {
  if (activeLocks === 0) return;
  activeLocks -= 1;
  if (activeLocks === 0) releaseLock();
}

export function useGlobalScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockScroll();
    return () => unlockScroll();
  }, [active]);
}

