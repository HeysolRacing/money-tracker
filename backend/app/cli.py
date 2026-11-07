"""Admin commands.

Usage:
  python -m app.cli create-user --email you@example.com [--rfc XAXX010101000]
  python -m app.cli seed-categories --email you@example.com
  python -m app.cli import-investments --email you@example.com [--dry-run] < investment.csv
"""

import argparse
import asyncio
import getpass
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.models import User
from app.categories.service import seed_defaults
from app.db import SessionLocal
from app.investments.importer import SheetError, import_sheet, parse_sheet


async def _create_user(email: str, rfc: str | None) -> None:
    password = getpass.getpass("Contraseña: ")
    if len(password) < 8:
        sys.exit("La contraseña debe tener al menos 8 caracteres.")
    if password != getpass.getpass("Confirmar contraseña: "):
        sys.exit("Las contraseñas no coinciden.")
    async with SessionLocal() as db:
        user = await service.create_user(db, email, password, rfc.upper() if rfc else None)
        created = await seed_defaults(db, user.id)
    print(f"Usuario creado: {user.email} ({created} categorías predeterminadas)")


async def _seed_categories(email: str) -> None:
    async with SessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == email.lower().strip()))
        if user is None:
            sys.exit(f"No existe el usuario {email}")
        created = await seed_defaults(db, user.id)
    print(f"{created} categorías creadas para {email}")


async def _user_id(db: AsyncSession, email: str) -> int:
    user = await db.scalar(select(User).where(User.email == email.lower().strip()))
    if user is None:
        sys.exit(f"No existe el usuario {email}")
    return user.id


async def _import_investments(email: str, text: str, dry_run: bool) -> None:
    try:
        sheet = parse_sheet(text)
    except SheetError as exc:
        sys.exit(f"No se importó nada: {exc}")
    async with SessionLocal() as db:
        result = await import_sheet(db, await _user_id(db, email), sheet, dry_run=dry_run)
    print(f"{'Simulación' if dry_run else 'Importado'} {sheet.year}: {len(sheet.rows)} filas")
    for name in result.investments_created:
        print(f"  + inversión {name}")
    print(
        f"  saldos: {result.balances_created} nuevos, {result.balances_updated} actualizados, "
        f"{result.balances_unchanged} sin cambios"
    )
    if dry_run:
        print("  (simulación: no se guardó nada)")


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-user", help="Crear el usuario de la aplicación")
    create.add_argument("--email", required=True)
    create.add_argument("--rfc", help="Tu RFC, para clasificar facturas emitidas/recibidas")
    seed = sub.add_parser("seed-categories", help="Crear las categorías predeterminadas faltantes")
    seed.add_argument("--email", required=True)

    imp = sub.add_parser(
        "import-investments", help="Importar saldos mensuales de inversiones desde un CSV"
    )
    imp.add_argument("--email", required=True)
    imp.add_argument("--file", default="-", help="Ruta del CSV, o - para leer de stdin")
    imp.add_argument("--dry-run", action="store_true", help="Validar sin guardar")

    args = parser.parse_args()
    if args.command == "create-user":
        asyncio.run(_create_user(args.email, args.rfc))
    elif args.command == "seed-categories":
        asyncio.run(_seed_categories(args.email))
    elif args.command == "import-investments":
        text = sys.stdin.read() if args.file == "-" else Path(args.file).read_text("utf-8-sig")
        asyncio.run(_import_investments(args.email, text, args.dry_run))


if __name__ == "__main__":
    main()
