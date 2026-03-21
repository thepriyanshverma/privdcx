from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.domain.organization.models import Organization, OrgMembership


class OrgRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_org(self, name: str, owner_id: str) -> Organization:
        org = Organization(name=name, owner_id=owner_id)
        self.db.add(org)
        await self.db.flush()
        return org

    async def create_membership(self, org_id: str, user_id: str, role: str) -> OrgMembership:
        membership = OrgMembership(org_id=org_id, user_id=user_id, role=role)
        self.db.add(membership)
        await self.db.flush()
        return membership

    async def get_user_orgs(self, user_id: str) -> list[Organization]:
        result = await self.db.execute(
            select(Organization)
            .join(OrgMembership, OrgMembership.org_id == Organization.id)
            .where(OrgMembership.user_id == user_id)
        )
        return list(result.scalars().all())

    async def get_org_by_id(self, org_id: str) -> Organization | None:
        result = await self.db.execute(select(Organization).where(Organization.id == org_id))
        return result.scalar_one_or_none()
