import * as Lucide from "lucide-react";

// The prompt gives the model "a list of available lucide icon names". The paper does not
// say which ones; we send this curated list (to keep prompts short), but every lucide icon
// is in the render scope, so others still render.
const CURATED = `Activity AlarmClock AlignLeft Archive ArrowDown ArrowLeft ArrowRight ArrowUp ArrowUpRight AtSign Award
Backpack BadgeCheck Banknote BarChart3 Battery Bed Bell Bike Book BookOpen Bookmark Box Briefcase Brush Bus
Cake Calendar Camera Car Check CheckCircle ChevronDown ChevronLeft ChevronRight ChevronUp Circle Clock Cloud
CloudRain CloudSun Coffee Compass Copy CreditCard Crown Dumbbell Download Droplet Edit Edit2 Eye Facebook
FileText Film Filter Flag Flame Flower2 Folder Footprints Gamepad2 Gift Github Globe GraduationCap Grid
Hash Headphones Heart HeartPulse HelpCircle Home Image Inbox Info Instagram Key Laptop Layers LayoutGrid
Leaf Library Link Linkedin List ListMusic Lock LogOut Mail Map MapPin Medal Menu MessageCircle MessageSquare
Mic Minus Monitor Moon MoreHorizontal MoreVertical Mountain MountainSnow Music Navigation Package Palette
Paperclip Pause Pen Pencil Phone PieChart Pill Pin Plane Play Plus Podcast Radio Receipt RefreshCw Repeat
Rocket Ruler Save Search Send Settings Share Share2 Shield ShieldCheck ShoppingBag ShoppingCart Shuffle
SkipBack SkipForward Smartphone Smile Sparkles Speaker Star Sun Sunrise Sunset Tag Target Tent Thermometer
ThumbsUp Ticket Timer ToggleLeft Train Trash2 Trees TrendingUp Trophy Truck Tv Twitter Umbrella User
UserCircle UserPlus Users Utensils Video Volume2 Wallet Watch Waves Wifi Wind X Youtube Zap`
  .split(/\s+/)
  .filter(Boolean);

export const ICON_NAMES = CURATED.filter((n) => typeof Lucide[n] === "object" || typeof Lucide[n] === "function");

// Everything exported by lucide-react that looks like a component (Name, NameIcon, LucideName).
export const ICON_SCOPE = Object.fromEntries(
  Object.entries(Lucide).filter(([k, v]) => /^[A-Z]/.test(k) && v && (typeof v === "object" || typeof v === "function"))
);
