"use client";

import type { ReactNode } from "react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
  mobileSubtitle?: "hidden" | "visible";
};

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  mobileSubtitle = "hidden",
}: PageHeaderProps) {
  return (
    <section
      className={cn(
        "mb-6 flex flex-col gap-4 sm:mb-7",
        Boolean(actions) && "sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">{title}</h1>
        {subtitle ? (
          <p
            className={cn(
              "mt-1.5 text-sm text-slate-500",
              mobileSubtitle === "hidden" ? "hidden sm:block" : "block",
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center sm:justify-end">
          {actions}
        </div>
      ) : null}
    </section>
  );
}
