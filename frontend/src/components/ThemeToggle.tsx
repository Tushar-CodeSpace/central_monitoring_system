import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={cn(
        "h-8 w-8 transition-colors rounded-xl border border-slate-700/60 bg-slate-950/60 hover:bg-slate-800 hover:border-slate-600",
        theme === "light"
          ? "border-orange-300/80 bg-orange-50 text-orange-600 hover:bg-orange-100"
          : "text-amber-400 hover:text-amber-300",
        className
      )}
      title={theme === "dark" ? "Switch to Light Theme (Orange)" : "Switch to Dark Theme"}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-amber-400 transition-all duration-200" />
      ) : (
        <Moon className="h-4 w-4 text-orange-600 transition-all duration-200" />
      )}
    </Button>
  );
}
