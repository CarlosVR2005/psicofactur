import { useEffect, useState } from 'react'
import { Check, Image as ImageIcon, Loader2, ReceiptText, TriangleAlert, Upload } from 'lucide-react'
import Card from '../../components/ui/Card'
import Boton from '../../components/ui/Boton'
import AvisoError from '../../components/ui/AvisoError'
import { Campo, Entrada, AreaTexto } from '../../components/ui/Campo'
import {
  getDatosFiscales,
  guardarDatosFiscales,
  guardarLogo,
} from '../../services/verifacti'
import { errorDeNif, normalizarNif } from '../../lib/nif'
import { FORMATOS_LOGO, prepararLogo } from '../../lib/logo'

/* Un IBAN se guarda sin espacios y en mayúsculas; se enseña agrupado de
   cuatro en cuatro, que es como se lee. */
const ibanLimpio = (s) => String(s ?? '').replace(/\s+/g, '').toUpperCase()
const ibanBonito = (s) => ibanLimpio(s).replace(/(.{4})/g, '$1 ').trim()

/* ================================================================
   Los datos fiscales de la consulta.

   Son los tres que van IMPRESOS en cada factura que se le entrega al
   paciente. Sin ellos el botón «Emitir» ni siquiera lo intenta: corta
   antes y trae aquí, porque si se dejara pasar se gastaría un número de
   factura para acabar fallando igual.

   Lo que NO se pone aquí es la clave de Verifacti. Esa determina el NIF
   emisor y el entorno ante la AEAT, así que vive como secreto de las
   Edge Functions y no pasa por el navegador.

   El NIF se comprueba al escribirlo. No es adorno: la primera factura
   que se envió de verdad la rechazó Hacienda por una letra de control
   cambiada, y ese rechazo llega un minuto después, cuando el número de
   factura ya está gastado.
   ================================================================ */
