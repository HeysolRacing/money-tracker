"""Admin commands.

Usage:
  python -m app.cli create-user --email you@example.com [--rfc XAXX010101000]
  python -m app.cli seed-categories --email you@example.com
"""

import argparse
import asyncio
import getpass
import sys

from sqlalchemy import select

from app.auth import service
from app.auth.models import User
from app.categories.service import seed_defaults
from app.db import SessionLocal


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


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-user", help="Crear el usuario de la aplicación")
    create.add_argument("--email", required=True)
    create.add_argument("--rfc", help="Tu RFC, para clasificar facturas emitidas/recibidas")
    seed = sub.add_parser("seed-categories", help="Crear las categorías predeterminadas faltantes")
    seed.add_argument("--email", required=True)

    args = parser.parse_args()
    if args.command == "create-user":
        asyncio.run(_create_user(args.email, args.rfc))
    elif args.command == "seed-categories":
        asyncio.run(_seed_categories(args.email))


if __name__ == "__main__":
    main()
