import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLang } from './store'
import { useStore } from '../store/useStore'
import { AnalysisView } from '../components/AnalysisView'
import { ImportDialog } from '../components/ImportDialog'
import { diag } from '../lib/diagnostics'
import { LibraryDialog } from '../components/LibraryDialog'
import { addAndOpen, bootLibrary } from '../store/library'
import { memoryBackend } from '../test/memoryBackend'
import { emptyProject } from '../lib/factory'
import { recordKey } from '../lib/library'
import { sampleProject } from '../lib/sample'

const noop = () => {}

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: noop, removeItem: noop })
  vi.stubGlobal('document', { documentElement: { lang: '' } })
  useStore.getState().loadSample()
})
afterEach(() => vi.unstubAllGlobals())

const render = (lang: 'tr' | 'en', node: React.ReactElement) => {
  useLang.setState({ lang })
  // zustand's server snapshot is the *initial* state object; sync it so renders reflect the live store.
  Object.assign(useStore.getInitialState(), useStore.getState())
  return renderToStaticMarkup(node)
}

describe('rendered components follow the language', () => {
  it('AnalysisView', () => {
    const en = render('en', <AnalysisView />)
    const tr = render('tr', <AnalysisView />)
    expect(en).toContain('Narrative checks')
    expect(en).toContain('Reality ⇄ Dream crossings')
    expect(tr).toContain('Anlatı kontrolleri')
    expect(tr).toContain('Gerçeklik ⇄ Rüya geçişi')
    expect(tr).not.toContain('Narrative checks')
    // locale number formatting: sample average intensity has a decimal part
    expect(tr).toMatch(/\d,\d/)
    expect(en).toMatch(/\d\.\d/)
    // user-authored content is never translated
    expect(tr).toContain('Endless Corridor')
  })

  it('ImportDialog: rejected', () => {
    const state = {
      kind: 'rejected' as const,
      fileName: 'kâbus.json',
      errors: [diag('diag.dupScene', { id: 'a' }), diag('diag.schema.tooBig', { path: 'scenes.0.triggers.0.intensity', max: 10 })],
    }
    const props = { state, current: sampleProject(), onCancel: noop, onConfirm: noop, onBackupCurrent: noop }
    const tr = render('tr', <ImportDialog {...props} />)
    expect(tr).toContain('İçe aktarma engellendi')
    expect(tr).toContain('Dosya: kâbus.json')
    expect(tr).toContain('&quot;a&quot; sahne kimliği birden fazla kez kullanılmış.')
    expect(tr).toContain('en fazla 10 olmalı.')
    const en = render('en', <ImportDialog {...props} />)
    expect(en).toContain('Import blocked')
    expect(en).toContain('Duplicate scene id &quot;a&quot;.')
  })

  it('ImportDialog: confirmation with warnings', () => {
    const state = {
      kind: 'confirm' as const,
      mode: 'replace' as const,
      error: null,
      fileName: 'x.json',
      project: { ...sampleProject(), name: 'Çığlık' },
      warnings: [diag('diag.noStart')],
    }
    const props = { state, current: sampleProject(), onCancel: noop, onConfirm: noop, onBackupCurrent: noop }
    const tr = render('tr', <ImportDialog {...props} />)
    expect(tr).toContain('Mevcut proje değiştirilsin mi?')
    expect(tr).toContain('“Çığlık” — 8 sahne, 10 geçiş, 3 karakter')
    expect(tr).toContain('Başlangıç sahnesi ayarlanmamış.')
    expect(tr).toContain('Projeyi değiştir')
    const en = render('en', <ImportDialog {...props} />)
    expect(en).toContain('Replace current project?')
    expect(en).toContain('“Çığlık” — 8 scenes, 10 transitions, 3 characters')
  })

  it('LibraryDialog: list, active badge, damaged entry, dates and actions per language', () => {
    const b = memoryBackend()
    bootLibrary(b)
    const first = useStore.getState().library.activeId!
    addAndOpen({ ...emptyProject(), name: 'Çığlık Odası' })
    const second = useStore.getState().library.activeId!
    b.data.set(recordKey(first), '{broken')
    bootLibrary(b) // first is now damaged; second is active
    expect(useStore.getState().library.activeId).toBe(second)
    const props = { onClose: noop, onPickImport: noop, onBackup: noop }
    const tr = render('tr', <LibraryDialog {...props} />)
    expect(tr).toContain('Proje kütüphanesi')
    expect(tr).toContain('Yeni proje')
    expect(tr).toContain('Yeni proje olarak içe aktar')
    expect(tr).toContain('Etkin projeyi değiştir…')
    expect(tr).toContain('Çığlık Odası')
    expect(tr).toContain('Etkin')
    expect(tr).toContain('Bu proje okunamadı. Kayıtlı verisine dokunulmadı.')
    expect(tr).toContain('Ham veriyi indir')
    expect(tr).toContain('Güncellendi:')
    const en = render('en', <LibraryDialog {...props} />)
    expect(en).toContain('Project library')
    expect(en).toContain('Import as new project')
    expect(en).toContain('This project could not be read. Its stored data was left untouched.')
    expect(en).toContain('Updated ')
    expect(en).not.toContain('Proje kütüphanesi')
  })
})
