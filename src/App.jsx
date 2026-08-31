import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProveedorAuth } from './store/AuthContext'
import AvisoVersion from './components/ui/AvisoVersion'
import RutaProtegida from './components/layout/RutaProtegida'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import ConsentimientoPage from './pages/ConsentimientoPage'
import PacientesPage from './pages/PacientesPage'
import PacienteDetallePage from './pages/PacienteDetallePage'
import CalendarioPage from './pages/CalendarioPage'
import FacturacionPage from './pages/FacturacionPage'
import RecordatoriosPage from './pages/RecordatoriosPage'
import AjustesPage from './pages/AjustesPage'
import RevisarEventosPage from './pages/RevisarEventosPage'
import ListaEsperaPage from './pages/ListaEsperaPage'

export default function App() {
  return (
    <ProveedorAuth>
      <BrowserRouter>
        <Routes>
          <Route path="/entrar" element={<LoginPage />} />

          {/* Pública de verdad: aquí entra el PACIENTE desde el enlace
              que le llega por correo, y no tiene cuenta de Supabase ni
              la va a tener. Lo que le identifica es el token del enlace.
              Va fuera de RutaProtegida a propósito. */}
          <Route path="/consentimiento" element={<ConsentimientoPage />} />

          {/* Todo lo demás exige sesión abierta */}
          <Route
            element={
              <RutaProtegida>
                <AppLayout />
              </RutaProtegida>
            }
          >
            <Route index element={<Navigate to="/calendario" replace />} />
            <Route path="/pacientes" element={<PacientesPage />} />
            <Route path="/pacientes/:id" element={<PacienteDetallePage />} />
            <Route path="/calendario" element={<CalendarioPage />} />
            <Route path="/facturacion" element={<FacturacionPage />} />
            <Route path="/recordatorios" element={<RecordatoriosPage />} />
            <Route path="/ajustes" element={<AjustesPage />} />
            <Route path="/revisar" element={<RevisarEventosPage />} />
            <Route path="/espera" element={<ListaEsperaPage />} />
            <Route path="*" element={<Navigate to="/calendario" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>

      <AvisoVersion />
    </ProveedorAuth>
  )
}
