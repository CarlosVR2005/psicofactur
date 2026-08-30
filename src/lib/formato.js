/** 60 -> '60,00 €' */
export function euros(importe) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(importe)
}

/** 60 -> '60 €' (sin decimales cuando es redondo) */
export function eurosCorto(importe) {
  return Number.isInteger(importe) ? `${importe} €` : euros(importe)
}

/** '612345678' -> '612 345 678' */
export function telefono(numero) {
  const limpio = String(numero).replace(/\s/g, '')
  return limpio.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')
}

/** 'Lucía Fernández Molina' -> 'LF' */
export function iniciales(nombre) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

/** 1536000 -> '1,5 MB' · 4096 -> '4 KB'. Para el tamaño de los adjuntos. */
export function tamanoArchivo(bytes) {
  const n = Number(bytes)
  if (!n || n < 0) return ''
  const kb = n / 1024
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`
}

/** Quita tildes y pasa a minúsculas, para buscar sin preocuparse de acentos */
export function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
