import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { en } from './en'
import { tr } from './tr'
import { detectLang, LANG_KEY, makeT, resolveLang, translate, type MessageKey } from './index'
import { useLang } from './store'
import { useStore } from '../store/useStore'
import { sampleProject } from '../lib/sample'
import { buildExport, exportFileName, parseProject, serializeProject } from '../lib/io'
import { analyze } from '../lib/graph'
import { diag, formatDiagnostic, formatDiagnostics } from '../lib/diagnostics'
import { hydrate, STORAGE_KEY } from '../lib/persist'
import { ENGLISH_NAMES } from '../lib/factory'
import type { Project } from '../lib/schema'

const keys = Object.keys(en) as MessageKey[]
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

describe('dictionaries', () => {
  it('have identical key sets', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort())
  })
  it('use identical {placeholders} per key', () => {
    for (const k of keys) expect(placeholders(tr[k]), k).toEqual(placeholders(en[k]))
  })
  it('have no empty values', () => {
    for (const k of keys) {
      expect(en[k].trim(), `en ${k}`).not.toBe('')
      expect(tr[k].trim(), `tr ${k}`).not.toBe('')
    }
  })
  it('are genuinely translated for user-facing navigation', () => {
    expect(tr['tab.timeline']).toBe('Zaman Çizelgesi')
    expect(tr['kind.nightmare']).toBe('Kâbus')
    expect(tr['btn.import']).toBe('İçe aktar')
  })
})

describe('language detection', () => {
  it.each([
    ['tr', 'tr'],
    ['tr-TR', 'tr'],
    ['TR', 'tr'],
    ['tr_TR', 'tr'],
    ['en-US', 'en'],
    ['de', 'en'],
    ['trk', 'en'],
    ['', 'en'],
  ])('%s → %s', (input, expected) => expect(detectLang(input)).toBe(expected))
  it('uses the first preferred language of a list and tolerates missing data', () => {
    expect(detectLang(['tr-TR', 'en'])).toBe('tr')
    expect(detectLang(['en-GB', 'tr'])).toBe('en')
    expect(detectLang(undefined)).toBe('en')
    expect(detectLang([])).toBe('en')
  })
  it('an explicit stored choice beats the browser language; invalid values are ignored', () => {
    expect(resolveLang('en', ['tr-TR'])).toBe('en')
    expect(resolveLang('tr', ['en-US'])).toBe('tr')
    expect(resolveLang('fr', ['tr-TR'])).toBe('tr')
    expect(resolveLang(null, ['en-US'])).toBe('en')
  })
})

describe('interpolation', () => {
  it('fills named params in both languages', () => {
    expect(translate('en', 'diag.dupScene', { id: 'a1' })).toBe('Duplicate scene id "a1".')
    expect(translate('tr', 'diag.dupScene', { id: 'a1' })).toBe('"a1" sahne kimliği birden fazla kez kullanılmış.')
  })
  it('formats numbers per locale', () => {
    expect(translate('en', 'diag.lateTriggers', { scene: 'A', n: 2, duration: 1200 })).toBe(
      '"A" has 2 trigger(s) after its 1,200s duration.',
    )
    expect(translate('tr', 'diag.lateTriggers', { scene: 'A', n: 2, duration: 1200 })).toBe(
      '"A" sahnesinde 1.200 sn süresinden sonra gelen 2 tetikleyici var.',
    )
    expect(translate('tr', 'tl.summary', { seconds: 90, n: 3 })).toContain('90 sn · 3 tetikleyici')
  })
  it('leaves an unknown placeholder visible instead of throwing', () => {
    const t = makeT('en') as unknown as (k: string, p?: Record<string, string>) => string
    expect(t('diag.dupScene', {})).toBe('Duplicate scene id "{id}".')
  })
  it('keeps Turkish Unicode intact through interpolation', () => {
    const id = 'İıŞşĞğÜüÖöÇç Kâbus Üçgeni'
    expect(translate('tr', 'diag.dupScene', { id })).toContain(id)
    expect(translate('en', 'dlg.describe', { name: id, scenes: 1, transitions: 2, characters: 3 })).toContain(id)
  })
  it('Turkish casing rules hold for locale-aware uppercase', () => {
    expect('ışık i'.toLocaleUpperCase('tr-TR')).toBe('IŞIK İ')
    expect(tr['tab.analysis'].toLocaleUpperCase('tr-TR')).toBe('ANALİZ')
  })
  it('is type-checked (compile-time)', () => {
    // Never invoked: these lines only have to fail type-checking, which `@ts-expect-error` asserts.
    const typeChecks = () => {
      // @ts-expect-error missing required params
      translate('en', 'diag.dupScene')
      // @ts-expect-error wrong param name
      translate('en', 'diag.dupScene', { nope: 'x' })
      // @ts-expect-error unknown key
      translate('en', 'no.such.key')
    }
    expect(typeof typeChecks).toBe('function')
    expect(translate('en', 'btn.undo')).toBe('Undo')
  })
})

