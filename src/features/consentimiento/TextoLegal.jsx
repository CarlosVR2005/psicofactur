/* ================================================================
   El clausulado, pintado.

   El texto vive en `lib/consentimiento.js` —sin una sola etiqueta
   dentro— y aquí sólo se maqueta. Lo único que se interpreta son los
   **destacados**, que en el apartado de protección de datos marcan de
   qué habla cada párrafo («Responsable», «Tus derechos»…): sin ellos
   ese bloque es un muro de texto que nadie lee.
   ================================================================ */

/** Convierte «un **texto** así» en nodos, con lo marcado en negrita. */
function conDestacados(parrafo) {
  return parrafo.split('**').map((trozo, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-tinta">
        {trozo}
      </strong>
    ) : (
      trozo
    ),
  )
}

export default function TextoLegal({ secciones }) {
  return (
    <div className="space-y-6">
      {secciones.map((seccion) => (
        <section key={seccion.id}>
          <h3 className="mb-1.5 font-semibold text-tinta">{seccion.titulo}</h3>
          <div className="space-y-2.5 leading-relaxed text-tinta-suave">
            {seccion.parrafos.map((parrafo, i) => (
              <p key={i}>{conDestacados(parrafo)}</p>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
