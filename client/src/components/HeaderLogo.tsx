import { useTheme } from "@/contexts/ThemeProvider";

export function HeaderLogo() {
  const { theme } = useTheme();
  const src = theme === "dark" ? "/meta logoWhite.svg" : "/meta logo.svg";
  return (
    <img
      src={src}
      alt="Logo"
      className="h-12 w-auto"
      data-testid="img-header-logo"
    />
  );
}