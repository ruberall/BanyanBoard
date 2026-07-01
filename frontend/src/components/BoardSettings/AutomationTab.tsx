import { useAutomationRules } from '@/api/hooks'
import { NewRuleForm } from './NewRuleForm'
import { RulesList } from './RulesList'
import { DeliveryHistoryPanel } from './DeliveryHistoryPanel'
import styles from './AutomationTab.module.css'

interface AutomationTabProps {
  boardId: string
  settingsOpen?: boolean
}

export function AutomationTab({ boardId, settingsOpen = true }: AutomationTabProps) {
  const { data: rules = [], isLoading } = useAutomationRules(boardId)

  return (
    <div className={styles.tab}>
      <section>
        <h3>Rules</h3>
        {isLoading ? <div>Loading rules...</div> : <RulesList rules={rules} />}
      </section>
      <section>
        <h3>New Rule</h3>
        <NewRuleForm boardId={boardId} />
      </section>
      <section>
        <h3>Delivery History</h3>
        <DeliveryHistoryPanel boardId={boardId} settingsOpen={settingsOpen} />
      </section>
    </div>
  )
}
