import { useState } from 'react'
import { BookOpen, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { translate } from '../i18n'
import { showcaseVariant } from '../lib/showcase'

const KEY = 'horror-director:guide-hidden'
const hidden = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/**
 * "Explore the sample": a dismissible guide shown over the graph when the active project is the showcase. The guide text
 * follows the SAMPLE's language (it names the sample's own scenes and nodes), not the interface language.
 */
export function SampleGuide() {
  const { t } = useT()
  const variant = useStore((s) => showcaseVariant(s.project))
  const [off, setOff] = useState(hidden)
  if (!variant || off) return null
  const g = (key: 'guide.title' | 'guide.intro' | 'guide.editor' | `guide.item.${number}` | `guide.editor.${number}`) => translate(variant, key as 'guide.title')
  const hide = () => {
    setOff(true)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* the guide simply comes back next time */
    }
  }
  return (
    <aside className="sample-guide card" data-testid="sample-guide" aria-label={g('guide.title')} lang={variant}>
      <div className="sample-guide-head">
        <strong>
          <BookOpen size={14} /> {g('guide.title')}
        </strong>
        <button className="btn icon small" data-testid="sample-guide-hide" onClick={hide} aria-label={t('guide.hide')} title={t('guide.hide')}>
          <X size={13} />
        </button>
      </div>
      <p className="muted small">{g('guide.intro')}</p>
      <ol>
        {([1, 2, 3, 4, 5, 6, 7] as const).map((i) => (
          <li key={i}>{g(`guide.item.${i}` as 'guide.item.1')}</li>
        ))}
      </ol>
      <strong className="small">{g('guide.editor')}</strong>
      <ul>
        {([1, 2, 3, 4] as const).map((i) => (
          <li key={i}>{g(`guide.editor.${i}` as 'guide.editor.1')}</li>
        ))}
      </ul>
    </aside>
  )
}
