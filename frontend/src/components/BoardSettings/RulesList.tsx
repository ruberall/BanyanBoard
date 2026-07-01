import { useDeleteAutomationRule, usePatchAutomationRuleEnabled } from '@/api/hooks'
import type { AutomationRule } from '@/types'
import styles from './RulesList.module.css'

function maskWebhookUrl(raw: string): string {
  try {
    const u = new URL(raw)
    return `${u.protocol}//${u.host}/***`
  } catch {
    return '***'
  }
}

interface RulesListProps {
  rules: AutomationRule[]
}

export function RulesList({ rules }: RulesListProps) {
  const deleteMutation = useDeleteAutomationRule()
  const patchMutation = usePatchAutomationRuleEnabled()

  if (rules.length === 0) {
    return <p className={styles.empty}>No rules yet. Add one below.</p>
  }

  return (
    <ul className={styles.list}>
      {rules.map((rule) => (
        <li key={rule.id} className={styles.rule}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={() =>
                patchMutation.mutate(
                  { boardId: rule.board_id, ruleId: rule.id, enabled: !rule.enabled },
                  {},
                )
              }
              aria-label={rule.enabled ? 'Enabled' : 'Enable'}
            />
            <span>{rule.enabled ? 'Enabled' : 'Enable'}</span>
          </label>
          <span className={styles.triggerType}>{rule.trigger_type}</span>
          <span className={styles.url} title="Webhook URL (masked for security)">{maskWebhookUrl(rule.webhook_url)}</span>
          <button
            type="button"
            onClick={() =>
              deleteMutation.mutate({ boardId: rule.board_id, ruleId: rule.id }, {})
            }
            aria-label="Delete rule"
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  )
}
