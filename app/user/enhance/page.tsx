import BackLink from '@/components/dashboard/BackLink'
import Enhance from '@/components/features/enhance/EnhanceClient'

export default function UserEnhancePage() {
  return (
    <div className="p-0">
      <BackLink href="/user/ai-labs" />
      <Enhance />
    </div>
  )
}
