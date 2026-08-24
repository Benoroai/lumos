"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Keeps a text filter in the URL without a navigation on every keystroke.
 * The URL is the source of truth so filtered views stay shareable and the
 * server can paginate against them.
 */
export function useDebouncedSearchParam(
  key: string,
  delay = 350,
): [string, (value: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = searchParams.get(key) ?? "";
  const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(searchParams.get(key) ?? "");
  }, [searchParams, key]);

  useEffect(() => {
    const current = searchParams.get(key) ?? "";
    if (value === current) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, key, delay, pathname, router, searchParams]);

  return [value, setValue];
}
