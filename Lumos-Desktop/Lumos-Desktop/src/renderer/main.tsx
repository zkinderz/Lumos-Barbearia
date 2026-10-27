import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ProvedorDados } from './estado'
import { ProvedorToast } from './componentes/ui'
import './tema.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProvedorToast>
      <ProvedorDados>
        <App />
      </ProvedorDados>
    </ProvedorToast>
  </StrictMode>
)
