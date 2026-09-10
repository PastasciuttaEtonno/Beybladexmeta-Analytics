import { useIsMobile } from "@/hooks/use-mobile";
import { MobileLayout } from "./MobileLayout";
import { DesktopLayout } from "./DesktopLayout";

interface ResponsiveAppShellProps {
    children: React.ReactNode;
}

/**
 * Uno solo dei due layout, non tutti e due.
 *
 * Prima qui c'erano entrambi, uno nascosto da `md:hidden` e l'altro da
 * `hidden md:block`. Nascondere con i CSS non impedisce a React di montare:
 * `children` e' l'intero albero delle rotte, quindi ogni pagina esisteva in
 * due copie complete. Misurato sulla home a 1440px: 637 nodi nel DOM, di cui
 * 512 dentro sottoalberi display:none. Ogni hook girava due volte e ogni
 * immagine dei componenti veniva decodificata due volte.
 *
 * Il passaggio da CSS a JavaScript cambia una cosa nel comportamento:
 * attraversare i 768px ora smonta un layout e ne monta l'altro, invece di
 * scambiare la visibilita'. I dati non ne risentono - react-query li tiene in
 * cache con staleTime infinito - e ridimensionare la finestra oltre il
 * breakpoint non e' un gesto che si fa mentre si legge una tabella.
 */
export function ResponsiveAppShell({ children }: ResponsiveAppShellProps) {
    const isMobile = useIsMobile();

    return isMobile
        ? <MobileLayout>{children}</MobileLayout>
        : <DesktopLayout>{children}</DesktopLayout>;
}
