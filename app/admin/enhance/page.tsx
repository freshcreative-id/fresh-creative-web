import BackLink from '@/components/dashboard/BackLink'
import Enhance from '@/components/features/enhance/EnhanceClient'

export default function AdminEnhancePage() {
  return (
    <div className="p-0">
      <BackLink href="/admin/ai-labs" />
      <Enhance />
    </div>
  )
}
