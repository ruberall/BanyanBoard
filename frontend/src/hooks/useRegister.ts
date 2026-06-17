import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { register } from '@/api/endpoints'

export function useRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: register,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.auth.me }),
  })
}