describe('language store and persistence', () => {
  let mem: ReturnType<typeof memoryStorage>
  const doc = { documentElement: { lang: '' } }
  beforeEach(() => {
    mem = memoryStorage()
    vi.stubGlobal('localStorage', mem)
    vi.stubGlobal('document', doc)
    useLang.setState({ lang: 'en' })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('setLang updates state, <html lang>, and persists under its own key only', () => {
    useLang.getState().setLang('tr')
    expect(useLang.getState().lang).toBe('tr')
    expect(doc.documentElement.lang).toBe('tr')
    expect(mem.data.get(LANG_KEY)).toBe('tr')
    expect([...mem.data.keys()]).toEqual([LANG_KEY])
    expect(LANG_KEY).not.toBe(STORAGE_KEY)
    useLang.getState().setLang('en')
    expect(doc.documentElement.lang).toBe('en')
    expect(mem.data.get(LANG_KEY)).toBe('en')
  })
  it('survives a failing storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(() => useLang.getState().setLang('tr')).not.toThrow()
    expect(useLang.getState().lang).toBe('tr')
  })
})

describe('switching language does not touch project data', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('document', { documentElement: { lang: '' } })
    useLang.setState({ lang: 'en' })
    useStore.getState().loadSample()
    useStore.setState({ past: [], future: [] })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps project identity, history and existing text', () => {
    const before = useStore.getState().project
    const past = useStore.getState().past
    useLang.getState().setLang('tr')
    useLang.getState().setLang('en')
    expect(useStore.getState().project).toBe(before)
    expect(useStore.getState().past).toBe(past)
    expect(useStore.getState().project.scenes[0].title).toBe('Apartment Hallway')
  })
  it('new items are named in the current language; existing items are not renamed', () => {
    useLang.getState().setLang('tr')
    const sceneId = useStore.getState().addScene('reality', { x: 0, y: 0 })
    const endingId = useStore.getState().addScene('ending', { x: 0, y: 0 })
    const trgId = useStore.getState().addTrigger('s_hall', 5)
    const chrId = useStore.getState().addCharacter()
    const p = useStore.getState().project
    expect(p.scenes.find((s) => s.id === sceneId)!.title).toBe('Yeni Sahne')
    expect(p.scenes.find((s) => s.id === endingId)!.title).toBe('Yeni Final')
    expect(p.scenes[0].triggers.find((t) => t.id === trgId)!.name).toBe('Yeni tetikleyici')
    const chr = p.characters.find((c) => c.id === chrId)!
    expect(chr.name).toBe('Yeni Karakter')
    expect(chr.states[0].name).toBe('Boşta')

    useLang.getState().setLang('en')
    const again = useStore.getState().project
    expect(again.scenes.find((s) => s.id === sceneId)!.title).toBe('Yeni Sahne') // stays as created
    expect(useStore.getState().addScene('reality', { x: 0, y: 0 })).toBeTruthy()
    expect(useStore.getState().project.scenes.at(-1)!.title).toBe('New Scene')
  })
  it('New project uses localized default names; undo restores the previous project', () => {
    const before = useStore.getState().project
    useLang.getState().setLang('tr')
    useStore.getState().resetProject()
    const p = useStore.getState().project
    expect(p.name).toBe('Adsız Kâbus')
    expect(p.scenes[0].title).toBe('Açılış')
    useStore.getState().undo()
    expect(useStore.getState().project).toBe(before)
  })
  it('default-name dictionaries match the English factory defaults', () => {
    expect({
      project: en['default.project'],
      opening: en['default.opening'],
      scene: en['default.scene'],
      ending: en['default.ending'],
      trigger: en['default.trigger'],
      shot: en['default.shot'],
      character: en['default.character'],
      state: en['default.state'],
      stateIdle: en['default.stateIdle'],
    }).toEqual(ENGLISH_NAMES)
  })
})

