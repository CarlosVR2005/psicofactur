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

/** Quita tildes y pasa a minúsculas, para buscar sin preocuparse de acentos */
export function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
