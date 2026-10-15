import { useMemo, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { LANG_KEY, LOCALE, makeT, resolveLang, type Lang, type TFunction } from './index'

/** Language preference lives under its own key — never in project data or exports. */
function readStored(): string | null {
  try {
    return localStorage.getItem(LANG_KEY)
  } catch {
    return null
  }
}

function initialLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : navigator.language) : undefined
  return resolveLang(readStored(), nav)
}

function applyDocumentLang(lang: Lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      /* preference just won't persist */
    }
    applyDocumentLang(lang)
    set({ lang })
  },
}))
applyDocumentLang(useLang.getState().lang)

export const getLang = (): Lang => useLang.getState().lang

export function useT() {
  // Same snapshot on server and client so server-rendered checks reflect the live language.
  const lang = useSyncExternalStore(useLang.subscribe, () => useLang.getState().lang, () => useLang.getState().lang)
  return useMemo(() => {
    const locale = LOCALE[lang]
    const t: TFunction = makeT(lang)
    return {
      t,
      lang,
      locale,
      formatNumber: (n: number) => new Intl.NumberFormat(locale).format(n),
      formatTime: (ms: number) =>
        new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    }
  }, [lang])
}
