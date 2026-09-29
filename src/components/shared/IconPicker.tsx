"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { icons, Search, X, Check, Plus, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Export the complete map of all 1,745 Lucide icons
export const ICON_MAP: Record<string, LucideIcon> = icons as unknown as Record<
  string,
  LucideIcon
>;

// All available icon names sorted alphabetically
export const ALL_ICON_NAMES: string[] = Object.keys(icons).sort();

// Curated Category Sets for quick discovery
export const CATEGORY_MAP: Record<string, string[]> = {
  popular: [
    "Wallet", "CreditCard", "PiggyBank", "Coins", "DollarSign", "Landmark", "Receipt", "TrendingUp", "Percent", "Award",
    "UtensilsCrossed", "Utensils", "Coffee", "Pizza", "Beer", "Wine", "Apple", "Cake", "IceCream",
    "ShoppingBag", "ShoppingCart", "Store", "Tag", "Gift", "Sparkles", "Watch", "Shirt", "Package",
    "Car", "Bus", "Train", "Plane", "Fuel", "Navigation", "Compass", "Bike", "MapPin", "Luggage",
    "Home", "Building", "Zap", "Flame", "Droplets", "Wifi", "Tv", "Sofa", "Wrench", "Hammer",
    "Heart", "HeartPulse", "Activity", "Dumbbell", "Pill", "Stethoscope", "Smile", "Shield",
    "Film", "Music", "Gamepad2", "Camera", "Ticket", "Headphones", "BookOpen", "Book", "Play",
    "Briefcase", "GraduationCap", "Laptop", "Folder", "FileText", "Calculator", "User", "Users", "Baby", "Dog", "Cat", "Calendar", "Bell", "Key", "Target", "MoreHorizontal"
  ],
  finance: [
    "Wallet", "CreditCard", "PiggyBank", "Coins", "DollarSign", "Landmark", "Receipt", "TrendingUp", "Percent", "Award",
    "BadgePercent", "Banknote", "CircleDollarSign", "HandCoins", "ReceiptText", "Scale", "BadgeDollarSign", "IndianRupee"
  ],
  food: [
    "UtensilsCrossed", "Utensils", "Coffee", "Pizza", "Beer", "Wine", "Apple", "Cake", "IceCream", "Banana", "Beef",
    "CakeSlice", "Carrot", "Cherry", "Citrus", "CookingPot", "Croissant", "CupSoda", "Donut", "Egg", "Fish", "Grape", "GlassWater", "Hop", "Lollipop", "Milk", "Nut", "Popcorn", "Salad", "Sandwich", "Soup", "Wheat"
  ],
  shopping: [
    "ShoppingBag", "ShoppingCart", "Store", "Tag", "Gift", "Sparkles", "Watch", "Shirt", "Package", "BadgePercent", "Boxes", "Container", "Gem", "Glasses", "ScanBarcode", "ScanLine", "ShoppingBasket", "TicketPercent"
  ],
  transport: [
    "Car", "Bus", "Train", "Plane", "Fuel", "Navigation", "Compass", "Bike", "MapPin", "Luggage", "Anchor", "CableCar", "CarFront", "CarTaxiFront", "Caravan", "Footprints", "Gauge", "Map", "Milestone", "PlaneLanding", "PlaneTakeoff", "Rocket", "Sailboat", "Ship", "TrainFront", "TrainTrack", "TramFront", "Truck"
  ],
  home: [
    "Home", "Building", "Zap", "Flame", "Droplets", "Wifi", "Tv", "Sofa", "Wrench", "Hammer", "AirVent", "Armchair", "Bath", "Bed", "BedDouble", "BedSingle", "Blinds", "Bolt", "BrickWall", "Brush", "Castle", "DoorClosed", "DoorOpen", "Drill", "Fan", "Fence", "Flashlight", "Heater", "HousePlus", "Lamp", "LampCeiling", "LampDesk", "Lightbulb", "PaintRoller", "Paintbrush", "Plug", "Power", "Radio", "Refrigerator", "Router", "ShowerHead", "WashingMachine"
  ],
  health: [
    "Heart", "HeartPulse", "Activity", "Dumbbell", "Pill", "Stethoscope", "Smile", "Shield", "Accessibility", "Bandage", "Biohazard", "Brain", "Cross", "Eye", "FirstAid", "HandHeart", "Hospital", "ShieldCheck", "ShieldAlert", "Syringe", "Thermometer", "Tooth", "Virus", "Weight"
  ],
  leisure: [
    "Film", "Music", "Gamepad2", "Camera", "Ticket", "Headphones", "BookOpen", "Book", "Play", "AudioLines", "Clapperboard", "Disc", "Guitar", "Joystick", "Mic", "Palette", "Piano", "Popcorn", "Radio", "RollerCoaster", "Speaker", "Theater", "Trophy", "Tv2", "Video"
  ],
  work: [
    "Briefcase", "GraduationCap", "Laptop", "Folder", "FileText", "Calculator", "Archive", "Award", "Binary", "BookMarked", "Code", "Cpu", "Database", "FileCode", "FileSpreadsheet", "HardDrive", "Layers", "Monitor", "Printer", "QrCode", "Server", "Tablet", "Terminal"
  ],
  personal: [
    "User", "Users", "Baby", "Dog", "Cat", "Calendar", "Bell", "Key", "Target", "MoreHorizontal", "Bookmark", "Crown", "Flame", "Flower", "Flower2", "HeartHandshake", "Inbox", "Lock", "Moon", "Pin", "Send", "Sparkle", "Star", "Sun", "SunMedium", "Umbrella", "Unlock", "UserCheck", "UserPlus"
  ],
};

