import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight,
  CalendarDays,
  CalendarPlus,
  Eye,
  Home,
  Menu,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  UserRound,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAccess } from "@/hooks/useAccess";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/UserAvatar";
import { ThemeToggle } from "@/components/ThemeProvider";
import { CommandPalette } from "@/components/CommandPalette";
import { AuthLayoutSkeleton } from "@/components/AuthLayoutSkeleton";

const NAV = [
  { to: "/", label: "Dashboard", icon: Home, end: true },
  { to: "/games", label: "Games", icon: CalendarDays },
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Zap className="h-4 w-4" strokeWidth={2.5} />
      </div>
      <span className="text-[15px] font-bold tracking-tight">CourtSplit</span>
    </Link>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function UserMenu() {
  const { user } = useAuth();
  const { isAdmin, isRoute, resetChoice } = useAccess();
  const navigate = useNavigate();
  if (!user) return null;

  const roleLabel = isRoute ? "Route · full access" : isAdmin ? "Admin · full access" : "Viewer · read-only";
  const badgeLabel = isRoute ? "Route" : isAdmin ? "Admin" : "Viewer";
  const RoleIcon = isRoute ? RouteIcon : isAdmin ? ShieldCheck : Eye;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/60">
          <UserAvatar name={user.name} src={user.avatar} seed={user.id} className="h-7 w-7" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight">{user.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              "shrink-0 gap-1 text-[10px]",
              (isAdmin || isRoute) && "border-primary/30 bg-primary/10 text-primary",
            )}
          >
            <RoleIcon className="h-3 w-3" />
            {badgeLabel}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {isRoute
            ? "Route mode — NARS squad"
            : isAdmin
              ? "Signed in as admin"
              : "Browsing as viewer"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(isAdmin || isRoute) && (
          <DropdownMenuItem onClick={() => navigate("/profile")}>
            <UserRound className="mr-2 h-4 w-4" /> Profile & UPI settings
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => void resetChoice()}>
          <ArrowLeftRight className="mr-2 h-4 w-4" />
          {isRoute ? "Exit Route mode" : "Switch role"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AppLayout() {
  const { user, isLoading } = useAuth();
  const { isAdmin, isRoute } = useAccess();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  if (isLoading) return <AuthLayoutSkeleton />;
  if (!user) return <AuthLayoutSkeleton />

  const canEdit = isAdmin || isRoute;

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-14 items-center px-3">
          <Logo />
        </div>
        <div className="mt-2 flex-1">
          <NavItems />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <UserMenu />
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md lg:pl-[248px]">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 bg-sidebar p-0">
            <div className="flex h-14 items-center px-3">
              <Logo />
            </div>
            <NavItems onNavigate={() => setMobileOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 border-t border-sidebar-border p-3">
              <UserMenu />
            </div>
          </SheetContent>
        </Sheet>

        <button
          onClick={() => setPaletteOpen(true)}
          className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search games…</span>
          <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium sm:inline">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          {canEdit && (
            <Button
              size="sm"
              className="hidden gap-1.5 sm:flex"
              onClick={() => setPaletteOpen(true)}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              New booking
            </Button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Content */}
      <main className="lg:pl-60">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
