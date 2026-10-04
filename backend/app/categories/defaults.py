"""Default categories created for a new user: {parent: [children]}."""

EXPENSE: dict[str, list[str]] = {
    "Hogar": ["Renta / Hipoteca", "Luz, agua y gas", "Internet y teléfono", "Mantenimiento"],
    "Alimentación": ["Supermercado", "Restaurantes", "Cafeterías"],
    "Transporte": ["Gasolina", "Uber / Taxi", "Casetas y estacionamiento", "Mantenimiento auto"],
    "Salud": ["Médico", "Farmacia", "Seguros"],
    "Entretenimiento": ["Suscripciones", "Salidas", "Viajes"],
    "Compras": ["Ropa", "Electrónica", "Departamentales"],
    "Educación": [],
    "Finanzas": ["Comisiones bancarias", "Intereses", "Impuestos"],
    "Otros gastos": [],
}

INCOME: dict[str, list[str]] = {
    "Salario": [],
    "Honorarios": [],
    "Rendimientos": [],
    "Reembolsos": [],
    "Otros ingresos": [],
}