const CATEGORY_TABS = [
  { id: "popular", label: "Popular" },
  { id: "all", label: `All (${ALL_ICON_NAMES.length})` },
  { id: "finance", label: "Finance" },
  { id: "food", label: "Food" },
  { id: "shopping", label: "Shopping" },
  { id: "transport", label: "Transport" },
  { id: "home", label: "Home" },
  { id: "health", label: "Health" },
  { id: "leisure", label: "Leisure" },
  { id: "work", label: "Work" },
  { id: "personal", label: "Personal" },
] as const;

export const PRESET_COLORS = [
  "#10b981", // Emerald
  "#0ea5e9", // Sky
  "#6366f1", // Indigo
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#f43f5e", // Rose
  "#f97316", // Orange
  "#f59e0b", // Amber
  "#14b8a6", // Teal
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#a855f7", // Purple
  "#d946ef", // Fuchsia
  "#ef4444", // Red
  "#84cc16", // Lime
  "#64748b", // Slate
];

export interface IconPickerProps {
  value?: string;
  onChange: (iconName: string) => void;
  color?: string;
  className?: string;
  label?: string;
}

export function IconPicker({
  value,
  onChange,
  color = "#10b981",
  className,
  label,
}: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("popular");
  const [visibleCount, setVisibleCount] = useState(120);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Normalize current icon component
  const CurrentIcon = useMemo(() => {
    if (!value) return icons.Tag;
    const direct = ICON_MAP[value];
    if (direct) return direct;
    const found = ALL_ICON_NAMES.find(
      (k) => k.toLowerCase() === value.toLowerCase(),
    );
    if (found && ICON_MAP[found]) return ICON_MAP[found];
    return icons.Tag;
  }, [value]);

  // Compute matched icons
  const matchedIcons = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      return ALL_ICON_NAMES.filter((name) => name.toLowerCase().includes(q));
    }
    if (activeTab === "all") {
      return ALL_ICON_NAMES;
    }
    return CATEGORY_MAP[activeTab] || CATEGORY_MAP.popular;
  }, [search, activeTab]);

  // Reset visible slice when search or tab changes
  useEffect(() => {
    setVisibleCount(120);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [search, activeTab]);

  // Infinite scroll loader
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 180) {
      setVisibleCount((prev) => Math.min(prev + 100, matchedIcons.length));
    }
  }, [matchedIcons.length]);

  const displayedIcons = useMemo(() => {
    return matchedIcons.slice(0, visibleCount);
  }, [matchedIcons, visibleCount]);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
          {label}
        </span>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border/80 bg-background px-3.5 py-2.5 text-xs font-semibold text-foreground transition-all hover:border-primary/50 hover:bg-muted/30 cursor-pointer shadow-2xs"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg shadow-2xs transition-transform group-hover:scale-105"
            style={{ backgroundColor: `${color}20`, color }}
          >
            <CurrentIcon className="size-4.5" />
          </span>
          <div className="text-left truncate">
            <p className="truncate font-semibold text-foreground text-xs">
              {value || "Select Icon"}
            </p>
            <p className="text-[10px] font-normal text-muted-foreground">
              Click to choose from {ALL_ICON_NAMES.length} Lucide icons
            </p>
          </div>
        </div>

        <span className="shrink-0 text-[11px] font-medium text-muted-foreground bg-muted/80 px-2 py-1 rounded-md group-hover:text-foreground">
          Change
        </span>
      </button>

      {/* Modal Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-5 gap-3.5 flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0 pb-1 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <span>Select Icon</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    ({matchedIcons.length} available)
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Search by name or scroll through all {ALL_ICON_NAMES.length} Lucide icons.
                </DialogDescription>
              </div>

              {value && (
                <div
                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-border/50 shrink-0"
                  style={{ backgroundColor: `${color}15`, color }}
                >
                  <CurrentIcon className="size-3.5" />
                  <span>{value}</span>
                </div>
              )}
            </div>
          </DialogHeader>

          {/* Search Box */}
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 1,700+ icons (e.g. car, food, wallet, medical, book, music)..."
              className="h-9.5 pl-9 pr-8 text-xs bg-muted/30"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex gap-1 overflow-x-auto pb-1 text-[11px] scrollbar-none shrink-0">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearch("");
                }}
                className={cn(
                  "shrink-0 px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer",
                  activeTab === tab.id && !search
                    ? "bg-foreground text-background font-semibold shadow-xs"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Icon Grid with Infinite Scroll */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-9 gap-2 flex-1 overflow-y-auto p-1 pr-2 min-h-[260px] max-h-[380px]"
          >
            {displayedIcons.length === 0 ? (
              <div className="col-span-full py-12 text-center text-xs text-muted-foreground">
                No icons matching &quot;{search}&quot;. Try another search term.
              </div>
            ) : (
              displayedIcons.map((name) => {
                const ItemIcon = ICON_MAP[name];
                if (!ItemIcon) return null;
                const isSelected =
                  value?.toLowerCase() === name.toLowerCase();

                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => {
                      onChange(name);
                      setOpen(false);
                    }}
                    className={cn(
                      "group relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer aspect-square",
                      isSelected
                        ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                        : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/60 hover:scale-105 active:scale-95",
                    )}
                  >
                    <ItemIcon
                      className={cn(
                        "size-5 transition-transform group-hover:scale-110",
                        isSelected
                          ? "text-primary"
                          : "text-foreground/80 group-hover:text-foreground",
                      )}
                    />
                    <span className="truncate w-full text-[8.5px] text-center text-muted-foreground group-hover:text-foreground mt-1 px-0.5">
                      {name}
                    </span>
                    {isSelected && (
                      <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="size-2.5" />
                      </span>
                    )}
                  </button>
                );
              })
            )}

            {displayedIcons.length < matchedIcons.length && (
              <div className="col-span-full py-2 text-center text-[10px] text-muted-foreground">
                Showing {displayedIcons.length} of {matchedIcons.length} icons. Scroll down for more.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
  className?: string;
}

export function ColorPicker({
  value,
  onChange,
  label = "Color Accent",
  className,
}: ColorPickerProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
          {label}
        </span>
      )}

      {/* Preset Swatches Grid */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {PRESET_COLORS.map((preset) => {
          const isSelected = value.toLowerCase() === preset.toLowerCase();
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              style={{ backgroundColor: preset }}
              className={cn(
                "size-6 rounded-full transition-transform hover:scale-110 cursor-pointer shadow-2xs relative flex items-center justify-center",
                isSelected
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110"
                  : "hover:opacity-90",
              )}
              title={preset}
            >
              {isSelected && <Check className="size-3 text-white drop-shadow-xs" />}
            </button>
          );
        })}
      </div>

      {/* Custom Picker + Hex Input */}
      <div className="flex items-center gap-2 pt-0.5">
        <label
          className="relative flex items-center justify-center size-8 rounded-lg border border-border cursor-pointer shadow-xs shrink-0 overflow-hidden"
          style={{ backgroundColor: value }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            title="Choose custom color"
          />
        </label>
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#10b981"
          className="h-8 w-28 font-mono text-xs uppercase"
        />
        <span className="text-[11px] text-muted-foreground">Custom HEX</span>
      </div>
    </div>
  );
}

