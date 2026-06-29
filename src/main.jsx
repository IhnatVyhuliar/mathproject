import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'

import './styles/tokens.css'
import './styles/global.css'
import './styles/app.css'

import App from './App.jsx'
import HomePage from './pages/HomePage.jsx'
import ClassLayout from './pages/ClassLayout.jsx'
import PlayersPage from './pages/PlayersPage.jsx'
import RankingPage from './pages/RankingPage.jsx'
import EditPage from './pages/EditPage.jsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'class/:classId',
        element: <ClassLayout />,
        children: [
          { index: true, element: <Navigate to="players" replace /> },
          { path: 'players', element: <PlayersPage /> },
          { path: 'ranking', element: <RankingPage /> },
          { path: 'edit', element: <EditPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
