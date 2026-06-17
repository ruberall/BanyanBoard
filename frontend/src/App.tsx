import { Routes, Route } from 'react-router-dom'
import { BoardListPage } from '@/pages/BoardListPage/BoardListPage'
import { BoardPage } from '@/pages/BoardPage/BoardPage'
import { NotFoundPage } from '@/pages/NotFoundPage/NotFoundPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<BoardListPage />} />
      <Route path="/boards/:boardId" element={<BoardPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