export default function DatosFiscales({ alAvisar }) {
  const [datos, setDatos] = useState(null)
  const [form, setForm] = useState({ nif: '', razonSocial: '', direccionFiscal: '', iban: '' })
  const [logo, setLogo] = useState(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getDatosFiscales().then(({ data, error: fallo }) => {
      if (fallo) setError(fallo)
      if (data) {
        setDatos(data)
        setLogo(data.logo)
        setForm({
          nif: data.nif,
          razonSocial: data.razonSocial,
          direccionFiscal: data.direccionFiscal,
          iban: ibanBonito(data.iban),
        })
      }
    })
  }, [])

  if (!datos) return null

  const problemaNif = errorDeNif(form.nif)
  const completo =
    form.nif.trim() && form.razonSocial.trim() && form.direccionFiscal.trim()
  const cambiado =
    normalizarNif(form.nif) !== datos.nif ||
    form.razonSocial.trim() !== datos.razonSocial ||
    form.direccionFiscal.trim() !== datos.direccionFiscal ||
    ibanLimpio(form.iban) !== ibanLimpio(datos.iban)

  /* El logo se guarda solo al elegirlo: no espera al botón Guardar,
     porque se ve el resultado al momento y esperar sería confuso.
     Con `fichero` a null, se quita. */
  const subirLogo = async (fichero) => {
    setError(null)
    setSubiendoLogo(true)
    try {
      const preparado = fichero ? await prepararLogo(fichero) : null
      const { data, error: fallo } = await guardarLogo(preparado?.dataUrl ?? null)
      if (fallo) {
        setError(fallo)
        return
      }
      setLogo(data)
      alAvisar?.({
        tipo: 'exito',
        titulo: fichero ? 'Logo guardado' : 'Logo quitado',
      })
    } catch (e) {
      // Lo que lanza prepararLogo ya está escrito para leerse
      setError({ mensaje: e.message, tecnico: e })
    } finally {
      setSubiendoLogo(false)
    }
  }

  const guardar = async () => {
    if (guardando || problemaNif) return
    setError(null)
    setGuardando(true)
    const { data, error: fallo } = await guardarDatosFiscales(form)
    setGuardando(false)

    if (fallo) {
      setError(fallo)
      return
    }

    setDatos({ ...data, faltan: [], completo: true })
    setForm({
      nif: data.nif,
      razonSocial: data.razonSocial,
      direccionFiscal: data.direccionFiscal,
      iban: ibanBonito(data.iban),
    })
    alAvisar?.({ tipo: 'exito', titulo: 'Datos de facturación guardados' })
  }

  const campo = (clave) => ({
    value: form[clave],
    onChange: (e) => setForm({ ...form, [clave]: e.target.value }),
    disabled: guardando,
  })

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-marca-50 p-2 text-marca-700">
          <ReceiptText className="size-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-tinta">Datos de facturación</h2>
          <p className="mt-0.5 text-sm text-tinta-suave">
            Van impresos en cada factura que se entrega al paciente.
          </p>
        </div>
      </div>

      {!datos.completo && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-ambar-suave px-4 py-3 text-sm text-ambar">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          <span>
            Hasta que estén completos no se pueden emitir facturas. Falta{' '}
            {datos.faltan.join(' y ')}.
          </span>
        </p>
      )}

      <AvisoError error={error} className="mt-4" />

      <div className="mt-5 space-y-4">
        <Campo
          etiqueta="Logo de la consulta"
          ayuda="Opcional. Sale arriba a la izquierda de la factura. PNG, JPG o WEBP."
        >
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-borde bg-crema">
              {logo ? (
                <img
                  src={logo}
                  alt="Logo de la consulta"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <ImageIcon className="size-6 text-tinta-tenue" strokeWidth={1.8} />
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-borde-fuerte bg-white px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-crema ${
                  subiendoLogo ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                {subiendoLogo ? (
                  <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
                ) : (
                  <Upload className="size-4" strokeWidth={2} />
                )}
                {logo ? 'Cambiar' : 'Subir logo'}
                <input
                  type="file"
                  accept={FORMATOS_LOGO.join(',')}
                  className="hidden"
                  disabled={subiendoLogo}
                  onChange={(e) => {
                    const fichero = e.target.files?.[0]
                    // Se limpia para poder volver a elegir el mismo fichero
                    e.target.value = ''
                    if (fichero) subirLogo(fichero)
                  }}
                />
              </label>

              {logo && (
                <Boton
                  variante="peligro"
                  onClick={() => subirLogo(null)}
                  disabled={subiendoLogo}
                >
                  Quitar
                </Boton>
              )}
            </div>
          </div>
        </Campo>

        <Campo
          etiqueta="Nombre fiscal"
          ayuda="El nombre y los apellidos que constan en Hacienda, o la razón social si factura a través de una sociedad."
        >
          <Entrada
            {...campo('razonSocial')}
            autoComplete="organization"
            placeholder="Nombre y apellidos"
          />
        </Campo>

        <Campo
          etiqueta="NIF"
          ayuda={
            problemaNif ? undefined : 'DNI, NIE o CIF. Se comprueba la letra de control.'
          }
        >
          <Entrada
            {...campo('nif')}
            // La letra siempre en mayúscula, para que no la escriba dos veces
            onBlur={() => setForm((f) => ({ ...f, nif: normalizarNif(f.nif) }))}
            placeholder="12345678Z"
            aria-invalid={Boolean(problemaNif)}
            className={problemaNif ? 'border-rojo focus:border-rojo focus:ring-rojo/20' : ''}
          />
          {problemaNif && (
            <span className="mt-1 block text-xs text-rojo">{problemaNif}</span>
          )}
        </Campo>

        <Campo
          etiqueta="Dirección fiscal"
          ayuda="Calle, número, código postal y localidad."
        >
          <AreaTexto {...campo('direccionFiscal')} rows={2} placeholder="Calle, nº · CP Localidad" />
        </Campo>

        <Campo
          etiqueta="Número de cuenta (IBAN)"
          ayuda="Opcional. Sale en la factura como forma de pago, para que sepan a dónde transferir."
        >
          <Entrada
            {...campo('iban')}
            onBlur={() => setForm((f) => ({ ...f, iban: ibanBonito(f.iban) }))}
            placeholder="ES00 0000 0000 0000 0000 0000"
            autoComplete="off"
            spellCheck={false}
          />
        </Campo>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        {!cambiado && datos.completo && (
          <span className="inline-flex items-center gap-1.5 text-sm text-verde">
            <Check className="size-4" strokeWidth={2.2} />
            Guardado
          </span>
        )}
        <Boton onClick={guardar} disabled={guardando || Boolean(problemaNif) || !cambiado || !completo}>
          {guardando && <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />}
          Guardar
        </Boton>
      </div>
    </Card>
  )
}
