import { icons } from 'lucide-react';

// The list of lucide icons named in the prompts (the paper elides its own list).
export const AVAILABLE_ICONS = [
  'Activity', 'AlarmClock', 'Archive', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Award',
  'BarChart2', 'Battery', 'Bell', 'Bike', 'Book', 'BookOpen', 'Bookmark', 'Briefcase', 'Calendar',
  'Camera', 'Car', 'Check', 'ChevronDown', 'ChevronLeft', 'ChevronRight', 'ChevronUp', 'Circle',
  'Clock', 'Cloud', 'Coffee', 'Compass', 'CreditCard', 'Download', 'Droplet', 'Edit', 'Ellipsis',
  'ExternalLink', 'Eye', 'Feather', 'Film', 'Filter', 'Flag', 'Flame', 'Folder', 'Gift', 'Globe',
  'Grid2x2', 'Headphones', 'Heart', 'Home', 'Image', 'Info', 'Laptop', 'Layers', 'LayoutGrid',
  'Leaf', 'Link', 'List', 'Lock', 'Mail', 'Map', 'MapPin', 'Menu', 'MessageCircle', 'Mic', 'Minus',
  'Moon', 'Mountain', 'Music', 'Navigation', 'Package', 'Palette', 'Pencil', 'Phone', 'Play', 'Plus',
  'Radio', 'Search', 'Send', 'Settings', 'Share', 'Shield', 'ShoppingBag', 'ShoppingCart', 'Sliders',
  'Smartphone', 'Sparkles', 'Star', 'Sun', 'Tag', 'Tent', 'ThumbsUp', 'Trash2', 'TreePine',
  'TrendingUp', 'Trophy', 'Tv', 'Umbrella', 'User', 'Users', 'Video', 'Wallet', 'Wifi', 'X', 'Zap',
].filter((name) => icons[name]);

// JSX names used in the code that resolve to a lucide icon. react-live turns its
// scope into function arguments, so only pass the ones the code needs.
export function iconScope(code) {
  const scope = {};
  for (const [, name] of code.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
    if (icons[name]) scope[name] = icons[name];
  }
  for (const [, name] of code.matchAll(/\b(?:icon|Icon)\s*[:=]\s*\{?\s*([A-Z][A-Za-z0-9]*)/g)) {
    if (icons[name]) scope[name] = icons[name];
  }
  return scope;
}

export const isKnownIcon = (name) => Boolean(icons[name]);
