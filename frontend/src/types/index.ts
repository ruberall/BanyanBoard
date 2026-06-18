export interface User {
  id: string
  email: string
}

export interface Board {
  id: string
  name: string
  created_at: string
}

export interface Column {
  id: string
  name: string
  position: number
  created_at: string
}

export interface Card {
  id: string
  column_id: string
  title: string
  description: string | null
  due_date: string | null
  labels: string[]
  position: number
  created_at: string
  updated_at: string
}

export interface BoardWithColumns extends Board {
  columns: Column[]
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}
