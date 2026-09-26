"use client";

import Link from "next/link";
import { Theme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import { matchaTheme } from "@astryxdesign/theme-matcha/built";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Theme theme={matchaTheme}>
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}
