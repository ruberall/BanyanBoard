import { Routes, Route } from 'react-router-dom'
import { BoardListPage } from '@/pages/BoardListPage/BoardListPage'

function NotFoundPage() {
  return <div>404 Not Found</div>
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<BoardListPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
