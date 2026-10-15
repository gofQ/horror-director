import { en, type MessageKey } from './en'
import { tr } from './tr'

export type { MessageKey }
export type Lang = 'tr' | 'en'
export const LANGS: readonly Lang[] = ['tr', 'en']
export const LANG_KEY = 'horror-director:lang'
export const LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US' }

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, tr }

type Params<S extends string> = S extends `${string}{${infer P}}${infer R}` ? P | Params<R> : never
export type ParamValues<K extends MessageKey> = Record<Params<(typeof en)[K]>, string | number>
/** Messages without placeholders take no params; messages with placeholders require exactly those. */
export type ParamsArg<K extends MessageKey> = [Params<(typeof en)[K]>] extends [never]
  ? []
  : [params: ParamValues<K>]

export type TFunction = <K extends MessageKey>(key: K, ...args: ParamsArg<K>) => string

export const hasKey = (key: string): key is MessageKey => key in en

export function isLang(v: unknown): v is Lang {
  return v === 'tr' || v === 'en'
}

/** Turkish for any `tr*` browser language, English otherwise. */
export function detectLang(languages: string | readonly string[] | undefined | null): Lang {
  const first = Array.isArray(languages) ? languages[0] : languages
  return typeof first === 'string' && /^tr(\b|-|_|$)/i.test(first.trim()) ? 'tr' : 'en'
}

/** First-run language: an explicit stored choice wins, otherwise the browser language decides. */
export function resolveLang(stored: unknown, languages: string | readonly string[] | undefined | null): Lang {
  return isLang(stored) ? stored : detectLang(languages)
}

export function makeT(lang: Lang): TFunction {
  const locale = LOCALE[lang]
  const dict = dictionaries[lang]
  return ((key: MessageKey, params?: Record<string, string | number>) =>
    dict[key].replace(/\{(\w+)\}/g, (whole, name: string) => {
      const v = params?.[name]
      if (v === undefined) return whole
      return typeof v === 'number' ? new Intl.NumberFormat(locale).format(v) : v
    })) as TFunction
}

export function translate<K extends MessageKey>(lang: Lang, key: K, ...args: ParamsArg<K>): string {
  return makeT(lang)(key, ...args)
}