describe('localized diagnostics', () => {
  const codes = keys.filter((k) => k.startsWith('diag.'))
  it('every code renders in both languages with no unresolved placeholder', () => {
    for (const lang of ['en', 'tr'] as const) {
      const t = makeT(lang)
      for (const code of codes) {
        const params = Object.fromEntries(placeholders(en[code as MessageKey]).map((n) => [n, `v_${n}`]))
        const out = formatDiagnostic(t, { code: code as never, params })
        expect(out, `${lang} ${code}`).not.toMatch(/\{\w+\}/)
        for (const v of Object.values(params)) {
          if (code === 'diag.schema.invalidType') continue // expected/received are mapped to type names
          expect(out, `${lang} ${code}`).toContain(v)
        }
      }
    }
  })
  it('analysis issues are structured and render in Turkish and English', () => {
    const p: Project = JSON.parse(JSON.stringify(sampleProject()))
    p.scenes[0].title = 'Koridor İğ'
    p.scenes[0].triggers[0].time = 9999
    p.scenes[7].loop.enabled = true // an ending flagged as looping, no exit
    const a = analyze(p)
    const late = a.issues.find((i) => i.diagnostic.code === 'diag.lateTriggers')!
    expect(late.diagnostic.params).toEqual({ scene: 'Koridor İğ', n: 1, duration: 90 })
    expect(formatDiagnostics('en', [late.diagnostic])[0]).toBe('"Koridor İğ" has 1 trigger(s) after its 90s duration.')
    expect(formatDiagnostics('tr', [late.diagnostic])[0]).toBe('"Koridor İğ" sahnesinde 90 sn süresinden sonra gelen 1 tetikleyici var.')
    expect(late).not.toHaveProperty('message')
  })
  it('import errors render in both languages (identifiers stay untranslated)', () => {
    const bad = (obj: unknown) => {
      const r = parseProject(JSON.stringify(obj))
      if (r.ok) throw new Error('expected rejection')
      return r.errors
    }
    const p = JSON.parse(JSON.stringify(sampleProject()))
    p.scenes[1].id = p.scenes[0].id
    p.transitions[0].target = 'ghost'
    const e1 = bad(p)
    expect(formatDiagnostics('tr', e1)).toEqual(
      expect.arrayContaining([
        '"s_hall" sahne kimliği birden fazla kez kullanılmış.',
        'Geçiş "e1" geçişinin hedef sahnesi "ghost" bulunamıyor.'.replace('Geçiş "e1" geçişinin', '"Enter apartment" (e1) geçişinin'),
      ]),
    )
    expect(formatDiagnostics('en', e1)).toContain('Duplicate scene id "s_hall".')

    const q = JSON.parse(JSON.stringify(sampleProject()))
    q.scenes[0].triggers[0].intensity = 99
    q.scenes[0].title = 5
    delete q.scenes[1].kind
    q.scenes[2].kind = 'bogus'
    q.scenes[3].duration = -1
    const e2 = bad(q)
    expect(e2.map((d) => d.code).sort()).toEqual(
      ['diag.schema.invalidType', 'diag.schema.invalidValue', 'diag.schema.required', 'diag.schema.tooBig', 'diag.schema.tooSmallExclusive'].sort(),
    )
    const trText = formatDiagnostics('tr', e2).join('\n')
    expect(trText).toContain('scenes.0.title: metin bekleniyordu, sayı bulundu.')
    expect(trText).toContain('scenes.1.kind: gerekli değer eksik.')
    expect(trText).toContain('scenes.2.kind: şunlardan biri olmalı: reality, dream, nightmare, memory, ending.')
    expect(trText).toContain('scenes.0.triggers.0.intensity: en fazla 10 olmalı.')
    expect(trText).toContain('scenes.3.duration: 0 değerinden büyük olmalı.')
    const enText = formatDiagnostics('en', e2).join('\n')
    expect(enText).toContain('scenes.0.title: expected text, received number.')
    expect(enText).toContain('scenes.3.duration: must be greater than 0.')
    expect(enText).toContain('scenes.1.kind: required value is missing.')
    expect(enText).not.toMatch(/Invalid input|Too big/) // raw Zod text is never shown
  })
  it('structured parse errors for file-level problems', () => {
    expect(parseProject('{nope')).toEqual({ ok: false, errors: [diag('diag.json')] })
    const wrapped = JSON.parse(serializeProject(sampleProject()))
    const r = parseProject(JSON.stringify({ ...wrapped, schemaVersion: 3 }))
    expect(r).toEqual({ ok: false, errors: [diag('diag.newerSchema', { found: '3', supported: '2' })] })
    expect(formatDiagnostics('tr', (r as unknown as { errors: never[] }).errors)[0]).toContain('3 şema sürümünü')
  })
})

