import { Routes, Route } from 'react-router-dom'
import { BoardListPage } from '@/pages/BoardListPage/BoardListPage'
import { BoardPage } from '@/pages/BoardPage/BoardPage'
import { NotFoundPage } from '@/pages/NotFoundPage/NotFoundPage'
import { LoginPage } from '@/pages/LoginPage/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage/RegisterPage'
import { PrivateRoute } from '@/components/PrivateRoute/PrivateRoute'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<PrivateRoute />}>
        <Route path="/" element={<BoardListPage />} />
        <Route path="/boards/:boardId" element={<BoardPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
