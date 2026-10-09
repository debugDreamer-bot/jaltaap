import { useTranslation } from 'react-i18next'
import { USE_MOCK } from '../config'

export function MockBanner() {
  const { t } = useTranslation()
  if (!USE_MOCK) return null
  return (
    <div role="alert" className="mock-banner shrink-0 px-4 py-1.5 text-center font-bold">
      {t('mock.banner')}
    </div>
  )
}
