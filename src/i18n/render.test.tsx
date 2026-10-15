import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLang } from './store'
import { useStore } from '../store/useStore'
import { AnalysisView } from '../components/AnalysisView'
import { ImportDialog } from '../components/ImportDialog'
import { diag } from '../lib/diagnostics'
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
})