describe('JSON compatibility', () => {
  const when = new Date('2026-01-01T00:00:00Z')
  const turkish = (): Project => {
    const p: Project = JSON.parse(JSON.stringify(sampleProject()))
    p.name = 'Kâbus Üçgeni — İğdeli Çocuk'
    p.scenes[0].title = 'Çocukluk Odası'
    p.scenes[0].description = 'Işıklar sönüyor; “ğüşiöç” ve İIıi harfleri.'
    p.characters[0].name = 'Şule'
    return p
  }
  it('export bytes do not depend on the UI language and keep schemaVersion 2', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('document', { documentElement: { lang: '' } })
    useLang.setState({ lang: 'en' })
    const a = JSON.stringify(buildExport(turkish(), when))
    useLang.getState().setLang('tr')
    const b = JSON.stringify(buildExport(turkish(), when))
    vi.unstubAllGlobals()
    expect(a).toBe(b)
    expect(JSON.parse(a).schemaVersion).toBe(2)
    expect(a).not.toMatch(/"lang"|"language"|"locale"/)
  })
  it('Turkish project text round-trips through export/import unchanged', () => {
    const p = turkish()
    const r = parseProject(serializeProject(p))
    expect(r.ok && r.project).toEqual(p)
  })
  it('v0.1/v0.2 persisted project data still hydrates unchanged', () => {
    const stored = JSON.parse(JSON.stringify({ project: turkish(), timelineSceneId: 's_bed' }))
    const h = hydrate(stored)
    expect(h.project).toEqual(turkish())
  })
  it('backup file names keep Turkish letters', () => {
    expect(exportFileName({ ...turkish(), name: 'Kâbus Üçgeni' })).toBe('Kâbus_Üçgeni.horror.json')
    expect(exportFileName({ ...turkish(), name: 'İğdır / çocuk?' })).toBe('İğdır_çocuk.horror.json')
  })
})
