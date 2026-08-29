import { useEffect, useState } from 'react'
import Cabecera from '../components/layout/Cabecera'
import Aviso from '../components/ui/Aviso'
import DatosFiscales from '../features/ajustes/DatosFiscales'
import HorarioTrabajo from '../features/ajustes/HorarioTrabajo'
import ConexionGoogle from '../features/ajustes/ConexionGoogle'
import ConexionWhatsApp from '../features/ajustes/ConexionWhatsApp'
import { leerResultadoConexion } from '../services/googleCalendar'

/* Ajustes de la consulta.

   Los datos fiscales van los primeros a propósito: sin ellos no se
   puede emitir ni una factura, y el botón «Emitir» trae aquí cuando
   faltan. Debajo, las conexiones con Google Calendar y WhatsApp. */
export default function AjustesPage() {
  const [aviso, setAviso] = useState(null)

  // Al volver de Google, la URL trae el resultado (?google=ok, …)
  useEffect(() => {
    setAviso(leerResultadoConexion())
  }, [])

  return (
    <>
      <Cabecera
        titulo="Ajustes"
        subtitulo="Datos de facturación y conexiones con otras aplicaciones."
      />

      <div className="space-y-4">
        <DatosFiscales alAvisar={setAviso} />
        <HorarioTrabajo alAvisar={setAviso} />
        <ConexionGoogle alAvisar={setAviso} />
        <ConexionWhatsApp alAvisar={setAviso} />
      </div>

      {/* Archivos estáticos (public/*.html): <a> normal, y en pestaña
          nueva para no salir de la aplicación. */}
      <p className="mt-6 text-center text-sm text-tinta-tenue">
        <a
          href="/privacidad.html"
          target="_blank"
          rel="noopener"
          className="underline underline-offset-2 hover:text-tinta"
        >
          Política de privacidad
        </a>
        <span className="mx-1.5">·</span>
        <a
          href="/condiciones.html"
          target="_blank"
          rel="noopener"
          className="underline underline-offset-2 hover:text-tinta"
        >
          Condiciones del servicio
        </a>
      </p>

      <Aviso aviso={aviso} alCerrar={() => setAviso(null)} />
    </>
  )
}