const STORAGE_KEY = "spentx_custom_palette_colors";

export function getSavedCustomColors(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomPaletteColor(color: string) {
  if (typeof window === "undefined" || !color) return;
  const hex = color.trim().toLowerCase();
  if (PRESET_COLORS.some((c) => c.toLowerCase() === hex)) return;
  try {
    const existing = getSavedCustomColors();
    if (!existing.includes(hex)) {
      const next = [hex, ...existing].slice(0, 12);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("spentx_colors_updated"));
    }
  } catch {
    // Ignore storage errors
  }
}

export interface InlineColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}

export function InlineColorPicker({
  value,
  onChange,
  className,
}: InlineColorPickerProps) {
  const [customColors, setCustomColors] = useState<string[]>([]);

  useEffect(() => {
    setCustomColors(getSavedCustomColors());
    const handler = () => setCustomColors(getSavedCustomColors());
    window.addEventListener("spentx_colors_updated", handler);
    return () => window.removeEventListener("spentx_colors_updated", handler);
  }, []);

  const handleCustomColorPick = (hex: string) => {
    onChange(hex);
    saveCustomPaletteColor(hex);
  };

  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
      {/* Preset Swatches */}
      {PRESET_COLORS.slice(0, 12).map((preset) => {
        const isSelected = value.toLowerCase() === preset.toLowerCase();
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            style={{ backgroundColor: preset }}
            className={cn(
              "size-6.5 rounded-full transition-all hover:scale-110 cursor-pointer shadow-2xs relative flex items-center justify-center shrink-0",
              isSelected
                ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110"
                : "opacity-85 hover:opacity-100",
            )}
            title={preset}
          >
            {isSelected && <Check className="size-3 text-white drop-shadow-xs" />}
          </button>
        );
      })}

      {/* Saved Custom Colors */}
      {customColors.length > 0 && (
        <span className="w-px h-4.5 bg-border/80 mx-0.5 shrink-0" />
      )}
      {customColors.map((hex) => {
        const isSelected = value.toLowerCase() === hex.toLowerCase();
        return (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            style={{ backgroundColor: hex }}
            className={cn(
              "size-6.5 rounded-full transition-all hover:scale-110 cursor-pointer shadow-2xs relative flex items-center justify-center shrink-0",
              isSelected
                ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110"
                : "opacity-85 hover:opacity-100 ring-1 ring-border/50",
            )}
            title={`Custom: ${hex}`}
          >
            {isSelected && <Check className="size-3 text-white drop-shadow-xs" />}
          </button>
        );
      })}

      {/* Add New Custom Color */}
      <label
        className={cn(
          "relative flex items-center justify-center size-6.5 rounded-full border border-dashed border-border hover:border-foreground transition-all cursor-pointer shrink-0 overflow-hidden",
          !PRESET_COLORS.some((c) => c.toLowerCase() === value.toLowerCase()) &&
            !customColors.some((c) => c.toLowerCase() === value.toLowerCase()) &&
            "ring-2 ring-foreground ring-offset-2 ring-offset-background",
        )}
        style={
          !PRESET_COLORS.some((c) => c.toLowerCase() === value.toLowerCase()) &&
          !customColors.some((c) => c.toLowerCase() === value.toLowerCase())
            ? { backgroundColor: value }
            : undefined
        }
        title="Create new custom color"
      >
        <input
          type="color"
          value={value}
          onChange={(e) => handleCustomColorPick(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
        {!PRESET_COLORS.some((c) => c.toLowerCase() === value.toLowerCase()) &&
        !customColors.some((c) => c.toLowerCase() === value.toLowerCase()) ? (
          <Check className="size-3 text-white drop-shadow-xs" />
        ) : (
          <Plus className="size-3 text-muted-foreground" />
        )}
      </label>
    </div>
  );
}

