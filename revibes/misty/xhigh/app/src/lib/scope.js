// What generated UI code can reference when it is rendered: React, its hooks, and
// lucide-react icons. The prompt lists a curated set of icons (PROMPT_ICONS); every
// lucide icon is in scope anyway so a slightly different pick still renders.
import React from "react";
import * as Lucide from "lucide-react";

export const PROMPT_ICONS = (
  "Search House Heart Star User Users Settings Bell Mail Phone MapPin Map Calendar Clock Camera Image " +
  "Music Headphones Play Pause SkipForward SkipBack Plus Minus X Check ChevronRight ChevronLeft ChevronDown " +
  "ChevronUp ArrowRight ArrowLeft ArrowUp ArrowDown Menu MoreHorizontal MoreVertical Pencil Edit Trash2 Share2 " +
  "Bookmark Book BookOpen Library ShoppingBag ShoppingCart CreditCard Tag Gift Filter SlidersHorizontal " +
  "LayoutGrid List Compass Navigation Mountain Trees TreePine Sun Moon Cloud Flame Leaf Flower Footprints " +
  "Bike Car Plane Coffee Utensils Pizza Apple Dumbbell Activity HeartPulse Pill Stethoscope Brain Smile " +
  "MessageCircle Send Link Globe Wifi Lock Eye Info AlertCircle HelpCircle Award Trophy Zap TrendingUp " +
  "BarChart PieChart Download Upload RefreshCw LogOut Briefcase GraduationCap Palette Film Mic Video Tv " +
  "Laptop Smartphone Watch Package Store Building Sparkles ThumbsUp Flag Circle"
).split(" ");

const allowShadow = new Set(PROMPT_ICONS);
export const ICONS = {};
for (const [name, value] of Object.entries(Lucide)) {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name) || name.endsWith("Icon") || name.startsWith("Lucide")) continue;
  if (!value || (typeof value !== "object" && typeof value !== "function")) continue;
  // skip icons that would shadow JS globals (Infinity, Proxy, ...) unless the prompt offers them
  if (name in globalThis && !allowShadow.has(name)) continue;
  ICONS[name] = value;
}

export const SCOPE = {
  React,
  Fragment: React.Fragment,
  useState: React.useState,
  useEffect: React.useEffect,
  useRef: React.useRef,
  useMemo: React.useMemo,
  useCallback: React.useCallback,
  ...ICONS,
};
export const SCOPE_KEYS = Object.keys(SCOPE);
export const SCOPE_VALUES = SCOPE_KEYS.map((k) => SCOPE[k]);
export const KNOWN_NAMES = new Set(SCOPE_KEYS);
