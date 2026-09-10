import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Il breakpoint, letto in modo sincrono.
 *
 * La versione precedente partiva da `undefined` e si assestava dentro un
 * useEffect: al primo render rispondeva sempre "non e' mobile", quindi su un
 * telefono React montava l'albero desktop, lo buttava via e rimontava quello
 * mobile. Con useSyncExternalStore il primo render ha gia' la risposta giusta.
 *
 * Il terzo argomento e' lo snapshot lato server: qui non c'e' SSR, ma React lo
 * pretende e "non e' mobile" e' il ripiego corretto per un ambiente senza
 * finestra.
 */
function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onStoreChange)
  return () => mql.removeEventListener("change", onStoreChange)
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
}

function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
