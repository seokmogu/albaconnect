import type { SVGAttributes } from "react";

export type IconWeight = "thin" | "light" | "regular" | "bold" | "fill";
export type IconSize = 16 | 20 | 24 | 32 | 48 | number;

export interface IconProps
  extends Omit<SVGAttributes<SVGSVGElement>, "children" | "color"> {
  size?: IconSize;
  weight?: IconWeight;
  color?: string;
}

// All 92 icon names. Keep in sync with scripts/generate.ts ICON_NAMES.
export type IconName =
  // people / team (10)
  | "user"
  | "users"
  | "user-circle"
  | "user-check"
  | "user-plus"
  | "identification-card"
  | "address-book"
  | "user-list"
  | "users-three"
  | "user-gear"
  // role / company (8)
  | "briefcase"
  | "building"
  | "buildings"
  | "storefront"
  | "factory"
  | "suitcase"
  | "house"
  | "house-simple"
  // resume / document (10)
  | "file-text"
  | "file-doc"
  | "file-pdf"
  | "note"
  | "notepad"
  | "notebook"
  | "paperclip"
  | "bookmark"
  | "bookmark-simple"
  | "archive"
  // search / filter (8)
  | "magnifying-glass"
  | "funnel"
  | "sliders-horizontal"
  | "tag"
  | "list-magnifying-glass"
  | "sort-ascending"
  | "sort-descending"
  | "list-bullets"
  // action / share (10)
  | "paper-plane-tilt"
  | "share-network"
  | "heart"
  | "star"
  | "thumbs-up"
  | "check"
  | "pencil-simple"
  | "trash"
  | "export"
  | "download-simple"
  // ai / recommend (6)
  | "sparkle"
  | "magic-wand"
  | "robot"
  | "lightning"
  | "lightbulb"
  | "brain"
  // interview / schedule (8)
  | "calendar"
  | "calendar-check"
  | "calendar-blank"
  | "clock"
  | "hourglass"
  | "video-camera"
  | "microphone"
  | "timer"
  // notification / status (8)
  | "bell"
  | "check-circle"
  | "x-circle"
  | "warning"
  | "info"
  | "question"
  | "seal-check"
  | "chat-circle-dots"
  // navigation / dashboard (6)
  | "gear"
  | "chart-bar"
  | "chart-line"
  | "chart-pie"
  | "squares-four"
  | "list"
  // arrow / direction (10)
  | "arrow-right"
  | "arrow-left"
  | "arrow-up"
  | "arrow-down"
  | "caret-right"
  | "caret-left"
  | "caret-down"
  | "caret-up"
  | "plus"
  | "x"
  // communication / link (4)
  | "envelope"
  | "phone"
  | "link"
  | "at"
  // security / account (4)
  | "lock"
  | "key"
  | "shield"
  | "sign-out";
