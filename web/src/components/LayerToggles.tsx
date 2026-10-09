import { useTranslation } from 'react-i18next'
import type { IconName } from '../lib/icons'
import type { LayerVisibility } from '../map/RiskMap'
import { Icon } from './Icon'

const ITEMS: Array<{ key: keyof LayerVisibility; icon: IconName }> = [
  { key: 'heat', icon: 'thermometer' },
  { key: 'flood', icon: 'waves' },
  { key: 'reports', icon: 'camera' },
  { key: 'relief', icon: 'cooling' },
]

export function LayerToggles({ value, onChange }: { value: LayerVisibility; onChange: (v: LayerVisibility) => void }) {
  const { t } = useTranslation()
  return (
    <fieldset>
      <legend className="mb-1 text-lg font-bold">{t('layers.title')}</legend>
      <div className="flex flex-wrap gap-2">
        {ITEMS.map(({ key, icon }) => (
          <label
            key={key}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-2 border-line bg-white px-2.5 py-1.5 has-[:checked]:border-brand has-[:checked]:bg-[#e7f1f8]"
          >
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-[#0b3d5c]"
              checked={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            />
            <Icon name={icon} size={20} className="shrink-0" />
            <span className="font-semibold">{t(`layers.${key}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
