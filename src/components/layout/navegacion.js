import { Users, CalendarDays, ReceiptEuro, MessageCircleHeart } from 'lucide-react'

/* Un único sitio donde se define la navegación: la barra lateral de
   escritorio y la barra inferior del móvil leen de aquí. */
export const SECCIONES = [
  { ruta: '/pacientes', etiqueta: 'Pacientes', icono: Users },
  { ruta: '/calendario', etiqueta: 'Calendario', icono: CalendarDays },
  { ruta: '/facturacion', etiqueta: 'Facturación', icono: ReceiptEuro },
  { ruta: '/recordatorios', etiqueta: 'Recordatorios', icono: MessageCircleHeart },
]
