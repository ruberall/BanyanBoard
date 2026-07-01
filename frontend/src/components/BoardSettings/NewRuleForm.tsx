import { useState } from 'react'
import { useCreateAutomationRule } from '@/api/hooks'
import { ErrorBanner } from '@/components/common/ErrorBanner/ErrorBanner'
import styles from './NewRuleForm.module.css'

interface NewRuleFormProps {
  boardId: string
}

export function NewRuleForm({ boardId }: NewRuleFormProps) {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [triggerType, setTriggerType] = useState('card.moved.done')
  const [enabled, setEnabled] = useState(true)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [bannerError, setBannerError] = useState<string | null>(null)

  const { mutate, isPending } = useCreateAutomationRule()

  function validateUrl(value: string): string | null {
    if (!value.trim()) return 'This field is required'
    try {
      const url = new URL(value)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'Must use http or https protocol'
      }
      return null
    } catch {
      return 'Must be a valid address (e.g. https://example.com)'
    }
  }

  function handleBlur() {
    setUrlError(validateUrl(webhookUrl))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const error = validateUrl(webhookUrl)
    if (error) {
      setUrlError(error)
      return
    }
    setBannerError(null)
    mutate(
      { boardId, triggerType, webhookUrl, enabled },
      {
        onSuccess: () => {
          setWebhookUrl('')
          setTriggerType('card.moved.done')
          setEnabled(true)
          setUrlError(null)
        },
        onError: () => setBannerError('Failed to add rule. Please check the URL and try again.'),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {bannerError && <ErrorBanner message={bannerError} onDismiss={() => setBannerError(null)} />}
      <div className={styles.field}>
        <label htmlFor="trigger-type">Trigger type</label>
        <select
          id="trigger-type"
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value)}
        >
          <option value="card.moved.done">Card moved to Done</option>
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="webhook-url">Webhook URL</label>
        <input
          id="webhook-url"
          type="text"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          onBlur={handleBlur}
          placeholder="https://..."
          aria-describedby={urlError ? 'webhook-url-error' : undefined}
          aria-invalid={!!urlError}
        />
        {urlError && (
          <span id="webhook-url-error" role="alert" className={styles.fieldError}>
            {urlError}
          </span>
        )}
      </div>
      <div className={styles.field}>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            aria-label="Enable rule immediately"
          />
          {' '}Enable rule immediately
        </label>
      </div>
      <button type="submit" disabled={isPending}>
        {isPending ? 'Adding...' : 'Add Rule'}
      </button>
    </form>
  )
}
