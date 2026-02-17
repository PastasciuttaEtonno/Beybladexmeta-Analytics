import { useTheme } from "@/contexts/ThemeProvider";

export function HeaderLogo() {
  const { theme } = useTheme();
  const src = theme === "dark" ? "/meta logoWhite.svg" : "/meta logo.svg";
  return (
    <img
      src={src}
      alt="Beybladexmeta Analytics Logo"
      className="h-12 w-auto md:hidden"
      data-testid="img-header-logo"
    />
  );
}