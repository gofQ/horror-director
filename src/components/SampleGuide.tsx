import { useState } from 'react'
import { BookOpen, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { isShowcase } from '../lib/showcase'

const KEY = 'horror-director:guide-hidden'
const hidden = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** "Explore the sample": a dismissible guide shown over the graph when the active project is the showcase. */
export function SampleGuide() {
  const { t } = useT()
  const showcase = useStore((s) => isShowcase(s.project))
  const [off, setOff] = useState(hidden)
  if (!showcase || off) return null
  const hide = () => {
    setOff(true)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* the guide simply comes back next time */
    }
  }
  return (
    <aside className="sample-guide card" data-testid="sample-guide" aria-label={t('guide.title')}>
      <div className="sample-guide-head">
        <strong>
          <BookOpen size={14} /> {t('guide.title')}
        </strong>
        <button className="btn icon small" data-testid="sample-guide-hide" onClick={hide} aria-label={t('guide.hide')} title={t('guide.hide')}>
          <X size={13} />
        </button>
      </div>
      <p className="muted small">{t('guide.intro')}</p>
      <ol>
        {([1, 2, 3, 4, 5, 6, 7] as const).map((i) => (
          <li key={i}>{t(`guide.item.${i}` as 'guide.item.1')}</li>
        ))}
      </ol>
      <strong className="small">{t('guide.editor')}</strong>
      <ul>
        {([1, 2, 3, 4] as const).map((i) => (
          <li key={i}>{t(`guide.editor.${i}` as 'guide.editor.1')}</li>
        ))}
      </ul>
    </aside>
  )
}
