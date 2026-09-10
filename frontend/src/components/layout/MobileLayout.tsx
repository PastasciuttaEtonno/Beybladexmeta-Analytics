import React from 'react';

/**
 * Il contenitore del telefono: colonna centrata, larghezza massima.
 *
 * Si chiamava AdsLayout ed era il posto dove sarebbero dovuti finire i banner
 * pubblicitari, che non sono mai stati implementati - nel codice non c'e' mai
 * stato un solo <ins class="adsbygoogle">. Restava lo script di AdSense in
 * index.html, che si caricava su ogni pagina senza avere niente da riempire.
 * Tolto quello, il nome indicava una cosa che non esiste: questo componente fa
 * il layout mobile, e adesso lo dice.
 */
export function MobileLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center min-h-screen w-full">
            <div className="flex-1 w-full max-w-2xl relative">
                {children}
            </div>
        </div>
    );
}
