"""Tashqi tizimlar (CRM/ERP) uchun ochiq REST API — X-API-Key bilan himoyalangan.

TZ 3.5: faqat ruxsat etilgan IP'lar va API Token orqali statistika o'qish va
qo'ng'iroq boshlash (click-to-call).
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import ApiKey
from ..schemas import CDRRecord, CDRStats
from ..security_keys import require_api_key

router = APIRouter(prefix="/api/v1", tags=["external-api"])


@router.get("/calls", response_model=list[CDRRecord])
async def external_calls(
    db: AsyncSession = Depends(get_db),
    key: ApiKey = Depends(require_api_key),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(100, le=1000),
):
    """Qo'ng'iroqlar ro'yxati (faqat o'qish)."""
    clauses, params = [], {"limit": limit}
    if date_from:
        clauses.append("calldate >= :date_from"); params["date_from"] = date_from
    if date_to:
        clauses.append("calldate <= :date_to"); params["date_to"] = date_to
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    rows = await db.execute(
        text(f"SELECT uniqueid, calldate, src, dst, disposition, duration, billsec, recordingfile "
             f"FROM cdr{where} ORDER BY calldate DESC LIMIT :limit"),
        params,
    )
    return [CDRRecord(**dict(r._mapping)) for r in rows]


@router.get("/stats", response_model=CDRStats)
async def external_stats(
    db: AsyncSession = Depends(get_db),
    key: ApiKey = Depends(require_api_key),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    """Umumiy statistika (faqat o'qish)."""
    clauses, params = [], {}
    if date_from:
        clauses.append("calldate >= :date_from"); params["date_from"] = date_from
    if date_to:
        clauses.append("calldate <= :date_to"); params["date_to"] = date_to
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    row = (await db.execute(
        text(
            f"""SELECT count(*) total,
            count(*) FILTER (WHERE disposition='ANSWERED')  answered,
            count(*) FILTER (WHERE disposition='NO ANSWER') no_answer,
            count(*) FILTER (WHERE disposition='BUSY')      busy,
            count(*) FILTER (WHERE disposition='FAILED')    failed,
            COALESCE(avg(billsec),0) avg_billsec,
            COALESCE(sum(billsec),0) total_billsec
        FROM cdr{where}"""
        ),
        params,
    )).mappings().one()
    return CDRStats(
        total=row["total"], answered=row["answered"], no_answer=row["no_answer"],
        busy=row["busy"], failed=row["failed"],
        avg_billsec=round(float(row["avg_billsec"]), 1),
        total_talk_minutes=round(float(row["total_billsec"]) / 60, 1),
    )


class OriginateRequest(BaseModel):
    channel: str   # masalan "PJSIP/900"
    exten: str     # teriladigan raqam


@router.post("/originate")
async def external_originate(data: OriginateRequest, key: ApiKey = Depends(require_api_key)):
    """Click-to-call: tashqi tizimdan qo'ng'iroq boshlash."""
    from ..main import ami
    if not ami or not ami.connected:
        raise HTTPException(status_code=503, detail="AMI ulanmagan")
    action_id = await ami.originate(data.channel, data.exten)
    return {"status": "initiated", "action_id": action_id}