export interface InlineIconPickerProps {
  value?: string;
  onChange: (iconName: string) => void;
  color?: string;
  className?: string;
}

export function InlineIconPicker({
  value,
  onChange,
  color = "#10b981",
  className,
}: InlineIconPickerProps) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("popular");
  const [visibleCount, setVisibleCount] = useState(80);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Compute matched icons
  const matchedIcons = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      return ALL_ICON_NAMES.filter((name) => name.toLowerCase().includes(q));
    }
    if (activeTab === "all") {
      return ALL_ICON_NAMES;
    }
    return CATEGORY_MAP[activeTab] || CATEGORY_MAP.popular;
  }, [search, activeTab]);

  useEffect(() => {
    setVisibleCount(80);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [search, activeTab]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      setVisibleCount((prev) => Math.min(prev + 60, matchedIcons.length));
    }
  }, [matchedIcons.length]);

  const displayedIcons = useMemo(() => {
    return matchedIcons.slice(0, visibleCount);
  }, [matchedIcons, visibleCount]);

  return (
    <div className={cn("space-y-2", className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons..."
          className="h-8 pl-8 pr-7 text-xs bg-muted/30 border-border/70 rounded-lg focus-visible:ring-1 focus-visible:ring-primary"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div className="flex gap-1 overflow-x-auto pb-0.5 text-[10px] scrollbar-none">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setSearch("");
            }}
            className={cn(
              "shrink-0 px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer",
              activeTab === tab.id && !search
                ? "bg-foreground text-background font-semibold shadow-2xs"
                : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable Icon Grid */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="grid grid-cols-7 sm:grid-cols-8 gap-1.5 overflow-y-auto p-1.5 max-h-[160px] rounded-xl border border-border/60 bg-muted/20"
      >
        {displayedIcons.length === 0 ? (
          <div className="col-span-full py-6 text-center text-xs text-muted-foreground">
            No icons found
          </div>
        ) : (
          displayedIcons.map((name) => {
            const ItemIcon = ICON_MAP[name];
            if (!ItemIcon) return null;
            const isSelected = value?.toLowerCase() === name.toLowerCase();

            return (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => onChange(name)}
                className={cn(
                  "group relative flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all cursor-pointer aspect-square",
                  isSelected
                    ? "border-primary bg-primary/15 ring-2 ring-primary/40 shadow-xs"
                    : "border-transparent bg-background/60 hover:border-border hover:bg-muted/60 hover:scale-105 active:scale-95",
                )}
              >
                <ItemIcon
                  className={cn(
                    "size-4.5 transition-transform group-hover:scale-110",
                    isSelected
                      ? "text-primary"
                      : "text-foreground/75 group-hover:text-foreground",
                  )}
                  style={isSelected ? { color } : undefined}
                />
                <span className="truncate w-full text-[7.5px] text-center text-muted-foreground group-hover:text-foreground mt-0.5 px-0.5 leading-tight">
                  {name}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
