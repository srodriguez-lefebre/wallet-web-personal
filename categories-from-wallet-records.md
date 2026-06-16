# Categorías extraídas de `wallet_records.csv`

## Resumen

Se leyeron 477 movimientos desde `wallet_records.csv`, tomando la segunda columna (`category`).

El archivo contiene 54 categorías únicas en bruto. Al normalizar solo espacios al inicio/final, quedan 53 categorías únicas: hay dos variantes de `Transportation`, una de ellas con un espacio final.

La jerarquía propuesta es inferida por nombre de categoría, tipo de movimiento observado (`Income`/`Expense`) y, en algunos casos, por notas o payees visibles en los registros. No se modificó el CSV.

## Tabla de categorías únicas

| Categoría | Cantidad | Padre sugerido | Motivo breve |
|---|---:|---|---|
| Active sport, fitness | 6 | Life & Entertainment | Actividad deportiva/recreativa; parece subcategoría de ocio. |
| Alcohol y previa | 6 | Food & Drinks | Consumo de alcohol/comida asociado a salidas. |
| Alquiler | 10 | Housing | Gasto recurrente de vivienda. |
| Ayuda Familiar | 7 | Income | Aparece mayormente como ingreso; parece ayuda/aporte familiar. |
| Bank | 3 | Financial expenses | Nombre financiero; revisar porque hay notas no bancarias. |
| Bar, cafe | 12 | Food & Drinks | Consumo gastronómico. |
| Barbacoa | 1 | Food & Drinks | Compra/comida asociada a reunión o comida. |
| Books, audio, subscriptions | 15 | Life & Entertainment | Libros, audio y suscripciones son consumo cultural/digital. |
| Charity, gifts | 7 | Life & Entertainment | Regalos/donaciones; puede vivir dentro de ocio/vida personal. |
| Clothes & Footwear | 8 | Shopping | Ropa y calzado; sugiere un padre de compras aunque no aparece como categoría. |
| Credito Volar | 2 | Financial expenses | Parece pago de crédito/deuda. |
| Culture, sport events | 1 | Life & Entertainment | Eventos culturales o deportivos. |
| Drug-store, chemist | 3 | Health care, doctor | Farmacia; se aproxima más a salud que a compras generales. |
| Education, development | 4 | Life & Entertainment | Formación/desarrollo personal; podría ser padre propio, pero aquí funciona como subcategoría. |
| Entradas | 10 | Life & Entertainment | Tickets/entradas para eventos o salidas. |
| Fam | 2 | Family | Nombre abreviado de familia; el padre sugerido no aparece como categoría. |
| Financial expenses | 1 | Padre | Categoría amplia de gastos financieros. |
| Food & Drinks | 18 | Padre | Categoría amplia de comida y bebida. |
| Frutas, verduras y saludables | 13 | Food & Drinks | Alimentos específicos/saludables. |
| Gastos Comunes | 11 | Housing | Gasto común de vivienda. |
| Gifts, joy | 1 | Life & Entertainment | Regalos/placer personal; cercano a ocio o vida personal. |
| Groceries | 42 | Food & Drinks | Supermercado/comestibles. |
| Hardware | 1 | Shopping | Compra de artículo físico; nota indica HDMI. |
| Health care, doctor | 1 | Padre | Categoría amplia de salud/medicina. |
| Holiday, trips, hotels | 9 | Life & Entertainment | Viajes/hoteles como ocio o vacaciones. |
| Housing | 3 | Padre | Categoría amplia de vivienda. |
| Income | 1 | Padre | Categoría amplia de ingresos. |
| Life & Entertainment | 21 | Padre | Categoría amplia de ocio/vida personal. |
| Long distance | 6 | Transportation | Traslados de larga distancia. |
| Luz | 11 | Housing | Servicio de electricidad del hogar. |
| Maintenance, repairs | 3 | Housing | Mantenimiento o reparaciones, probablemente del hogar. |
| Money services | 1 | Financial expenses | Servicio financiero/procesador de pago. |
| Otros | 1 | Padre | Categoría genérica sin padre claro. |
| Pago Amigo | 40 | Income | Todos los registros observados son ingresos. |
| Parking | 1 | Transportation | Estacionamiento relacionado con transporte. |
| Parte mama | 10 | Income | Aporte familiar registrado como ingreso. |
| Parte papa | 10 | Income | Aporte familiar registrado como ingreso. |
| Public transport | 1 | Transportation | Transporte público. |
| Restaurant, fast-food | 82 | Food & Drinks | Restaurantes y comida rápida. |
| Salidas | 4 | Life & Entertainment | Salidas sociales/ocio. |
| Savings | 2 | Padre | Categoría amplia de ahorro. |
| Service station | 17 | Transportation | Estación de servicio/combustible. |
| Services | 1 | Housing | Nota observada: servicios públicos/UTE. |
| Software, apps, games | 4 | Life & Entertainment | Apps, juegos y software de consumo digital. |
| Taxi | 12 | Transportation | Traslado en taxi/app. |
| Telephony, mobile phone | 1 | Services | Servicio de telefonía móvil. |
| Transportation | 3 | Padre | Categoría amplia de transporte. |
| Transportation [espacio final] | 1 | Transportation | Mismo nombre con espacio final; parece duplicado accidental. |
| Tributos | 4 | Housing | Impuestos/tributos posiblemente asociados a vivienda; requiere confirmar. |
| TV, Streaming | 2 | Life & Entertainment | Streaming y entretenimiento audiovisual. |
| Unknown expense | 3 | Otros | Gasto sin clasificar. |
| Wage, invoices | 10 | Income | Sueldo/facturación; todos ingresos. |
| Wellness, beauty | 14 | Health care, doctor | Belleza/cuidado personal; varias notas de farmacia/perfumes/corte. |
| Wifi | 14 | Housing | Servicio de internet del hogar. |

## Dudas y ambigüedades

- `Transportation` aparece dos veces como categoría única en bruto: una versión normal y otra con un espacio final. Conviene normalizarla antes de usarla como clave.
- `Bank` tiene nombre financiero, pero al menos una nota visible (`PANALERA NATAL 27`) no parece bancaria. Podría estar mal categorizada en origen.
- `Ayuda Familiar` es mayormente ingreso, pero tiene un registro como gasto. La dejé bajo `Income`, aunque podría requerir una categoría familiar separada si se quiere distinguir aportes recibidos y enviados.
- `Life & Entertainment`, `Transportation` y `Wellness, beauty` incluyen algunos registros de tipo `Income`; probablemente sean reembolsos o correcciones, pero no se puede asegurar solo con la categoría.
- `Services` fue asignada a `Housing` porque la nota visible menciona servicios públicos/UTE. Si se quiere una taxonomía más general, podría ser padre junto con `Telephony, mobile phone`.
- `Tributos` fue asignada a `Housing` por inferencia local, pero podría ser un padre financiero/impositivo propio si incluye impuestos no vinculados a vivienda.
- `Clothes & Footwear`, `Hardware` y `Fam` sugieren padres (`Shopping`, `Family`) que no aparecen como categorías en el CSV.
- `Alcohol y previa` podría ir en `Life & Entertainment` si se prioriza el contexto social, o en `Food & Drinks` si se prioriza el tipo de consumo. La propuesta actual usa `Food & Drinks`.
