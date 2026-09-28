import type { Appearance } from "@clerk/ui";
import type { Skin } from "./lib-experience";

// Clerk's supported appearance API keeps auth fields isolated from product CSS.
// Use literal colors matching globals.css, including contrast for the dark skins.
const palettes = {
  a15: {
    ink: "#27332e",
    surface: "#ffffff",
    accent: "#42695e",
    onAccent: "#ffffff",
    muted: "#62756b",
    soft: "#f0f5ec",
    line: "#dce5dd",
    radius: "8px",
    shadow: "0 10px 40px #304a3307",
  },
  b: {
    ink: "#302b47",
    surface: "#fffdf6",
    accent: "#5c4aad",
    onAccent: "#ffffff",
    muted: "#685775",
    soft: "#f1e8ff",
    line: "#302b47",
    radius: "8px",
    shadow: "7px 7px 0 #e8daff",
  },
  c: {
    ink: "#e6f1ea",
    surface: "#162428",
    accent: "#a8d8c3",
    onAccent: "#142d27",
    muted: "#a4b4b2",
    soft: "#20453d",
    line: "#496063",
    radius: "0px",
    shadow: "none",
  },
  t: {
    ink: "#d0e9dc",
    surface: "#10201b",
    accent: "#a1ebbc",
    onAccent: "#0a2719",
    muted: "#a7bdae",
    soft: "#193527",
    line: "#42614d",
    radius: "0px",
    shadow: "none",
  },
} as const;
const sans = 'Arial, "Hiragino Kaku Gothic ProN", sans-serif';
const mono = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

function appearance(skin: Skin): Appearance {
  const p = palettes[skin];
  return {
    variables: {
      colorPrimary: p.accent,
      colorPrimaryForeground: p.onAccent,
      colorForeground: p.ink,
      colorBackground: p.surface,
      colorInput: p.surface,
      colorInputForeground: p.ink,
      colorMuted: p.soft,
      colorMutedForeground: p.muted,
      colorNeutral: p.ink,
      colorBorder: p.line,
      colorRing: p.accent,
      fontFamily: skin === "t" ? mono : sans,
      fontSize: "14px",
      borderRadius: p.radius,
    },
    elements: {
      cardBox: { boxShadow: p.shadow, border: `1px solid ${p.line}` },
      headerTitle: {
        fontFamily:
          skin === "c"
            ? '"Yu Mincho", "Hiragino Mincho ProN", Georgia, serif'
            : skin === "t"
              ? mono
              : sans,
      },
      formFieldInput: { fontSize: "16px" },
      formButtonPrimary: {
        backgroundImage: "none",
        boxShadow: "none",
        minHeight: "42px",
      },
      socialButtonsBlockButton: { minHeight: "42px" },
      footer: { background: p.soft },
    },
  };
}

export const accountAppearance: Record<Skin, Appearance> = {
  a15: appearance("a15"),
  b: appearance("b"),
  c: appearance("c"),
  t: appearance("t"),
};
