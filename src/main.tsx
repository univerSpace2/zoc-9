import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import '@/index.css'
import { AuthSessionBootstrap } from '@/app/AuthSessionBootstrap'
import { UiBootstrap } from '@/app/UiBootstrap'
import { queryClient } from '@/lib/query-client'
import { initPwa } from '@/lib/pwa'
import { router } from '@/app/router'

initPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthSessionBootstrap />
      <UiBootstrap />
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
