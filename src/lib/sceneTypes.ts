import { Bell, Brain, Church, Eye, Flame, Footprints, Ghost, Moon, Radio, Siren, Skull, Wind, type LucideIcon } from 'lucide-react'
import { TYPE_ICONS, type Project } from './schema'

/** Curated lucide icons selectable for custom scene types (the names are what the project stores). */
export const TYPE_ICON_COMPONENTS: Record<(typeof TYPE_ICONS)[number], LucideIcon> = {
  Skull, Ghost, Eye, Moon, Flame, Footprints, Bell, Radio, Brain, Church, Siren, Wind,
}

/** Number of scenes that currently use the custom scene type. */
export const sceneTypeUsage = (p: Pick<Project, 'scenes'>, typeId: string): number => p.scenes.filter((s) => s.typeId === typeId).length
