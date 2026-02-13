"""
Hotel PMS Backend - Multi-Tenant Property Management System
Language: Spanish (Peru), Currency: PEN, Timezone: America/Lima
"""

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, Query, Body
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any, Literal
import uuid
from datetime import datetime, timezone, date, timedelta
from enum import Enum
import bcrypt
import jwt
from bson import ObjectId
import base64
import json
import io
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'hotel-pms-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# App Configuration
app = FastAPI(title="Hotel PMS API", version="1.0.0")
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============== ENUMS ==============
class Role(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    RECEPTIONIST = "RECEPTIONIST"
    HOUSEKEEPING = "HOUSEKEEPING"

class OccupancyStatus(str, Enum):
    VACANT = "VACANT"
    OCCUPIED = "OCCUPIED"
    DUE_OUT = "DUE_OUT"

class HousekeepingStatus(str, Enum):
    DIRTY = "DIRTY"
    CLEANING = "CLEANING"
    CLEAN = "CLEAN"
    INSPECT = "INSPECT"
    OUT_OF_ORDER = "OUT_OF_ORDER"

class ReservationStatus(str, Enum):
    PREBOOK = "PREBOOK"
    CONFIRMED = "CONFIRMED"
    CHECKED_IN = "CHECKED_IN"
    CHECKED_OUT = "CHECKED_OUT"
    NO_SHOW = "NO_SHOW"
    CANCELLED = "CANCELLED"

class InvoiceType(str, Enum):
    BOLETA = "BOLETA"
    FACTURA = "FACTURA"

class InvoiceStatus(str, Enum):
    DRAFT = "DRAFT"
    SENT = "SENT"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    VOIDED = "VOIDED"
    PENDING = "PENDING"

class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARN = "WARN"
    CRITICAL = "CRITICAL"

class PaymentMethod(str, Enum):
    CASH = "EFECTIVO"
    CARD = "TARJETA"
    TRANSFER = "TRANSFERENCIA"
    YAPE_PLIN = "YAPE_PLIN"
    OTHER = "OTRO"

class DocType(str, Enum):
    DNI = "DNI"
    CE = "CE"
    PASSPORT = "PASAPORTE"
    RUC = "RUC"

# ============== PYDANTIC MODELS ==============
class PyObjectId(str):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate
    
    @classmethod
    def validate(cls, v, handler=None):
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, str):
            return v
        raise ValueError("Invalid ObjectId")

def serialize_doc(doc: dict) -> dict:
    """Convert MongoDB document to JSON-serializable dict"""
    if doc is None:
        return None
    if "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            doc[key] = str(value)
        elif isinstance(value, datetime):
            doc[key] = value.isoformat()
        elif isinstance(value, dict):
            doc[key] = serialize_doc(value)
        elif isinstance(value, list):
            doc[key] = [serialize_doc(item) if isinstance(item, dict) else (str(item) if isinstance(item, ObjectId) else item) for item in value]
    return doc

# Auth Models
class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: Role
    tenant_id: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

# Tenant Models
class TenantCreate(BaseModel):
    name: str
    ruc: str
    razon_social: Optional[str] = None
    nombre_comercial: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    # Admin user
    admin_email: Optional[str] = None
    admin_password: Optional[str] = None
    admin_name: Optional[str] = None

class TenantInvoicingConfig(BaseModel):
    nubefact_ruta: Optional[str] = None
    nubefact_token: Optional[str] = None
    invoicing_mode: Literal["MOCK", "LIVE"] = "MOCK"
    boleta_series: str = "B001"
    boleta_correlative: int = 1
    factura_series: str = "F001"
    factura_correlative: int = 1
    igv_rate: float = 18.0

# Room Models
class RoomTypeCreate(BaseModel):
    name: str
    capacity: int
    amenities: List[str] = []
    base_price: float

class RoomCreate(BaseModel):
    number: str
    floor: int
    room_type_id: str
    notes: Optional[str] = None

class RoomBulkCreate(BaseModel):
    room_type_id: str
    floor: int
    start_number: int
    count: int
    prefix: str = ""

# Guest Models
class GuestCreate(BaseModel):
    doc_type: DocType
    doc_number: str
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    nationality: Optional[str] = "PE"
    address: Optional[str] = None

# Reservation Models
class ReservationCreate(BaseModel):
    guest_id: str
    checkin_date: date
    checkout_date: date
    room_type_id: str
    room_id: Optional[str] = None
    adults: int = 1
    children: int = 0
    total_estimated: float
    deposit_amount: float = 0
    source: str = "DIRECTO"
    notes: Optional[str] = None

class ReservationUpdate(BaseModel):
    checkin_date: Optional[date] = None
    checkout_date: Optional[date] = None
    room_id: Optional[str] = None
    status: Optional[ReservationStatus] = None
    notes: Optional[str] = None
    cancel_reason: Optional[str] = None

# Group Reservation Models
class GroupReservationCreate(BaseModel):
    group_name: str
    contact_name: str
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    checkin_date: date
    checkout_date: date
    rooms: List[dict]  # [{"room_type_id": "...", "quantity": 2}]
    adults: int = 1
    children: int = 0
    deposit_amount: float = 0
    notes: Optional[str] = None

# Email Models
class EmailRequest(BaseModel):
    recipient_email: EmailStr
    subject: str
    html_content: str

class EmailTemplate(str, Enum):
    RESERVATION_CONFIRMATION = "RESERVATION_CONFIRMATION"
    CHECKIN_CONFIRMATION = "CHECKIN_CONFIRMATION"
    CHECKOUT_REMINDER = "CHECKOUT_REMINDER"
    PAYMENT_RECEIPT = "PAYMENT_RECEIPT"

# Rate Management Models
class RateCreate(BaseModel):
    room_type_id: str
    date_from: date
    date_to: date
    price: float
    name: Optional[str] = None  # e.g., "Temporada Alta", "Feriado"
    min_stay: int = 1

# Folio Models
class ChargeCreate(BaseModel):
    concept: str
    quantity: float = 1
    unit_price: float
    tax_type: str = "IGV"
    category: str = "HABITACION"

class PaymentCreate(BaseModel):
    method: PaymentMethod
    amount: float
    reference: Optional[str] = None

class VoidRequest(BaseModel):
    reason: str

# Cash Shift Models
class CashShiftOpen(BaseModel):
    opening_amount: float

class CashShiftClose(BaseModel):
    counted_cash: float
    notes: Optional[str] = None

class CashMovementCreate(BaseModel):
    type: Literal["IN", "OUT"]
    amount: float
    reason: str

# Invoice Models
class InvoiceCreate(BaseModel):
    folio_id: str
    type: InvoiceType
    client_doc_type: DocType
    client_doc_number: str
    client_name: str
    client_address: Optional[str] = None

# Housekeeping Models
class HousekeepingStatusUpdate(BaseModel):
    status: HousekeepingStatus
    notes: Optional[str] = None

# Maintenance Models
class MaintenanceTicketCreate(BaseModel):
    room_id: str
    title: str
    description: str
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    estimated_cost: Optional[float] = None

# Alert Models
class AlertResolve(BaseModel):
    notes: Optional[str] = None

# ============== AUTH HELPERS ==============
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, email: str, role: str, tenant_id: str = None) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "tenant_id": tenant_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token no proporcionado")
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

def require_roles(*roles: Role):
    async def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] not in [r.value for r in roles]:
            raise HTTPException(status_code=403, detail="Permisos insuficientes")
        return user
    return role_checker

def get_tenant_filter(user: dict) -> dict:
    """Get tenant filter for queries based on user role"""
    if user["role"] == Role.SUPER_ADMIN.value:
        return {}  # Super admin can see all
    if not user.get("tenant_id"):
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")
    return {"tenant_id": user["tenant_id"]}

# ============== AUDIT HELPER ==============
async def create_audit_log(tenant_id: str, user_id: str, entity: str, action: str, before: dict = None, after: dict = None):
    await db.audit_logs.insert_one({
        "tenant_id": tenant_id,
        "user_id": user_id,
        "entity": entity,
        "action": action,
        "before_json": before,
        "after_json": after,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

# ============== ALERT HELPER ==============
async def create_alert(tenant_id: str, alert_type: str, severity: AlertSeverity, title: str, message: str, entity_ref: dict = None):
    await db.alerts.insert_one({
        "tenant_id": tenant_id,
        "type": alert_type,
        "severity": severity.value,
        "title": title,
        "message": message,
        "entity_ref": entity_ref or {},
        "status": "OPEN",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "resolved_by": None,
        "resolved_at": None,
        "notes": None
    })

# ============== NUBEFACT MOCK SERVICE ==============
class NubeFactService:
    @staticmethod
    async def send_invoice(tenant: dict, invoice_data: dict) -> dict:
        config = tenant.get("invoicing_config", {})
        mode = config.get("invoicing_mode", "MOCK")
        
        if mode == "MOCK":
            return NubeFactService._mock_response(invoice_data)
        else:
            return await NubeFactService._live_request(config, invoice_data)
    
    @staticmethod
    def _mock_response(invoice_data: dict) -> dict:
        series = invoice_data.get("serie", "B001")
        number = invoice_data.get("numero", 1)
        
        mock_pdf = f"COMPROBANTE ELECTRONICO\nSerie: {series}\nNumero: {number}\nCliente: {invoice_data.get('cliente_denominacion')}\nTotal: S/ {invoice_data.get('total', 0):.2f}".encode()
        mock_xml = f'<?xml version="1.0"?><Invoice><Series>{series}</Series><Number>{number}</Number></Invoice>'.encode()
        mock_cdr = f'<?xml version="1.0"?><CDR><Status>Aceptado</Status></CDR>'.encode()
        
        return {
            "success": True,
            "aceptada_por_sunat": True,
            "serie": series,
            "numero": number,
            "enlace_del_pdf": f"https://mock.nubefact.com/pdf/{series}-{number}.pdf",
            "enlace_del_xml": f"https://mock.nubefact.com/xml/{series}-{number}.xml",
            "enlace_del_cdr": f"https://mock.nubefact.com/cdr/{series}-{number}.xml",
            "pdf_base64": base64.b64encode(mock_pdf).decode(),
            "xml_base64": base64.b64encode(mock_xml).decode(),
            "cdr_base64": base64.b64encode(mock_cdr).decode(),
            "hash": f"MOCK-HASH-{series}-{number}",
            "qr": f"https://mock.nubefact.com/qr/{series}-{number}",
            "sunat_description": "La operación se realizó satisfactoriamente (MOCK)",
            "sunat_responsecode": "0"
        }
    
    @staticmethod
    async def _live_request(config: dict, invoice_data: dict) -> dict:
        import requests
        ruta = config.get("nubefact_ruta")
        token = config.get("nubefact_token")
        
        if not ruta or not token:
            return {"success": False, "error": "Configuración NubeFact incompleta"}
        
        headers = {
            "Authorization": f'Token token="{token}"',
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.post(ruta, json=invoice_data, headers=headers, timeout=30)
            result = response.json()
            result["success"] = result.get("aceptada_por_sunat", False)
            return result
        except Exception as e:
            return {"success": False, "error": str(e)}

# ============== AUTH ENDPOINTS ==============
@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 1, "email": 1, "password_hash": 1, "full_name": 1, "role": 1, "tenant_id": 1, "is_active": 1})
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Usuario desactivado")
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    
    token = create_token(str(user["_id"]), user["email"], user["role"], user.get("tenant_id"))
    
    return TokenResponse(
        access_token=token,
        user={
            "id": str(user["_id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "tenant_id": user.get("tenant_id")
        }
    )

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    db_user = await db.users.find_one({"_id": ObjectId(user["user_id"])}, {"_id": 0, "password_hash": 0})
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    result = serialize_doc(db_user)
    result["id"] = user["user_id"]
    
    # Get tenant info if exists
    if user.get("tenant_id"):
        tenant = await db.tenants.find_one({"_id": ObjectId(user["tenant_id"])}, {"_id": 0, "name": 1, "nombre_comercial": 1})
        result["tenant"] = serialize_doc(tenant) if tenant else None
    
    return result

# ============== TENANT ENDPOINTS ==============
@api_router.post("/tenants")
async def create_tenant(data: TenantCreate, user: dict = Depends(require_roles(Role.SUPER_ADMIN))):
    # Check RUC unique
    existing = await db.tenants.find_one({"ruc": data.ruc})
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un hotel con este RUC")
    
    tenant = {
        "name": data.name,
        "ruc": data.ruc,
        "razon_social": data.razon_social or data.name,
        "nombre_comercial": data.nombre_comercial or data.name,
        "address": data.address,
        "phone": data.phone,
        "email": data.email,
        "is_active": True,
        "invoicing_config": TenantInvoicingConfig().model_dump(),
        "settings": {
            "checkin_time": "14:00",
            "checkout_time": "12:00",
            "timezone": "America/Lima",
            "currency": "PEN"
        },
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.tenants.insert_one(tenant)
    tenant_id = str(result.inserted_id)
    
    # Create admin user if provided
    admin_id = None
    if data.admin_email and data.admin_password:
        # Check email unique
        existing_user = await db.users.find_one({"email": data.admin_email})
        if existing_user:
            raise HTTPException(status_code=400, detail="El email del administrador ya está en uso")
        
        admin_user = {
            "email": data.admin_email,
            "password_hash": hash_password(data.admin_password),
            "full_name": data.admin_name or "Administrador",
            "role": Role.ADMIN.value,
            "tenant_id": tenant_id,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        admin_result = await db.users.insert_one(admin_user)
        admin_id = str(admin_result.inserted_id)
    
    await create_audit_log(None, user["user_id"], "tenant", "CREATE", None, {"tenant_id": tenant_id, "name": data.name})
    
    return {
        "id": tenant_id, 
        "admin_id": admin_id,
        "message": "Hotel creado exitosamente"
    }

@api_router.get("/tenants")
async def list_tenants(user: dict = Depends(require_roles(Role.SUPER_ADMIN))):
    tenants = await db.tenants.find({}).to_list(1000)
    return [serialize_doc(t) for t in tenants]

@api_router.get("/tenants/{tenant_id}")
async def get_tenant(tenant_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != Role.SUPER_ADMIN.value and user.get("tenant_id") != tenant_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    
    tenant = await db.tenants.find_one({"_id": ObjectId(tenant_id)})
    if not tenant:
        raise HTTPException(status_code=404, detail="Hotel no encontrado")
    return serialize_doc(tenant)

@api_router.put("/tenants/{tenant_id}/invoicing")
async def update_tenant_invoicing(tenant_id: str, config: TenantInvoicingConfig, user: dict = Depends(require_roles(Role.SUPER_ADMIN, Role.ADMIN))):
    if user["role"] != Role.SUPER_ADMIN.value and user.get("tenant_id") != tenant_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    
    await db.tenants.update_one(
        {"_id": ObjectId(tenant_id)},
        {"$set": {"invoicing_config": config.model_dump()}}
    )
    await create_audit_log(tenant_id, user["user_id"], "tenant", "UPDATE_INVOICING", None, config.model_dump())
    return {"message": "Configuración de facturación actualizada"}

# ============== USER ENDPOINTS ==============
@api_router.post("/users")
async def create_user(data: UserCreate, user: dict = Depends(require_roles(Role.SUPER_ADMIN, Role.ADMIN))):
    if user["role"] == Role.ADMIN.value:
        data.tenant_id = user["tenant_id"]
        if data.role == Role.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="No puede crear Super Admins")
    
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email ya registrado")
    
    new_user = {
        "email": data.email,
        "password_hash": hash_password(data.password),
        "full_name": data.full_name,
        "role": data.role.value,
        "tenant_id": data.tenant_id,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(new_user)
    return {"id": str(result.inserted_id), "message": "Usuario creado exitosamente"}

@api_router.get("/users")
async def list_users(user: dict = Depends(require_roles(Role.SUPER_ADMIN, Role.ADMIN))):
    tenant_filter = get_tenant_filter(user)
    users = await db.users.find(tenant_filter, {"password_hash": 0}).to_list(1000)
    return [serialize_doc(u) for u in users]

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, data: dict = Body(...), user: dict = Depends(require_roles(Role.SUPER_ADMIN, Role.ADMIN))):
    target_user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Check tenant access
    if user["role"] != Role.SUPER_ADMIN.value and target_user.get("tenant_id") != user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Sin permisos para modificar este usuario")
    
    # Only allow updating certain fields
    allowed_fields = {"is_active", "full_name", "role"}
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay campos válidos para actualizar")
    
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": update_data}
    )
    
    await create_audit_log(user.get("tenant_id"), user["user_id"], "user", "UPDATE", None, {"user_id": user_id, **update_data})
    return {"message": "Usuario actualizado"}

# ============== ROOM TYPE ENDPOINTS ==============
@api_router.post("/room-types")
async def create_room_type(data: RoomTypeCreate, user: dict = Depends(require_roles(Role.ADMIN))):
    room_type = {
        **data.model_dump(),
        "tenant_id": user["tenant_id"],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.room_types.insert_one(room_type)
    return {"id": str(result.inserted_id), "message": "Tipo de habitación creado"}

@api_router.get("/room-types")
async def list_room_types(user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    room_types = await db.room_types.find({**tenant_filter, "is_active": True}).to_list(100)
    return [serialize_doc(rt) for rt in room_types]

@api_router.put("/room-types/{room_type_id}")
async def update_room_type(room_type_id: str, data: RoomTypeCreate, user: dict = Depends(require_roles(Role.ADMIN))):
    result = await db.room_types.update_one(
        {"_id": ObjectId(room_type_id), "tenant_id": user["tenant_id"]},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tipo de habitación no encontrado")
    return {"message": "Tipo de habitación actualizado"}

# ============== RATE MANAGEMENT ENDPOINTS ==============
@api_router.post("/rates")
async def create_rate(data: RateCreate, user: dict = Depends(require_roles(Role.ADMIN))):
    rate = {
        **data.model_dump(),
        "date_from": data.date_from.isoformat(),
        "date_to": data.date_to.isoformat(),
        "tenant_id": user["tenant_id"],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.rates.insert_one(rate)
    return {"id": str(result.inserted_id), "message": "Tarifa creada"}

@api_router.get("/rates")
async def list_rates(room_type_id: str = None, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    query = {**tenant_filter, "is_active": True}
    if room_type_id:
        query["room_type_id"] = room_type_id
    rates = await db.rates.find(query).sort("date_from", 1).to_list(500)
    return [serialize_doc(r) for r in rates]

@api_router.delete("/rates/{rate_id}")
async def delete_rate(rate_id: str, user: dict = Depends(require_roles(Role.ADMIN))):
    result = await db.rates.update_one(
        {"_id": ObjectId(rate_id), "tenant_id": user["tenant_id"]},
        {"$set": {"is_active": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada")
    return {"message": "Tarifa eliminada"}

@api_router.get("/rates/calculate")
async def calculate_rate(room_type_id: str, checkin_date: date, checkout_date: date, user: dict = Depends(get_current_user)):
    """Calculate total price for a stay based on special rates or base price"""
    tenant_filter = get_tenant_filter(user)
    
    room_type = await db.room_types.find_one({"_id": ObjectId(room_type_id), **tenant_filter})
    if not room_type:
        raise HTTPException(status_code=404, detail="Tipo de habitación no encontrado")
    
    base_price = room_type.get("base_price", 0)
    total = 0
    nights_breakdown = []
    
    current = checkin_date
    while current < checkout_date:
        # Check for special rate on this date
        special_rate = await db.rates.find_one({
            "tenant_id": user["tenant_id"],
            "room_type_id": room_type_id,
            "is_active": True,
            "date_from": {"$lte": current.isoformat()},
            "date_to": {"$gte": current.isoformat()}
        })
        
        if special_rate:
            price = special_rate["price"]
            rate_name = special_rate.get("name", "Tarifa Especial")
        else:
            price = base_price
            rate_name = "Tarifa Base"
        
        total += price
        nights_breakdown.append({
            "date": current.isoformat(),
            "price": price,
            "rate_name": rate_name
        })
        current += timedelta(days=1)
    
    return {
        "room_type": room_type.get("name"),
        "checkin_date": checkin_date.isoformat(),
        "checkout_date": checkout_date.isoformat(),
        "nights": len(nights_breakdown),
        "total": total,
        "breakdown": nights_breakdown
    }

# ============== ROOM ENDPOINTS ==============
@api_router.post("/rooms")
async def create_room(data: RoomCreate, user: dict = Depends(require_roles(Role.ADMIN))):
    existing = await db.rooms.find_one({"tenant_id": user["tenant_id"], "number": data.number})
    if existing:
        raise HTTPException(status_code=400, detail="Número de habitación ya existe")
    
    room = {
        **data.model_dump(),
        "tenant_id": user["tenant_id"],
        "occupancy_status": OccupancyStatus.VACANT.value,
        "housekeeping_status": HousekeepingStatus.CLEAN.value,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.rooms.insert_one(room)
    return {"id": str(result.inserted_id), "message": "Habitación creada"}

@api_router.post("/rooms/bulk")
async def create_rooms_bulk(data: RoomBulkCreate, user: dict = Depends(require_roles(Role.ADMIN))):
    rooms = []
    for i in range(data.count):
        number = f"{data.prefix}{data.start_number + i}"
        rooms.append({
            "number": number,
            "floor": data.floor,
            "room_type_id": data.room_type_id,
            "tenant_id": user["tenant_id"],
            "occupancy_status": OccupancyStatus.VACANT.value,
            "housekeeping_status": HousekeepingStatus.CLEAN.value,
            "notes": None,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    result = await db.rooms.insert_many(rooms)
    return {"count": len(result.inserted_ids), "message": f"{len(result.inserted_ids)} habitaciones creadas"}

@api_router.get("/rooms")
async def list_rooms(
    floor: Optional[int] = None,
    occupancy_status: Optional[OccupancyStatus] = None,
    housekeeping_status: Optional[HousekeepingStatus] = None,
    user: dict = Depends(get_current_user)
):
    tenant_filter = get_tenant_filter(user)
    query = {**tenant_filter, "is_active": True}
    
    if floor is not None:
        query["floor"] = floor
    if occupancy_status:
        query["occupancy_status"] = occupancy_status.value
    if housekeeping_status:
        query["housekeeping_status"] = housekeeping_status.value
    
    rooms = await db.rooms.find(query).sort("number", 1).to_list(500)
    
    # Enrich with room type info
    room_type_ids = list(set(r.get("room_type_id") for r in rooms if r.get("room_type_id")))
    room_types = {}
    if room_type_ids:
        rt_docs = await db.room_types.find({"_id": {"$in": [ObjectId(rtid) for rtid in room_type_ids]}}).to_list(100)
        room_types = {str(rt["_id"]): rt for rt in rt_docs}
    
    result = []
    for r in rooms:
        room_data = serialize_doc(r)
        rt = room_types.get(r.get("room_type_id"))
        if rt:
            room_data["room_type"] = {"name": rt.get("name"), "capacity": rt.get("capacity"), "base_price": rt.get("base_price")}
        result.append(room_data)
    
    return result

@api_router.put("/rooms/{room_id}/status")
async def update_room_status(room_id: str, occupancy: Optional[OccupancyStatus] = None, housekeeping: Optional[HousekeepingStatus] = None, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    room = await db.rooms.find_one({"_id": ObjectId(room_id), **tenant_filter})
    if not room:
        raise HTTPException(status_code=404, detail="Habitación no encontrada")
    
    updates = {}
    if occupancy:
        updates["occupancy_status"] = occupancy.value
    if housekeeping:
        updates["housekeeping_status"] = housekeeping.value
    
    if updates:
        before = {"occupancy_status": room.get("occupancy_status"), "housekeeping_status": room.get("housekeeping_status")}
        await db.rooms.update_one({"_id": ObjectId(room_id)}, {"$set": updates})
        
        # Log housekeeping change
        await db.housekeeping_logs.insert_one({
            "tenant_id": user["tenant_id"],
            "room_id": room_id,
            "from_occupancy": before.get("occupancy_status"),
            "to_occupancy": updates.get("occupancy_status", before.get("occupancy_status")),
            "from_housekeeping": before.get("housekeeping_status"),
            "to_housekeeping": updates.get("housekeeping_status", before.get("housekeeping_status")),
            "by_user": user["user_id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        await create_audit_log(user["tenant_id"], user["user_id"], "room", "STATUS_CHANGE", before, updates)
    
    return {"message": "Estado de habitación actualizado"}

# ============== GUEST ENDPOINTS ==============
@api_router.post("/guests")
async def create_guest(data: GuestCreate, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    existing = await db.guests.find_one({**tenant_filter, "doc_type": data.doc_type.value, "doc_number": data.doc_number})
    if existing:
        return serialize_doc(existing)
    
    guest = {
        **data.model_dump(),
        "doc_type": data.doc_type.value,
        "tenant_id": user["tenant_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.guests.insert_one(guest)
    guest["id"] = str(result.inserted_id)
    return serialize_doc(guest)

@api_router.get("/guests")
async def list_guests(search: Optional[str] = None, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    query = tenant_filter.copy()
    
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"doc_number": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    
    guests = await db.guests.find(query).sort("full_name", 1).to_list(500)
    return [serialize_doc(g) for g in guests]

@api_router.get("/guests/{guest_id}")
async def get_guest(guest_id: str, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    guest = await db.guests.find_one({"_id": ObjectId(guest_id), **tenant_filter})
    if not guest:
        raise HTTPException(status_code=404, detail="Huésped no encontrado")
    return serialize_doc(guest)

# ============== RESERVATION ENDPOINTS ==============
@api_router.post("/reservations")
async def create_reservation(data: ReservationCreate, user: dict = Depends(get_current_user)):
    tenant_id = user["tenant_id"]
    
    # Generate reservation code
    count = await db.reservations.count_documents({"tenant_id": tenant_id})
    code = f"RES-{count + 1:06d}"
    
    reservation = {
        **data.model_dump(),
        "checkin_date": data.checkin_date.isoformat(),
        "checkout_date": data.checkout_date.isoformat(),
        "code": code,
        "tenant_id": tenant_id,
        "status": ReservationStatus.CONFIRMED.value,
        "deposit_status": "PENDING" if data.deposit_amount > 0 else "NA",
        "created_by": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Check for room conflicts if room is assigned
    if data.room_id:
        conflict = await db.reservations.find_one({
            "tenant_id": tenant_id,
            "room_id": data.room_id,
            "status": {"$in": [ReservationStatus.CONFIRMED.value, ReservationStatus.CHECKED_IN.value]},
            "$or": [
                {"checkin_date": {"$lt": data.checkout_date.isoformat()}, "checkout_date": {"$gt": data.checkin_date.isoformat()}}
            ]
        })
        if conflict:
            raise HTTPException(status_code=400, detail="Habitación no disponible para esas fechas")
    
    result = await db.reservations.insert_one(reservation)
    await create_audit_log(tenant_id, user["user_id"], "reservation", "CREATE", None, {"code": code})
    
    return {"id": str(result.inserted_id), "code": code, "message": "Reserva creada exitosamente"}

@api_router.get("/reservations")
async def list_reservations(
    status: Optional[ReservationStatus] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    tenant_filter = get_tenant_filter(user)
    query = tenant_filter.copy()
    
    if status:
        query["status"] = status.value
    if from_date:
        query["checkin_date"] = {"$gte": from_date.isoformat()}
    if to_date:
        query["checkout_date"] = {"$lte": to_date.isoformat()}
    if search:
        query["$or"] = [
            {"code": {"$regex": search, "$options": "i"}}
        ]
    
    reservations = await db.reservations.find(query).sort("checkin_date", -1).to_list(500)
    
    # Enrich with guest info
    guest_ids = [r.get("guest_id") for r in reservations if r.get("guest_id")]
    guests = {}
    if guest_ids:
        guest_docs = await db.guests.find({"_id": {"$in": [ObjectId(gid) for gid in guest_ids]}}).to_list(500)
        guests = {str(g["_id"]): g for g in guest_docs}
    
    result = []
    for r in reservations:
        res_data = serialize_doc(r)
        guest = guests.get(r.get("guest_id"))
        if guest:
            res_data["guest"] = {"full_name": guest.get("full_name"), "doc_type": guest.get("doc_type"), "doc_number": guest.get("doc_number")}
        result.append(res_data)
    
    return result

# ============== GROUP RESERVATIONS (must be before {reservation_id} routes) ==============
@api_router.post("/reservations/group")
async def create_group_reservation(
    data: GroupReservationCreate,
    user: dict = Depends(get_current_user)
):
    """Create a group reservation for multiple rooms"""
    tenant_id = user["tenant_id"]
    
    # Validate dates
    if data.checkin_date >= data.checkout_date:
        raise HTTPException(status_code=400, detail="Fecha de checkout debe ser posterior a checkin")
    
    nights = (data.checkout_date - data.checkin_date).days
    
    # Generate group code
    count = await db.group_reservations.count_documents({"tenant_id": tenant_id})
    group_code = f"GRP-{count + 1:06d}"
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Create group reservation header
    group = {
        "code": group_code,
        "tenant_id": tenant_id,
        "group_name": data.group_name,
        "contact_name": data.contact_name,
        "contact_phone": data.contact_phone,
        "contact_email": data.contact_email,
        "checkin_date": data.checkin_date.isoformat(),
        "checkout_date": data.checkout_date.isoformat(),
        "nights": nights,
        "total_rooms": sum(r.get("quantity", 1) for r in data.rooms),
        "adults": data.adults,
        "children": data.children,
        "deposit_amount": data.deposit_amount,
        "total_estimated": 0,
        "status": "CONFIRMED",
        "notes": data.notes,
        "reservations": [],
        "created_by": user["user_id"],
        "created_at": now
    }
    
    total_estimated = 0
    reservation_ids = []
    
    # Create individual reservations for each room request
    for room_req in data.rooms:
        room_type_id = room_req.get("room_type_id")
        quantity = room_req.get("quantity", 1)
        
        room_type = await db.room_types.find_one({"_id": ObjectId(room_type_id), "tenant_id": tenant_id})
        if not room_type:
            raise HTTPException(status_code=400, detail=f"Tipo de habitación no encontrado: {room_type_id}")
        
        base_price = room_type.get("base_price", 0)
        room_total = nights * base_price
        
        for i in range(quantity):
            res_count = await db.reservations.count_documents({"tenant_id": tenant_id})
            res_code = f"RES-{res_count + 1:06d}"
            
            reservation = {
                "code": res_code,
                "tenant_id": tenant_id,
                "group_code": group_code,
                "guest_id": None,
                "room_type_id": room_type_id,
                "room_id": None,
                "checkin_date": data.checkin_date.isoformat(),
                "checkout_date": data.checkout_date.isoformat(),
                "adults": max(1, data.adults // quantity),
                "children": 0,
                "total_estimated": room_total,
                "deposit_amount": 0,
                "source": "GRUPO",
                "status": ReservationStatus.CONFIRMED.value,
                "notes": f"Grupo: {data.group_name}",
                "created_by": user["user_id"],
                "created_at": now
            }
            res_result = await db.reservations.insert_one(reservation)
            reservation_ids.append(str(res_result.inserted_id))
            total_estimated += room_total
    
    group["reservations"] = reservation_ids
    group["total_estimated"] = total_estimated
    
    result = await db.group_reservations.insert_one(group)
    
    await create_audit_log(tenant_id, user["user_id"], "group_reservation", "CREATE", None, {"code": group_code, "rooms": len(reservation_ids)})
    
    return {
        "id": str(result.inserted_id),
        "code": group_code,
        "reservations_created": len(reservation_ids),
        "total_estimated": total_estimated,
        "message": "Reserva grupal creada exitosamente"
    }

@api_router.get("/reservations/groups")
async def list_group_reservations(
    status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """List all group reservations"""
    tenant_filter = get_tenant_filter(user)
    query = tenant_filter.copy()
    if status:
        query["status"] = status
    
    groups = await db.group_reservations.find(query).sort("created_at", -1).to_list(500)
    return [serialize_doc(g) for g in groups]

@api_router.get("/reservations/groups/{group_id}")
async def get_group_reservation(group_id: str, user: dict = Depends(get_current_user)):
    """Get group reservation with all individual reservations"""
    tenant_filter = get_tenant_filter(user)
    group = await db.group_reservations.find_one({"_id": ObjectId(group_id), **tenant_filter})
    if not group:
        raise HTTPException(status_code=404, detail="Reserva grupal no encontrada")
    
    # Get individual reservations
    reservations = await db.reservations.find({"group_code": group["code"]}).to_list(100)
    
    result = serialize_doc(group)
    result["reservation_details"] = [serialize_doc(r) for r in reservations]
    return result

@api_router.get("/reservations/{reservation_id}")
async def get_reservation(reservation_id: str, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    reservation = await db.reservations.find_one({"_id": ObjectId(reservation_id), **tenant_filter})
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    
    # Get guest
    guest = None
    if reservation.get("guest_id"):
        guest = await db.guests.find_one({"_id": ObjectId(reservation["guest_id"])})
    
    # Get room
    room = None
    if reservation.get("room_id"):
        room = await db.rooms.find_one({"_id": ObjectId(reservation["room_id"])})
    
    result = serialize_doc(reservation)
    result["guest"] = serialize_doc(guest) if guest else None
    result["room"] = serialize_doc(room) if room else None
    
    return result

@api_router.put("/reservations/{reservation_id}")
async def update_reservation(reservation_id: str, data: ReservationUpdate, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    reservation = await db.reservations.find_one({"_id": ObjectId(reservation_id), **tenant_filter})
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    
    before = serialize_doc(reservation.copy())
    updates = {}
    
    if data.checkin_date:
        updates["checkin_date"] = data.checkin_date.isoformat()
    if data.checkout_date:
        updates["checkout_date"] = data.checkout_date.isoformat()
    if data.room_id:
        updates["room_id"] = data.room_id
    if data.notes:
        updates["notes"] = data.notes
    if data.status:
        if data.status in [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW] and not data.cancel_reason:
            raise HTTPException(status_code=400, detail="Se requiere motivo para cancelar/no-show")
        updates["status"] = data.status.value
        if data.cancel_reason:
            updates["cancel_reason"] = data.cancel_reason
    
    if updates:
        await db.reservations.update_one({"_id": ObjectId(reservation_id)}, {"$set": updates})
        await create_audit_log(user["tenant_id"], user["user_id"], "reservation", "UPDATE", before, updates)
    
    return {"message": "Reserva actualizada"}

@api_router.post("/reservations/{reservation_id}/assign-room")
async def assign_room(reservation_id: str, room_id: str = Body(..., embed=True), user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    
    reservation = await db.reservations.find_one({"_id": ObjectId(reservation_id), **tenant_filter})
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    
    room = await db.rooms.find_one({"_id": ObjectId(room_id), **tenant_filter})
    if not room:
        raise HTTPException(status_code=404, detail="Habitación no encontrada")
    
    # Check room availability
    if room.get("housekeeping_status") == HousekeepingStatus.OUT_OF_ORDER.value:
        raise HTTPException(status_code=400, detail="Habitación fuera de servicio")
    
    if room.get("occupancy_status") != OccupancyStatus.VACANT.value:
        raise HTTPException(status_code=400, detail="Habitación ocupada")
    
    await db.reservations.update_one({"_id": ObjectId(reservation_id)}, {"$set": {"room_id": room_id}})
    return {"message": "Habitación asignada"}

# ============== CHECK-IN / CHECK-OUT ENDPOINTS ==============
@api_router.post("/reservations/{reservation_id}/checkin")
async def perform_checkin(reservation_id: str, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    reservation = await db.reservations.find_one({"_id": ObjectId(reservation_id), **tenant_filter})
    
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    if reservation.get("status") != ReservationStatus.CONFIRMED.value:
        raise HTTPException(status_code=400, detail="Reserva no está confirmada")
    if not reservation.get("room_id"):
        raise HTTPException(status_code=400, detail="No hay habitación asignada")
    
    room = await db.rooms.find_one({"_id": ObjectId(reservation["room_id"])})
    if not room:
        raise HTTPException(status_code=404, detail="Habitación no encontrada")
    
    if room.get("housekeeping_status") == HousekeepingStatus.OUT_OF_ORDER.value:
        raise HTTPException(status_code=400, detail="Habitación fuera de servicio")
    
    # Create stay
    stay = {
        "tenant_id": user["tenant_id"],
        "reservation_id": reservation_id,
        "room_id": reservation["room_id"],
        "guest_id": reservation.get("guest_id"),
        "checkin_at": datetime.now(timezone.utc).isoformat(),
        "checkout_at": None,
        "status": "ACTIVE",
        "created_by": user["user_id"]
    }
    stay_result = await db.stays.insert_one(stay)
    stay_id = str(stay_result.inserted_id)
    
    # Create folio
    folio = {
        "tenant_id": user["tenant_id"],
        "stay_id": stay_id,
        "reservation_id": reservation_id,
        "status": "OPEN",
        "total_charges": 0,
        "total_payments": 0,
        "balance": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    folio_result = await db.folios.insert_one(folio)
    folio_id = str(folio_result.inserted_id)
    
    # Update reservation
    await db.reservations.update_one(
        {"_id": ObjectId(reservation_id)},
        {"$set": {"status": ReservationStatus.CHECKED_IN.value, "stay_id": stay_id, "folio_id": folio_id}}
    )
    
    # Update room status
    await db.rooms.update_one(
        {"_id": ObjectId(reservation["room_id"])},
        {"$set": {"occupancy_status": OccupancyStatus.OCCUPIED.value}}
    )
    
    await create_audit_log(user["tenant_id"], user["user_id"], "reservation", "CHECKIN", None, {"reservation_id": reservation_id, "stay_id": stay_id})
    
    return {"stay_id": stay_id, "folio_id": folio_id, "message": "Check-in realizado exitosamente"}

@api_router.post("/reservations/{reservation_id}/checkout")
async def perform_checkout(reservation_id: str, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    reservation = await db.reservations.find_one({"_id": ObjectId(reservation_id), **tenant_filter})
    
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    if reservation.get("status") != ReservationStatus.CHECKED_IN.value:
        raise HTTPException(status_code=400, detail="Reserva no está en check-in")
    
    stay_id = reservation.get("stay_id")
    folio_id = reservation.get("folio_id")
    room_id = reservation.get("room_id")
    
    # Check folio balance
    folio = await db.folios.find_one({"_id": ObjectId(folio_id)})
    if folio and folio.get("balance", 0) > 0:
        raise HTTPException(status_code=400, detail=f"Folio tiene saldo pendiente: S/ {folio['balance']:.2f}")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update stay
    await db.stays.update_one({"_id": ObjectId(stay_id)}, {"$set": {"checkout_at": now, "status": "COMPLETED"}})
    
    # Update folio
    await db.folios.update_one({"_id": ObjectId(folio_id)}, {"$set": {"status": "CLOSED"}})
    
    # Update reservation
    await db.reservations.update_one({"_id": ObjectId(reservation_id)}, {"$set": {"status": ReservationStatus.CHECKED_OUT.value}})
    
    # Update room: VACANT + DIRTY
    await db.rooms.update_one(
        {"_id": ObjectId(room_id)},
        {"$set": {"occupancy_status": OccupancyStatus.VACANT.value, "housekeeping_status": HousekeepingStatus.DIRTY.value}}
    )
    
    # Create housekeeping task
    await db.housekeeping_tasks.insert_one({
        "tenant_id": user["tenant_id"],
        "room_id": room_id,
        "stay_id": stay_id,
        "priority": "HIGH",
        "status": "OPEN",
        "assigned_to": None,
        "created_at": now
    })
    
    await create_audit_log(user["tenant_id"], user["user_id"], "reservation", "CHECKOUT", None, {"reservation_id": reservation_id})
    
    return {"message": "Check-out realizado exitosamente"}

# ============== FOLIO ENDPOINTS ==============
@api_router.get("/folios/{folio_id}")
async def get_folio(folio_id: str, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    folio = await db.folios.find_one({"_id": ObjectId(folio_id), **tenant_filter})
    if not folio:
        raise HTTPException(status_code=404, detail="Folio no encontrado")
    
    # Get charges
    charges = await db.charges.find({"folio_id": folio_id, "status": "ACTIVE"}).to_list(500)
    
    # Get payments
    payments = await db.payments.find({"folio_id": folio_id, "status": "ACTIVE"}).to_list(500)
    
    # Get stay and guest info
    stay = await db.stays.find_one({"_id": ObjectId(folio.get("stay_id"))}) if folio.get("stay_id") else None
    guest = None
    if stay and stay.get("guest_id"):
        guest = await db.guests.find_one({"_id": ObjectId(stay["guest_id"])})
    
    result = serialize_doc(folio)
    result["charges"] = [serialize_doc(c) for c in charges]
    result["payments"] = [serialize_doc(p) for p in payments]
    result["guest"] = serialize_doc(guest) if guest else None
    
    return result

@api_router.post("/folios/{folio_id}/charges")
async def add_charge(folio_id: str, data: ChargeCreate, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    folio = await db.folios.find_one({"_id": ObjectId(folio_id), **tenant_filter})
    if not folio:
        raise HTTPException(status_code=404, detail="Folio no encontrado")
    if folio.get("status") != "OPEN":
        raise HTTPException(status_code=400, detail="Folio cerrado")
    
    # Get tenant for IGV rate
    tenant = await db.tenants.find_one({"_id": ObjectId(user["tenant_id"])})
    igv_rate = tenant.get("invoicing_config", {}).get("igv_rate", 18.0) / 100
    
    subtotal = data.quantity * data.unit_price
    igv_amount = subtotal * igv_rate if data.tax_type == "IGV" else 0
    total = subtotal + igv_amount
    
    charge = {
        "tenant_id": user["tenant_id"],
        "folio_id": folio_id,
        "concept": data.concept,
        "category": data.category,
        "quantity": data.quantity,
        "unit_price": data.unit_price,
        "subtotal": subtotal,
        "tax_type": data.tax_type,
        "igv_amount": igv_amount,
        "total": total,
        "created_by": user["user_id"],
        "status": "ACTIVE",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.charges.insert_one(charge)
    
    # Update folio totals
    await db.folios.update_one(
        {"_id": ObjectId(folio_id)},
        {"$inc": {"total_charges": total, "balance": total}}
    )
    
    return {"id": str(result.inserted_id), "message": "Cargo agregado"}

@api_router.post("/folios/{folio_id}/charges/{charge_id}/void")
async def void_charge(folio_id: str, charge_id: str, data: VoidRequest, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    charge = await db.charges.find_one({"_id": ObjectId(charge_id), "folio_id": folio_id, **tenant_filter})
    if not charge:
        raise HTTPException(status_code=404, detail="Cargo no encontrado")
    if charge.get("status") != "ACTIVE":
        raise HTTPException(status_code=400, detail="Cargo ya anulado")
    
    await db.charges.update_one(
        {"_id": ObjectId(charge_id)},
        {"$set": {"status": "VOIDED", "void_reason": data.reason, "voided_by": user["user_id"], "voided_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Update folio totals
    await db.folios.update_one(
        {"_id": ObjectId(folio_id)},
        {"$inc": {"total_charges": -charge["total"], "balance": -charge["total"]}}
    )
    
    await create_audit_log(user["tenant_id"], user["user_id"], "charge", "VOID", {"id": charge_id, "total": charge["total"]}, {"reason": data.reason})
    
    return {"message": "Cargo anulado"}

@api_router.post("/folios/{folio_id}/payments")
async def add_payment(folio_id: str, data: PaymentCreate, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    folio = await db.folios.find_one({"_id": ObjectId(folio_id), **tenant_filter})
    if not folio:
        raise HTTPException(status_code=404, detail="Folio no encontrado")
    
    # Check for active cash shift
    cash_shift = await db.cash_shifts.find_one({"tenant_id": user["tenant_id"], "status": "OPEN"})
    if not cash_shift:
        raise HTTPException(status_code=400, detail="No hay caja abierta")
    
    payment = {
        "tenant_id": user["tenant_id"],
        "folio_id": folio_id,
        "cash_shift_id": str(cash_shift["_id"]),
        "method": data.method.value,
        "amount": data.amount,
        "reference": data.reference,
        "created_by": user["user_id"],
        "status": "ACTIVE",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.payments.insert_one(payment)
    
    # Update folio totals
    await db.folios.update_one(
        {"_id": ObjectId(folio_id)},
        {"$inc": {"total_payments": data.amount, "balance": -data.amount}}
    )
    
    return {"id": str(result.inserted_id), "message": "Pago registrado"}

# ============== CASH SHIFT ENDPOINTS ==============
@api_router.post("/cash-shifts/open")
async def open_cash_shift(data: CashShiftOpen, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    
    # Check if there's already an open shift
    existing = await db.cash_shifts.find_one({**tenant_filter, "status": "OPEN"})
    if existing:
        raise HTTPException(status_code=400, detail="Ya hay una caja abierta")
    
    shift = {
        "tenant_id": user["tenant_id"],
        "opened_by": user["user_id"],
        "opened_at": datetime.now(timezone.utc).isoformat(),
        "opening_amount": data.opening_amount,
        "status": "OPEN",
        "totals": {},
        "counted_cash": None,
        "difference": None,
        "closed_at": None,
        "closed_by": None,
        "notes": None
    }
    
    result = await db.cash_shifts.insert_one(shift)
    await create_audit_log(user["tenant_id"], user["user_id"], "cash_shift", "OPEN", None, {"opening_amount": data.opening_amount})
    
    return {"id": str(result.inserted_id), "message": "Caja abierta"}

@api_router.get("/cash-shifts/current")
async def get_current_cash_shift(user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    shift = await db.cash_shifts.find_one({**tenant_filter, "status": "OPEN"})
    if not shift:
        return None
    
    shift_id = str(shift["_id"])
    
    # Calculate totals
    pipeline = [
        {"$match": {"cash_shift_id": shift_id, "status": "ACTIVE"}},
        {"$group": {"_id": "$method", "total": {"$sum": "$amount"}}}
    ]
    totals_cursor = db.payments.aggregate(pipeline)
    totals = {}
    async for doc in totals_cursor:
        totals[doc["_id"]] = doc["total"]
    
    result = serialize_doc(shift)
    result["totals"] = totals
    result["total_payments"] = sum(totals.values())
    
    return result

@api_router.post("/cash-shifts/{shift_id}/close")
async def close_cash_shift(shift_id: str, data: CashShiftClose, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    shift = await db.cash_shifts.find_one({"_id": ObjectId(shift_id), **tenant_filter})
    
    if not shift:
        raise HTTPException(status_code=404, detail="Caja no encontrada")
    if shift.get("status") != "OPEN":
        raise HTTPException(status_code=400, detail="Caja no está abierta")
    
    # Calculate totals
    pipeline = [
        {"$match": {"cash_shift_id": shift_id, "status": "ACTIVE"}},
        {"$group": {"_id": "$method", "total": {"$sum": "$amount"}}}
    ]
    totals = {}
    async for doc in db.payments.aggregate(pipeline):
        totals[doc["_id"]] = doc["total"]
    
    cash_total = totals.get(PaymentMethod.CASH.value, 0)
    expected_cash = shift["opening_amount"] + cash_total
    difference = data.counted_cash - expected_cash
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.cash_shifts.update_one(
        {"_id": ObjectId(shift_id)},
        {"$set": {
            "status": "CLOSED",
            "totals": totals,
            "counted_cash": data.counted_cash,
            "difference": difference,
            "closed_at": now,
            "closed_by": user["user_id"],
            "notes": data.notes
        }}
    )
    
    # Create alert if significant difference
    if abs(difference) > 10:
        await create_alert(
            user["tenant_id"],
            "CASH_DIFFERENCE",
            AlertSeverity.WARN if abs(difference) < 50 else AlertSeverity.CRITICAL,
            "Diferencia en Caja",
            f"Diferencia de S/ {difference:.2f} al cerrar caja",
            {"cash_shift_id": shift_id}
        )
    
    await create_audit_log(user["tenant_id"], user["user_id"], "cash_shift", "CLOSE", None, {"difference": difference})
    
    return {"message": "Caja cerrada", "difference": difference}

@api_router.get("/cash-shifts")
async def list_cash_shifts(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    user: dict = Depends(get_current_user)
):
    tenant_filter = get_tenant_filter(user)
    query = tenant_filter.copy()
    
    if from_date:
        query["opened_at"] = {"$gte": from_date.isoformat()}
    if to_date:
        if "opened_at" in query:
            query["opened_at"]["$lte"] = to_date.isoformat() + "T23:59:59"
        else:
            query["opened_at"] = {"$lte": to_date.isoformat() + "T23:59:59"}
    
    shifts = await db.cash_shifts.find(query).sort("opened_at", -1).to_list(500)
    return [serialize_doc(s) for s in shifts]

@api_router.post("/cash-shifts/{shift_id}/movements")
async def add_cash_movement(shift_id: str, data: CashMovementCreate, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    shift = await db.cash_shifts.find_one({"_id": ObjectId(shift_id), **tenant_filter, "status": "OPEN"})
    
    if not shift:
        raise HTTPException(status_code=404, detail="Caja abierta no encontrada")
    
    movement = {
        "tenant_id": user["tenant_id"],
        "cash_shift_id": shift_id,
        "type": data.type,
        "amount": data.amount,
        "reason": data.reason,
        "created_by": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.cash_movements.insert_one(movement)
    return {"id": str(result.inserted_id), "message": "Movimiento registrado"}

# ============== INVOICE ENDPOINTS ==============
@api_router.post("/invoices")
async def create_invoice(data: InvoiceCreate, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    tenant = await db.tenants.find_one({"_id": ObjectId(user["tenant_id"])})
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    
    folio = await db.folios.find_one({"_id": ObjectId(data.folio_id), **tenant_filter})
    if not folio:
        raise HTTPException(status_code=404, detail="Folio no encontrado")
    
    # Validate document requirements
    if data.type == InvoiceType.FACTURA:
        if data.client_doc_type != DocType.RUC:
            raise HTTPException(status_code=400, detail="Factura requiere RUC")
        if not data.client_address:
            raise HTTPException(status_code=400, detail="Factura requiere dirección")
    
    config = tenant.get("invoicing_config", {})
    
    # Get series and correlative
    if data.type == InvoiceType.BOLETA:
        series = config.get("boleta_series", "B001")
        correlative_field = "invoicing_config.boleta_correlative"
    else:
        series = config.get("factura_series", "F001")
        correlative_field = "invoicing_config.factura_correlative"
    
    # Atomic increment of correlative
    updated_tenant = await db.tenants.find_one_and_update(
        {"_id": ObjectId(user["tenant_id"])},
        {"$inc": {correlative_field: 1}},
        return_document=True
    )
    
    correlative = updated_tenant["invoicing_config"].get(
        "boleta_correlative" if data.type == InvoiceType.BOLETA else "factura_correlative",
        1
    )
    
    # Get charges for invoice
    charges = await db.charges.find({"folio_id": data.folio_id, "status": "ACTIVE"}).to_list(500)
    
    subtotal = sum(c.get("subtotal", 0) for c in charges)
    igv = sum(c.get("igv_amount", 0) for c in charges)
    total = sum(c.get("total", 0) for c in charges)
    
    # Build NubeFact payload
    items = []
    for c in charges:
        items.append({
            "unidad_de_medida": "NIU",
            "codigo": "001",
            "descripcion": c.get("concept", ""),
            "cantidad": c.get("quantity", 1),
            "valor_unitario": c.get("unit_price", 0),
            "precio_unitario": c.get("unit_price", 0) * 1.18,
            "descuento": 0,
            "subtotal": c.get("subtotal", 0),
            "tipo_de_igv": 1,
            "igv": c.get("igv_amount", 0),
            "total": c.get("total", 0)
        })
    
    nubefact_payload = {
        "operacion": "generar_comprobante",
        "tipo_de_comprobante": 2 if data.type == InvoiceType.BOLETA else 1,
        "serie": series,
        "numero": correlative,
        "sunat_transaction": 1,
        "cliente_tipo_de_documento": {"DNI": 1, "CE": 4, "PASAPORTE": 7, "RUC": 6}.get(data.client_doc_type.value, 1),
        "cliente_numero_de_documento": data.client_doc_number,
        "cliente_denominacion": data.client_name,
        "cliente_direccion": data.client_address or "",
        "cliente_email": "",
        "fecha_de_emision": datetime.now(timezone.utc).strftime("%d-%m-%Y"),
        "moneda": 1,
        "porcentaje_de_igv": config.get("igv_rate", 18.0),
        "total_gravada": subtotal,
        "total_igv": igv,
        "total": total,
        "items": items,
        "enviar_automaticamente_a_la_sunat": True,
        "enviar_automaticamente_al_cliente": False
    }
    
    # Send to NubeFact
    nubefact_response = await NubeFactService.send_invoice(tenant, nubefact_payload)
    
    invoice = {
        "tenant_id": user["tenant_id"],
        "folio_id": data.folio_id,
        "type": data.type.value,
        "series": series,
        "number": correlative,
        "client_doc_type": data.client_doc_type.value,
        "client_doc_number": data.client_doc_number,
        "client_name": data.client_name,
        "client_address": data.client_address,
        "subtotal": subtotal,
        "igv": igv,
        "total": total,
        "status": InvoiceStatus.ACCEPTED.value if nubefact_response.get("success") else InvoiceStatus.REJECTED.value,
        "nubefact_request": nubefact_payload,
        "nubefact_response": nubefact_response,
        "pdf_url": nubefact_response.get("enlace_del_pdf"),
        "xml_url": nubefact_response.get("enlace_del_xml"),
        "cdr_url": nubefact_response.get("enlace_del_cdr"),
        "hash": nubefact_response.get("hash"),
        "qr": nubefact_response.get("qr"),
        "issued_by": user["user_id"],
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "voided_at": None,
        "void_reason": None
    }
    
    result = await db.invoices.insert_one(invoice)
    
    await create_audit_log(user["tenant_id"], user["user_id"], "invoice", "CREATE", None, {"series": series, "number": correlative, "type": data.type.value})
    
    if not nubefact_response.get("success"):
        await create_alert(
            user["tenant_id"],
            "INVOICE_REJECTED",
            AlertSeverity.CRITICAL,
            "Comprobante Rechazado",
            f"{data.type.value} {series}-{correlative} fue rechazada: {nubefact_response.get('error', 'Error desconocido')}",
            {"invoice_id": str(result.inserted_id)}
        )
    
    return {
        "id": str(result.inserted_id),
        "series": series,
        "number": correlative,
        "status": invoice["status"],
        "message": "Comprobante emitido" if nubefact_response.get("success") else "Error al emitir comprobante"
    }

@api_router.get("/invoices")
async def list_invoices(
    type: Optional[InvoiceType] = None,
    status: Optional[InvoiceStatus] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    tenant_filter = get_tenant_filter(user)
    query = tenant_filter.copy()
    
    if type:
        query["type"] = type.value
    if status:
        query["status"] = status.value
    if from_date:
        query["issued_at"] = {"$gte": from_date.isoformat()}
    if to_date:
        if "issued_at" in query:
            query["issued_at"]["$lte"] = to_date.isoformat() + "T23:59:59"
        else:
            query["issued_at"] = {"$lte": to_date.isoformat() + "T23:59:59"}
    if search:
        query["$or"] = [
            {"client_name": {"$regex": search, "$options": "i"}},
            {"client_doc_number": {"$regex": search, "$options": "i"}}
        ]
    
    invoices = await db.invoices.find(query).sort("issued_at", -1).to_list(500)
    return [serialize_doc(inv) for inv in invoices]

@api_router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    invoice = await db.invoices.find_one({"_id": ObjectId(invoice_id), **tenant_filter})
    if not invoice:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")
    return serialize_doc(invoice)

@api_router.post("/invoices/{invoice_id}/void")
async def void_invoice(invoice_id: str, data: VoidRequest, user: dict = Depends(require_roles(Role.ADMIN))):
    tenant_filter = get_tenant_filter(user)
    invoice = await db.invoices.find_one({"_id": ObjectId(invoice_id), **tenant_filter})
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")
    if invoice.get("status") == InvoiceStatus.VOIDED.value:
        raise HTTPException(status_code=400, detail="Comprobante ya anulado")
    
    await db.invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        {"$set": {"status": InvoiceStatus.VOIDED.value, "void_reason": data.reason, "voided_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    await create_audit_log(user["tenant_id"], user["user_id"], "invoice", "VOID", {"id": invoice_id}, {"reason": data.reason})
    
    return {"message": "Comprobante anulado"}

# ============== HOUSEKEEPING ENDPOINTS ==============
@api_router.get("/housekeeping/tasks")
async def list_housekeeping_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    tenant_filter = get_tenant_filter(user)
    query = tenant_filter.copy()
    
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    
    tasks = await db.housekeeping_tasks.find(query).sort("created_at", -1).to_list(500)
    
    # Enrich with room info
    room_ids = [t.get("room_id") for t in tasks if t.get("room_id")]
    rooms = {}
    if room_ids:
        room_docs = await db.rooms.find({"_id": {"$in": [ObjectId(rid) for rid in room_ids]}}).to_list(500)
        rooms = {str(r["_id"]): r for r in room_docs}
    
    result = []
    for t in tasks:
        task_data = serialize_doc(t)
        room = rooms.get(t.get("room_id"))
        if room:
            task_data["room"] = {"number": room.get("number"), "floor": room.get("floor")}
        result.append(task_data)
    
    return result

@api_router.post("/housekeeping/tasks/{task_id}/complete")
async def complete_housekeeping_task(task_id: str, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    task = await db.housekeeping_tasks.find_one({"_id": ObjectId(task_id), **tenant_filter})
    
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.housekeeping_tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$set": {"status": "DONE", "completed_by": user["user_id"], "completed_at": now}}
    )
    
    # Update room status to CLEAN
    if task.get("room_id"):
        await db.rooms.update_one(
            {"_id": ObjectId(task["room_id"])},
            {"$set": {"housekeeping_status": HousekeepingStatus.CLEAN.value}}
        )
        
        # Log change
        await db.housekeeping_logs.insert_one({
            "tenant_id": user["tenant_id"],
            "room_id": task["room_id"],
            "from_housekeeping": HousekeepingStatus.DIRTY.value,
            "to_housekeeping": HousekeepingStatus.CLEAN.value,
            "by_user": user["user_id"],
            "created_at": now
        })
    
    return {"message": "Tarea completada"}

@api_router.get("/housekeeping/board")
async def get_housekeeping_board(user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    
    rooms = await db.rooms.find({**tenant_filter, "is_active": True}).sort([("floor", 1), ("number", 1)]).to_list(500)
    
    # Group by floor
    floors = {}
    for room in rooms:
        floor = room.get("floor", 0)
        if floor not in floors:
            floors[floor] = []
        floors[floor].append(serialize_doc(room))
    
    return {"floors": floors}

# ============== MAINTENANCE ENDPOINTS ==============
@api_router.post("/maintenance/tickets")
async def create_maintenance_ticket(data: MaintenanceTicketCreate, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    
    ticket = {
        **data.model_dump(),
        "tenant_id": user["tenant_id"],
        "status": "OPEN",
        "assigned_to": None,
        "actual_cost": None,
        "created_by": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "resolved_at": None
    }
    
    result = await db.maintenance_tickets.insert_one(ticket)
    
    # If critical, set room to OUT_OF_ORDER
    if data.priority == "CRITICAL":
        await db.rooms.update_one(
            {"_id": ObjectId(data.room_id), **tenant_filter},
            {"$set": {"housekeeping_status": HousekeepingStatus.OUT_OF_ORDER.value}}
        )
        
        await create_alert(
            user["tenant_id"],
            "ROOM_OUT_OF_ORDER",
            AlertSeverity.CRITICAL,
            "Habitación Fuera de Servicio",
            f"Habitación marcada como fuera de servicio por ticket de mantenimiento crítico",
            {"ticket_id": str(result.inserted_id), "room_id": data.room_id}
        )
    
    return {"id": str(result.inserted_id), "message": "Ticket creado"}

@api_router.get("/maintenance/tickets")
async def list_maintenance_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    tenant_filter = get_tenant_filter(user)
    query = tenant_filter.copy()
    
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    
    tickets = await db.maintenance_tickets.find(query).sort("created_at", -1).to_list(500)
    
    # Enrich with room info
    room_ids = [t.get("room_id") for t in tickets if t.get("room_id")]
    rooms = {}
    if room_ids:
        room_docs = await db.rooms.find({"_id": {"$in": [ObjectId(rid) for rid in room_ids]}}).to_list(500)
        rooms = {str(r["_id"]): r for r in room_docs}
    
    result = []
    for t in tickets:
        ticket_data = serialize_doc(t)
        room = rooms.get(t.get("room_id"))
        if room:
            ticket_data["room"] = {"number": room.get("number"), "floor": room.get("floor")}
        result.append(ticket_data)
    
    return result

@api_router.put("/maintenance/tickets/{ticket_id}")
async def update_maintenance_ticket(
    ticket_id: str,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    actual_cost: Optional[float] = None,
    user: dict = Depends(get_current_user)
):
    tenant_filter = get_tenant_filter(user)
    ticket = await db.maintenance_tickets.find_one({"_id": ObjectId(ticket_id), **tenant_filter})
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    
    updates = {}
    if status:
        updates["status"] = status
        if status == "RESOLVED":
            updates["resolved_at"] = datetime.now(timezone.utc).isoformat()
            
            # If was critical, restore room status
            if ticket.get("priority") == "CRITICAL" and ticket.get("room_id"):
                await db.rooms.update_one(
                    {"_id": ObjectId(ticket["room_id"])},
                    {"$set": {"housekeeping_status": HousekeepingStatus.DIRTY.value}}
                )
    
    if assigned_to:
        updates["assigned_to"] = assigned_to
    if actual_cost is not None:
        updates["actual_cost"] = actual_cost
    
    if updates:
        await db.maintenance_tickets.update_one({"_id": ObjectId(ticket_id)}, {"$set": updates})
    
    return {"message": "Ticket actualizado"}

# ============== ALERT ENDPOINTS ==============
@api_router.get("/alerts")
async def list_alerts(
    status: Optional[str] = None,
    severity: Optional[AlertSeverity] = None,
    user: dict = Depends(get_current_user)
):
    tenant_filter = get_tenant_filter(user)
    query = tenant_filter.copy()
    
    if status:
        query["status"] = status
    if severity:
        query["severity"] = severity.value
    
    # Filter by role
    if user["role"] == Role.HOUSEKEEPING.value:
        query["type"] = {"$in": ["DIRTY_ROOM", "ROOM_OUT_OF_ORDER"]}
    
    alerts = await db.alerts.find(query).sort("created_at", -1).to_list(500)
    return [serialize_doc(a) for a in alerts]

@api_router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, data: AlertResolve, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    
    await db.alerts.update_one(
        {"_id": ObjectId(alert_id), **tenant_filter},
        {"$set": {
            "status": "RESOLVED",
            "resolved_by": user["user_id"],
            "resolved_at": datetime.now(timezone.utc).isoformat(),
            "notes": data.notes
        }}
    )
    
    return {"message": "Alerta resuelta"}

# ============== PRODUCTS/SERVICES ENDPOINTS ==============
@api_router.post("/products")
async def create_product(name: str = Body(...), category: str = Body(...), unit_price: float = Body(...), tax_type: str = Body("IGV"), user: dict = Depends(require_roles(Role.ADMIN))):
    product = {
        "tenant_id": user["tenant_id"],
        "name": name,
        "category": category,
        "unit_price": unit_price,
        "tax_type": tax_type,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.products.insert_one(product)
    return {"id": str(result.inserted_id), "message": "Producto creado"}

@api_router.get("/products")
async def list_products(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    query = {**tenant_filter, "is_active": True}
    if category:
        query["category"] = category
    products = await db.products.find(query).sort("name", 1).to_list(500)
    return [serialize_doc(p) for p in products]

# ============== DASHBOARD ENDPOINTS ==============
@api_router.get("/dashboard/kpis")
async def get_dashboard_kpis(user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    today = datetime.now(timezone.utc).date()
    today_str = today.isoformat()
    month_start = today.replace(day=1).isoformat()
    
    # Today's stats
    rooms_total = await db.rooms.count_documents({**tenant_filter, "is_active": True})
    rooms_occupied = await db.rooms.count_documents({**tenant_filter, "occupancy_status": OccupancyStatus.OCCUPIED.value})
    rooms_dirty = await db.rooms.count_documents({**tenant_filter, "housekeeping_status": HousekeepingStatus.DIRTY.value})
    rooms_ooo = await db.rooms.count_documents({**tenant_filter, "housekeeping_status": HousekeepingStatus.OUT_OF_ORDER.value})
    
    # Arrivals/Departures today
    arrivals_today = await db.reservations.count_documents({
        **tenant_filter,
        "checkin_date": today_str,
        "status": {"$in": [ReservationStatus.CONFIRMED.value]}
    })
    departures_today = await db.reservations.count_documents({
        **tenant_filter,
        "checkout_date": today_str,
        "status": ReservationStatus.CHECKED_IN.value
    })
    
    # Revenue today
    pipeline_today = [
        {"$match": {"tenant_id": user["tenant_id"], "created_at": {"$gte": today_str}, "status": "ACTIVE"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    revenue_today = 0
    async for doc in db.payments.aggregate(pipeline_today):
        revenue_today = doc.get("total", 0)
    
    # Outstanding balance
    pipeline_balance = [
        {"$match": {"tenant_id": user["tenant_id"], "status": "OPEN", "balance": {"$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$balance"}}}
    ]
    outstanding = 0
    async for doc in db.folios.aggregate(pipeline_balance):
        outstanding = doc.get("total", 0)
    
    # Monthly stats
    pipeline_month = [
        {"$match": {"tenant_id": user["tenant_id"], "created_at": {"$gte": month_start}, "status": "ACTIVE"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    revenue_month = 0
    async for doc in db.payments.aggregate(pipeline_month):
        revenue_month = doc.get("total", 0)
    
    # Cancellations and no-shows this month
    cancellations = await db.reservations.count_documents({
        **tenant_filter,
        "created_at": {"$gte": month_start},
        "status": ReservationStatus.CANCELLED.value
    })
    no_shows = await db.reservations.count_documents({
        **tenant_filter,
        "created_at": {"$gte": month_start},
        "status": ReservationStatus.NO_SHOW.value
    })
    
    # ADR calculation
    pipeline_adr = [
        {"$match": {"tenant_id": user["tenant_id"], "created_at": {"$gte": month_start}, "category": "HABITACION", "status": "ACTIVE"}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": "$quantity"}}}
    ]
    adr = 0
    room_nights_sold = 0
    async for doc in db.charges.aggregate(pipeline_adr):
        if doc.get("count", 0) > 0:
            adr = doc.get("total", 0) / doc.get("count", 1)
            room_nights_sold = doc.get("count", 0)
    
    occupancy_rate = (rooms_occupied / rooms_total * 100) if rooms_total > 0 else 0
    revpar = (revenue_month / (rooms_total * today.day)) if rooms_total > 0 else 0
    
    return {
        "today": {
            "occupancy_rate": round(occupancy_rate, 1),
            "rooms_occupied": rooms_occupied,
            "rooms_total": rooms_total,
            "rooms_dirty": rooms_dirty,
            "rooms_ooo": rooms_ooo,
            "arrivals": arrivals_today,
            "departures": departures_today,
            "revenue": round(revenue_today, 2),
            "outstanding": round(outstanding, 2)
        },
        "month": {
            "revenue": round(revenue_month, 2),
            "adr": round(adr, 2),
            "revpar": round(revpar, 2),
            "cancellations": cancellations,
            "no_shows": no_shows,
            "room_nights_sold": room_nights_sold
        }
    }

@api_router.get("/dashboard/charts/revenue")
async def get_revenue_chart(days: int = 30, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
    pipeline = [
        {"$match": {"tenant_id": user["tenant_id"], "created_at": {"$gte": start_date}, "status": "ACTIVE"}},
        {"$addFields": {"date": {"$substr": ["$created_at", 0, 10]}}},
        {"$group": {"_id": "$date", "total": {"$sum": "$total"}, "rooms": {"$sum": {"$cond": [{"$eq": ["$category", "HABITACION"]}, "$total", 0]}}, "extras": {"$sum": {"$cond": [{"$ne": ["$category", "HABITACION"]}, "$total", 0]}}}}
    ]
    
    data = []
    async for doc in db.charges.aggregate(pipeline):
        data.append({
            "date": doc["_id"],
            "total": doc.get("total", 0),
            "rooms": doc.get("rooms", 0),
            "extras": doc.get("extras", 0)
        })
    
    return sorted(data, key=lambda x: x["date"])

@api_router.get("/dashboard/charts/occupancy")
async def get_occupancy_chart(days: int = 30, user: dict = Depends(get_current_user)):
    # This would need actual historical data - simplified version
    tenant_filter = get_tenant_filter(user)
    rooms_total = await db.rooms.count_documents({**tenant_filter, "is_active": True})
    
    data = []
    for i in range(days):
        day = datetime.now(timezone.utc).date() - timedelta(days=days - i - 1)
        # In production, this would query actual historical occupancy
        occupied = await db.reservations.count_documents({
            **tenant_filter,
            "checkin_date": {"$lte": day.isoformat()},
            "checkout_date": {"$gt": day.isoformat()},
            "status": {"$in": [ReservationStatus.CHECKED_IN.value, ReservationStatus.CHECKED_OUT.value]}
        })
        rate = (occupied / rooms_total * 100) if rooms_total > 0 else 0
        data.append({"date": day.isoformat(), "rate": round(rate, 1), "occupied": occupied})
    
    return data

@api_router.get("/dashboard/charts/payment-methods")
async def get_payment_methods_chart(user: dict = Depends(get_current_user)):
    month_start = datetime.now(timezone.utc).date().replace(day=1).isoformat()
    
    pipeline = [
        {"$match": {"tenant_id": user["tenant_id"], "created_at": {"$gte": month_start}, "status": "ACTIVE"}},
        {"$group": {"_id": "$method", "total": {"$sum": "$amount"}}}
    ]
    
    data = []
    async for doc in db.payments.aggregate(pipeline):
        data.append({"method": doc["_id"], "total": doc.get("total", 0)})
    
    return data

@api_router.get("/dashboard/charts/room-status")
async def get_room_status_chart(user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    
    pipeline = [
        {"$match": {**tenant_filter, "is_active": True}},
        {"$group": {
            "_id": {"occupancy": "$occupancy_status", "housekeeping": "$housekeeping_status"},
            "count": {"$sum": 1}
        }}
    ]
    
    data = {"occupied": 0, "vacant_clean": 0, "vacant_dirty": 0, "out_of_order": 0}
    async for doc in db.rooms.aggregate(pipeline):
        occ = doc["_id"].get("occupancy")
        hk = doc["_id"].get("housekeeping")
        count = doc.get("count", 0)
        
        if hk == HousekeepingStatus.OUT_OF_ORDER.value:
            data["out_of_order"] += count
        elif occ == OccupancyStatus.OCCUPIED.value:
            data["occupied"] += count
        elif hk == HousekeepingStatus.CLEAN.value:
            data["vacant_clean"] += count
        else:
            data["vacant_dirty"] += count
    
    return data

@api_router.get("/dashboard/charts/invoicing-status")
async def get_invoicing_status_chart(user: dict = Depends(get_current_user)):
    month_start = datetime.now(timezone.utc).date().replace(day=1).isoformat()
    
    pipeline = [
        {"$match": {"tenant_id": user["tenant_id"], "issued_at": {"$gte": month_start}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}, "total": {"$sum": "$total"}}}
    ]
    
    data = []
    async for doc in db.invoices.aggregate(pipeline):
        data.append({"status": doc["_id"], "count": doc.get("count", 0), "total": doc.get("total", 0)})
    
    return data

@api_router.get("/dashboard/charts/top-products")
async def get_top_products_chart(user: dict = Depends(get_current_user)):
    month_start = datetime.now(timezone.utc).date().replace(day=1).isoformat()
    
    pipeline = [
        {"$match": {"tenant_id": user["tenant_id"], "created_at": {"$gte": month_start}, "status": "ACTIVE", "category": {"$ne": "HABITACION"}}},
        {"$group": {"_id": "$concept", "total": {"$sum": "$total"}, "quantity": {"$sum": "$quantity"}}},
        {"$sort": {"total": -1}},
        {"$limit": 10}
    ]
    
    data = []
    async for doc in db.charges.aggregate(pipeline):
        data.append({"product": doc["_id"], "total": doc.get("total", 0), "quantity": doc.get("quantity", 0)})
    
    return data

# ============== REPORTS ENDPOINTS ==============
@api_router.get("/reports/monthly-occupancy")
async def get_monthly_occupancy_report(month: int = None, year: int = None, user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    today = datetime.now(timezone.utc).date()
    
    if not month:
        month = today.month
    if not year:
        year = today.year
    
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)
    
    rooms_total = await db.rooms.count_documents({**tenant_filter, "is_active": True})
    days_in_month = (end_date - start_date).days
    room_nights_available = rooms_total * days_in_month
    
    # Get reservations for the month
    reservations = await db.reservations.find({
        **tenant_filter,
        "checkin_date": {"$lt": end_date.isoformat()},
        "checkout_date": {"$gt": start_date.isoformat()},
        "status": {"$in": [ReservationStatus.CHECKED_IN.value, ReservationStatus.CHECKED_OUT.value]}
    }).to_list(1000)
    
    room_nights_sold = len(reservations)  # Simplified
    
    checkins = await db.reservations.count_documents({
        **tenant_filter,
        "checkin_date": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()},
        "status": {"$in": [ReservationStatus.CHECKED_IN.value, ReservationStatus.CHECKED_OUT.value]}
    })
    
    checkouts = await db.reservations.count_documents({
        **tenant_filter,
        "checkout_date": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()},
        "status": ReservationStatus.CHECKED_OUT.value
    })
    
    cancellations = await db.reservations.count_documents({
        **tenant_filter,
        "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()},
        "status": ReservationStatus.CANCELLED.value
    })
    
    no_shows = await db.reservations.count_documents({
        **tenant_filter,
        "checkin_date": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()},
        "status": ReservationStatus.NO_SHOW.value
    })
    
    # Revenue
    pipeline = [
        {"$match": {"tenant_id": user["tenant_id"], "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}, "category": "HABITACION", "status": "ACTIVE"}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "nights": {"$sum": "$quantity"}}}
    ]
    
    room_revenue = 0
    actual_nights = 0
    async for doc in db.charges.aggregate(pipeline):
        room_revenue = doc.get("total", 0)
        actual_nights = doc.get("nights", 0)
    
    occupancy_avg = (room_nights_sold / room_nights_available * 100) if room_nights_available > 0 else 0
    adr = (room_revenue / actual_nights) if actual_nights > 0 else 0
    revpar = (room_revenue / room_nights_available) if room_nights_available > 0 else 0
    
    return {
        "period": {"month": month, "year": year},
        "summary": {
            "occupancy_avg": round(occupancy_avg, 1),
            "room_nights_available": room_nights_available,
            "room_nights_sold": room_nights_sold,
            "checkins": checkins,
            "checkouts": checkouts,
            "cancellations": cancellations,
            "no_shows": no_shows,
            "adr": round(adr, 2),
            "revpar": round(revpar, 2),
            "room_revenue": round(room_revenue, 2)
        }
    }

@api_router.get("/reports/monthly-revenue")
async def get_monthly_revenue_report(month: int = None, year: int = None, user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    
    if not month:
        month = today.month
    if not year:
        year = today.year
    
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)
    
    # Revenue by category
    pipeline_category = [
        {"$match": {"tenant_id": user["tenant_id"], "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}, "status": "ACTIVE"}},
        {"$group": {"_id": "$category", "total": {"$sum": "$total"}}}
    ]
    
    by_category = {}
    async for doc in db.charges.aggregate(pipeline_category):
        by_category[doc["_id"]] = doc.get("total", 0)
    
    # Revenue by payment method
    pipeline_method = [
        {"$match": {"tenant_id": user["tenant_id"], "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}, "status": "ACTIVE"}},
        {"$group": {"_id": "$method", "total": {"$sum": "$amount"}}}
    ]
    
    by_method = {}
    async for doc in db.payments.aggregate(pipeline_method):
        by_method[doc["_id"]] = doc.get("total", 0)
    
    total_charges = sum(by_category.values())
    total_payments = sum(by_method.values())
    
    return {
        "period": {"month": month, "year": year},
        "summary": {
            "total_charges": round(total_charges, 2),
            "total_payments": round(total_payments, 2),
            "rooms_revenue": round(by_category.get("HABITACION", 0), 2),
            "extras_revenue": round(total_charges - by_category.get("HABITACION", 0), 2)
        },
        "by_category": by_category,
        "by_payment_method": by_method
    }

@api_router.get("/reports/monthly-invoicing")
async def get_monthly_invoicing_report(month: int = None, year: int = None, user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    
    if not month:
        month = today.month
    if not year:
        year = today.year
    
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)
    
    # By type
    pipeline_type = [
        {"$match": {"tenant_id": user["tenant_id"], "issued_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}}},
        {"$group": {"_id": "$type", "count": {"$sum": 1}, "total": {"$sum": "$total"}}}
    ]
    
    by_type = {}
    async for doc in db.invoices.aggregate(pipeline_type):
        by_type[doc["_id"]] = {"count": doc.get("count", 0), "total": doc.get("total", 0)}
    
    # By status
    pipeline_status = [
        {"$match": {"tenant_id": user["tenant_id"], "issued_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}, "total": {"$sum": "$total"}}}
    ]
    
    by_status = {}
    async for doc in db.invoices.aggregate(pipeline_status):
        by_status[doc["_id"]] = {"count": doc.get("count", 0), "total": doc.get("total", 0)}
    
    total_invoices = sum(d.get("count", 0) for d in by_type.values())
    total_amount = sum(d.get("total", 0) for d in by_type.values())
    
    return {
        "period": {"month": month, "year": year},
        "summary": {
            "total_invoices": total_invoices,
            "total_amount": round(total_amount, 2)
        },
        "by_type": by_type,
        "by_status": by_status
    }

# ============== EXPORT ENDPOINTS ==============
@api_router.get("/reports/export/excel")
async def export_report_excel(
    report_type: str = Query(..., enum=["occupancy", "revenue", "invoicing"]),
    month: int = None,
    year: int = None,
    user: dict = Depends(get_current_user)
):
    """Export report to Excel"""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    
    today = datetime.now(timezone.utc).date()
    if not month:
        month = today.month
    if not year:
        year = today.year
    
    # Get report data
    if report_type == "occupancy":
        report_data = await get_monthly_occupancy_report(month, year, user)
        filename = f"ocupacion_{year}_{month:02d}.xlsx"
    elif report_type == "revenue":
        report_data = await get_monthly_revenue_report(month, year, user)
        filename = f"ingresos_{year}_{month:02d}.xlsx"
    else:
        report_data = await get_monthly_invoicing_report(month, year, user)
        filename = f"facturacion_{year}_{month:02d}.xlsx"
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Reporte"
    
    # Styles
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Title
    months_es = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    ws.merge_cells('A1:D1')
    ws['A1'] = f"Reporte de {report_type.title()} - {months_es[month]} {year}"
    ws['A1'].font = Font(bold=True, size=14)
    
    ws['A3'] = "Período:"
    ws['B3'] = f"{months_es[month]} {year}"
    
    row = 5
    
    # Summary section
    ws[f'A{row}'] = "Resumen"
    ws[f'A{row}'].font = Font(bold=True, size=12)
    row += 1
    
    summary = report_data.get("summary", {})
    for key, value in summary.items():
        ws[f'A{row}'] = key.replace("_", " ").title()
        ws[f'B{row}'] = f"S/ {value:.2f}" if isinstance(value, float) else value
        ws[f'A{row}'].border = border
        ws[f'B{row}'].border = border
        row += 1
    
    row += 2
    
    # Category breakdown if available
    if "by_category" in report_data:
        ws[f'A{row}'] = "Por Categoría"
        ws[f'A{row}'].font = Font(bold=True, size=12)
        row += 1
        ws[f'A{row}'] = "Categoría"
        ws[f'A{row}'].font = header_font
        ws[f'A{row}'].fill = header_fill
        ws[f'B{row}'] = "Total"
        ws[f'B{row}'].font = header_font
        ws[f'B{row}'].fill = header_fill
        row += 1
        for key, value in report_data["by_category"].items():
            ws[f'A{row}'] = key
            ws[f'B{row}'] = f"S/ {value:.2f}"
            ws[f'A{row}'].border = border
            ws[f'B{row}'].border = border
            row += 1
    
    # Payment method breakdown if available
    if "by_payment_method" in report_data:
        row += 1
        ws[f'A{row}'] = "Por Método de Pago"
        ws[f'A{row}'].font = Font(bold=True, size=12)
        row += 1
        ws[f'A{row}'] = "Método"
        ws[f'A{row}'].font = header_font
        ws[f'A{row}'].fill = header_fill
        ws[f'B{row}'] = "Total"
        ws[f'B{row}'].font = header_font
        ws[f'B{row}'].fill = header_fill
        row += 1
        for key, value in report_data["by_payment_method"].items():
            ws[f'A{row}'] = key
            ws[f'B{row}'] = f"S/ {value:.2f}"
            ws[f'A{row}'].border = border
            ws[f'B{row}'].border = border
            row += 1
    
    # Invoice type breakdown if available
    if "by_type" in report_data:
        row += 1
        ws[f'A{row}'] = "Por Tipo de Comprobante"
        ws[f'A{row}'].font = Font(bold=True, size=12)
        row += 1
        ws[f'A{row}'] = "Tipo"
        ws[f'A{row}'].font = header_font
        ws[f'A{row}'].fill = header_fill
        ws[f'B{row}'] = "Cantidad"
        ws[f'B{row}'].font = header_font
        ws[f'B{row}'].fill = header_fill
        ws[f'C{row}'] = "Total"
        ws[f'C{row}'].font = header_font
        ws[f'C{row}'].fill = header_fill
        row += 1
        for key, data in report_data["by_type"].items():
            ws[f'A{row}'] = key
            ws[f'B{row}'] = data.get("count", 0)
            ws[f'C{row}'] = f"S/ {data.get('total', 0):.2f}"
            ws[f'A{row}'].border = border
            ws[f'B{row}'].border = border
            ws[f'C{row}'].border = border
            row += 1
    
    # Adjust column widths
    ws.column_dimensions['A'].width = 30
    ws.column_dimensions['B'].width = 20
    ws.column_dimensions['C'].width = 20
    
    # Save to bytes
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/reports/export/pdf")
async def export_report_pdf(
    report_type: str = Query(..., enum=["occupancy", "revenue", "invoicing"]),
    month: int = None,
    year: int = None,
    user: dict = Depends(get_current_user)
):
    """Export report to PDF"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    
    today = datetime.now(timezone.utc).date()
    if not month:
        month = today.month
    if not year:
        year = today.year
    
    # Get report data
    if report_type == "occupancy":
        report_data = await get_monthly_occupancy_report(month, year, user)
        title = "Reporte de Ocupación"
        filename = f"ocupacion_{year}_{month:02d}.pdf"
    elif report_type == "revenue":
        report_data = await get_monthly_revenue_report(month, year, user)
        title = "Reporte de Ingresos"
        filename = f"ingresos_{year}_{month:02d}.pdf"
    else:
        report_data = await get_monthly_invoicing_report(month, year, user)
        title = "Reporte de Facturación"
        filename = f"facturacion_{year}_{month:02d}.pdf"
    
    months_es = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=50, leftMargin=50, topMargin=50, bottomMargin=50)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=16, spaceAfter=20)
    subtitle_style = ParagraphStyle('SubTitle', parent=styles['Heading2'], fontSize=12, spaceAfter=10)
    
    elements = []
    
    # Title
    elements.append(Paragraph(f"{title} - {months_es[month]} {year}", title_style))
    elements.append(Spacer(1, 20))
    
    # Summary table
    elements.append(Paragraph("Resumen", subtitle_style))
    summary = report_data.get("summary", {})
    summary_data = [["Métrica", "Valor"]]
    for key, value in summary.items():
        display_value = f"S/ {value:.2f}" if isinstance(value, float) else str(value)
        summary_data.append([key.replace("_", " ").title(), display_value])
    
    summary_table = Table(summary_data, colWidths=[200, 150])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A5F')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWHEIGHTS', (0, 0), (-1, -1), 25),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 30))
    
    # By category if available
    if "by_category" in report_data and report_data["by_category"]:
        elements.append(Paragraph("Por Categoría", subtitle_style))
        cat_data = [["Categoría", "Total"]]
        for key, value in report_data["by_category"].items():
            cat_data.append([key, f"S/ {value:.2f}"])
        cat_table = Table(cat_data, colWidths=[200, 150])
        cat_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A5F')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ROWHEIGHTS', (0, 0), (-1, -1), 22),
        ]))
        elements.append(cat_table)
        elements.append(Spacer(1, 20))
    
    # By payment method if available
    if "by_payment_method" in report_data and report_data["by_payment_method"]:
        elements.append(Paragraph("Por Método de Pago", subtitle_style))
        pm_data = [["Método", "Total"]]
        for key, value in report_data["by_payment_method"].items():
            pm_data.append([key, f"S/ {value:.2f}"])
        pm_table = Table(pm_data, colWidths=[200, 150])
        pm_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A5F')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ROWHEIGHTS', (0, 0), (-1, -1), 22),
        ]))
        elements.append(pm_table)
        elements.append(Spacer(1, 20))
    
    # By type if available (invoicing)
    if "by_type" in report_data and report_data["by_type"]:
        elements.append(Paragraph("Por Tipo de Comprobante", subtitle_style))
        type_data = [["Tipo", "Cantidad", "Total"]]
        for key, data in report_data["by_type"].items():
            type_data.append([key, str(data.get("count", 0)), f"S/ {data.get('total', 0):.2f}"])
        type_table = Table(type_data, colWidths=[150, 100, 100])
        type_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A5F')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ROWHEIGHTS', (0, 0), (-1, -1), 22),
        ]))
        elements.append(type_table)
    
    # Footer
    elements.append(Spacer(1, 40))
    elements.append(Paragraph(f"Generado el: {today.strftime('%d/%m/%Y')}", styles['Normal']))
    
    doc.build(elements)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ============== WALK-IN ENDPOINT ==============
@api_router.post("/reservations/walkin")
async def create_walkin(
    guest_data: GuestCreate,
    room_id: str = Body(...),
    checkout_date: date = Body(...),
    adults: int = Body(1),
    children: int = Body(0),
    notes: str = Body(None),
    user: dict = Depends(get_current_user)
):
    """Create walk-in reservation with immediate check-in"""
    tenant_id = user["tenant_id"]
    
    # Create or get guest
    existing = await db.guests.find_one({"tenant_id": tenant_id, "doc_type": guest_data.doc_type.value, "doc_number": guest_data.doc_number})
    if existing:
        guest_id = str(existing["_id"])
    else:
        guest = {
            **guest_data.model_dump(),
            "doc_type": guest_data.doc_type.value,
            "tenant_id": tenant_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        result = await db.guests.insert_one(guest)
        guest_id = str(result.inserted_id)
    
    # Get room and validate
    room = await db.rooms.find_one({"_id": ObjectId(room_id), "tenant_id": tenant_id})
    if not room:
        raise HTTPException(status_code=404, detail="Habitación no encontrada")
    if room.get("occupancy_status") != OccupancyStatus.VACANT.value:
        raise HTTPException(status_code=400, detail="Habitación no disponible")
    if room.get("housekeeping_status") == HousekeepingStatus.OUT_OF_ORDER.value:
        raise HTTPException(status_code=400, detail="Habitación fuera de servicio")
    
    # Get room type for pricing
    room_type = await db.room_types.find_one({"_id": ObjectId(room.get("room_type_id"))})
    base_price = room_type.get("base_price", 0) if room_type else 0
    
    today = datetime.now(timezone.utc).date()
    nights = (checkout_date - today).days
    if nights < 1:
        raise HTTPException(status_code=400, detail="Fecha de checkout debe ser posterior a hoy")
    
    total_estimated = nights * base_price
    
    # Generate reservation code
    count = await db.reservations.count_documents({"tenant_id": tenant_id})
    code = f"WLK-{count + 1:06d}"
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Create reservation
    reservation = {
        "code": code,
        "tenant_id": tenant_id,
        "guest_id": guest_id,
        "room_type_id": room.get("room_type_id"),
        "room_id": room_id,
        "checkin_date": today.isoformat(),
        "checkout_date": checkout_date.isoformat(),
        "adults": adults,
        "children": children,
        "total_estimated": total_estimated,
        "deposit_amount": 0,
        "source": "WALK-IN",
        "status": ReservationStatus.CHECKED_IN.value,
        "notes": notes,
        "created_by": user["user_id"],
        "created_at": now
    }
    res_result = await db.reservations.insert_one(reservation)
    reservation_id = str(res_result.inserted_id)
    
    # Create stay
    stay = {
        "tenant_id": tenant_id,
        "reservation_id": reservation_id,
        "room_id": room_id,
        "guest_id": guest_id,
        "checkin_at": now,
        "checkout_at": None,
        "status": "ACTIVE",
        "created_by": user["user_id"]
    }
    stay_result = await db.stays.insert_one(stay)
    stay_id = str(stay_result.inserted_id)
    
    # Create folio
    folio = {
        "tenant_id": tenant_id,
        "stay_id": stay_id,
        "reservation_id": reservation_id,
        "status": "OPEN",
        "total_charges": 0,
        "total_payments": 0,
        "balance": 0,
        "created_at": now
    }
    folio_result = await db.folios.insert_one(folio)
    folio_id = str(folio_result.inserted_id)
    
    # Update reservation with stay and folio IDs
    await db.reservations.update_one(
        {"_id": ObjectId(reservation_id)},
        {"$set": {"stay_id": stay_id, "folio_id": folio_id}}
    )
    
    # Update room status
    await db.rooms.update_one(
        {"_id": ObjectId(room_id)},
        {"$set": {"occupancy_status": OccupancyStatus.OCCUPIED.value}}
    )
    
    await create_audit_log(tenant_id, user["user_id"], "reservation", "WALKIN", None, {"code": code, "room": room.get("number")})
    
    return {
        "id": reservation_id,
        "code": code,
        "stay_id": stay_id,
        "folio_id": folio_id,
        "message": "Walk-in registrado exitosamente"
    }

# ============== GROUP RESERVATIONS ==============
@api_router.post("/reservations/group")
async def create_group_reservation(
    data: GroupReservationCreate,
    user: dict = Depends(get_current_user)
):
    """Create a group reservation for multiple rooms"""
    tenant_id = user["tenant_id"]
    
    # Validate dates
    if data.checkin_date >= data.checkout_date:
        raise HTTPException(status_code=400, detail="Fecha de checkout debe ser posterior a checkin")
    
    nights = (data.checkout_date - data.checkin_date).days
    
    # Generate group code
    count = await db.group_reservations.count_documents({"tenant_id": tenant_id})
    group_code = f"GRP-{count + 1:06d}"
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Create group reservation header
    group = {
        "code": group_code,
        "tenant_id": tenant_id,
        "group_name": data.group_name,
        "contact_name": data.contact_name,
        "contact_phone": data.contact_phone,
        "contact_email": data.contact_email,
        "checkin_date": data.checkin_date.isoformat(),
        "checkout_date": data.checkout_date.isoformat(),
        "nights": nights,
        "total_rooms": sum(r.get("quantity", 1) for r in data.rooms),
        "adults": data.adults,
        "children": data.children,
        "deposit_amount": data.deposit_amount,
        "total_estimated": 0,
        "status": "CONFIRMED",
        "notes": data.notes,
        "reservations": [],
        "created_by": user["user_id"],
        "created_at": now
    }
    
    total_estimated = 0
    reservation_ids = []
    
    # Create individual reservations for each room request
    for room_req in data.rooms:
        room_type_id = room_req.get("room_type_id")
        quantity = room_req.get("quantity", 1)
        
        room_type = await db.room_types.find_one({"_id": ObjectId(room_type_id), "tenant_id": tenant_id})
        if not room_type:
            raise HTTPException(status_code=400, detail=f"Tipo de habitación no encontrado: {room_type_id}")
        
        base_price = room_type.get("base_price", 0)
        room_total = nights * base_price
        
        for i in range(quantity):
            res_count = await db.reservations.count_documents({"tenant_id": tenant_id})
            res_code = f"RES-{res_count + 1:06d}"
            
            reservation = {
                "code": res_code,
                "tenant_id": tenant_id,
                "group_code": group_code,
                "guest_id": None,
                "room_type_id": room_type_id,
                "room_id": None,
                "checkin_date": data.checkin_date.isoformat(),
                "checkout_date": data.checkout_date.isoformat(),
                "adults": max(1, data.adults // quantity),
                "children": 0,
                "total_estimated": room_total,
                "deposit_amount": 0,
                "source": "GRUPO",
                "status": ReservationStatus.CONFIRMED.value,
                "notes": f"Grupo: {data.group_name}",
                "created_by": user["user_id"],
                "created_at": now
            }
            res_result = await db.reservations.insert_one(reservation)
            reservation_ids.append(str(res_result.inserted_id))
            total_estimated += room_total
    
    group["reservations"] = reservation_ids
    group["total_estimated"] = total_estimated
    
    result = await db.group_reservations.insert_one(group)
    
    await create_audit_log(tenant_id, user["user_id"], "group_reservation", "CREATE", None, {"code": group_code, "rooms": len(reservation_ids)})
    
    return {
        "id": str(result.inserted_id),
        "code": group_code,
        "reservations_created": len(reservation_ids),
        "total_estimated": total_estimated,
        "message": "Reserva grupal creada exitosamente"
    }

@api_router.get("/reservations/groups")
async def list_group_reservations(
    status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """List all group reservations"""
    tenant_filter = get_tenant_filter(user)
    query = tenant_filter.copy()
    if status:
        query["status"] = status
    
    groups = await db.group_reservations.find(query).sort("created_at", -1).to_list(500)
    return [serialize_doc(g) for g in groups]

@api_router.get("/reservations/groups/{group_id}")
async def get_group_reservation(group_id: str, user: dict = Depends(get_current_user)):
    """Get group reservation with all individual reservations"""
    tenant_filter = get_tenant_filter(user)
    group = await db.group_reservations.find_one({"_id": ObjectId(group_id), **tenant_filter})
    if not group:
        raise HTTPException(status_code=404, detail="Reserva grupal no encontrada")
    
    # Get individual reservations
    reservations = await db.reservations.find({"group_code": group["code"]}).to_list(100)
    
    result = serialize_doc(group)
    result["reservation_details"] = [serialize_doc(r) for r in reservations]
    return result

# ============== EMAIL NOTIFICATIONS ==============
async def send_email_async(to_email: str, subject: str, html_content: str):
    """Send email using Resend (async wrapper)"""
    try:
        import resend
        resend.api_key = os.environ.get("RESEND_API_KEY")
        sender = os.environ.get("SENDER_EMAIL", "noreply@hotelpms.com")
        
        if not resend.api_key:
            logger.warning("RESEND_API_KEY not configured, email not sent")
            return {"status": "skipped", "reason": "API key not configured"}
        
        params = {
            "from": sender,
            "to": [to_email],
            "subject": subject,
            "html": html_content
        }
        
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "sent", "email_id": result.get("id")}
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        return {"status": "error", "error": str(e)}

def generate_email_template(template_type: str, data: dict) -> tuple:
    """Generate email subject and HTML content"""
    tenant_name = data.get("tenant_name", "Hotel")
    
    if template_type == "RESERVATION_CONFIRMATION":
        subject = f"Confirmación de Reserva - {data.get('code', '')}"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1E3A5F; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">{tenant_name}</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
                <h2 style="color: #1E3A5F;">¡Reserva Confirmada!</h2>
                <p>Estimado/a <strong>{data.get('guest_name', 'Huésped')}</strong>,</p>
                <p>Su reserva ha sido confirmada exitosamente.</p>
                
                <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Código de Reserva:</strong> {data.get('code', '')}</p>
                    <p><strong>Check-in:</strong> {data.get('checkin_date', '')} (14:00 hrs)</p>
                    <p><strong>Check-out:</strong> {data.get('checkout_date', '')} (12:00 hrs)</p>
                    <p><strong>Tipo de Habitación:</strong> {data.get('room_type', '')}</p>
                    <p><strong>Total Estimado:</strong> S/ {data.get('total', 0):.2f}</p>
                </div>
                
                <p>¡Le esperamos!</p>
            </div>
            <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
                <p>{tenant_name} - Sistema de Reservas</p>
            </div>
        </div>
        """
    
    elif template_type == "CHECKIN_CONFIRMATION":
        subject = f"Bienvenido - Check-in Confirmado"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #10B981; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">¡Bienvenido!</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
                <h2 style="color: #1E3A5F;">Check-in Realizado</h2>
                <p>Estimado/a <strong>{data.get('guest_name', 'Huésped')}</strong>,</p>
                <p>Su check-in ha sido registrado exitosamente.</p>
                
                <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Habitación:</strong> {data.get('room_number', '')}</p>
                    <p><strong>Piso:</strong> {data.get('floor', '')}</p>
                    <p><strong>Check-out:</strong> {data.get('checkout_date', '')} (12:00 hrs)</p>
                    <p><strong>WiFi:</strong> {tenant_name}_Guest / password123</p>
                </div>
                
                <p>Disfrute su estadía. Para cualquier necesidad, contacte a recepción.</p>
            </div>
        </div>
        """
    
    elif template_type == "CHECKOUT_REMINDER":
        subject = f"Recordatorio de Check-out"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #F59E0B; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">Recordatorio</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
                <h2 style="color: #1E3A5F;">Check-out Mañana</h2>
                <p>Estimado/a <strong>{data.get('guest_name', 'Huésped')}</strong>,</p>
                <p>Le recordamos que su check-out está programado para mañana.</p>
                
                <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Fecha:</strong> {data.get('checkout_date', '')}</p>
                    <p><strong>Hora límite:</strong> 12:00 hrs</p>
                    <p><strong>Habitación:</strong> {data.get('room_number', '')}</p>
                </div>
                
                <p>Por favor, acérquese a recepción antes de su salida para realizar el check-out.</p>
            </div>
        </div>
        """
    
    else:  # PAYMENT_RECEIPT
        subject = f"Comprobante de Pago - {data.get('invoice_number', '')}"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1E3A5F; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">{tenant_name}</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
                <h2 style="color: #1E3A5F;">Comprobante de Pago</h2>
                <p>Estimado/a <strong>{data.get('client_name', 'Cliente')}</strong>,</p>
                
                <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Número:</strong> {data.get('invoice_number', '')}</p>
                    <p><strong>Tipo:</strong> {data.get('invoice_type', 'Boleta')}</p>
                    <p><strong>Fecha:</strong> {data.get('date', '')}</p>
                    <p><strong>Total:</strong> S/ {data.get('total', 0):.2f}</p>
                </div>
                
                <p>Gracias por su preferencia.</p>
            </div>
        </div>
        """
    
    return subject, html

@api_router.post("/notifications/send")
async def send_notification(
    template: EmailTemplate,
    recipient_email: EmailStr = Body(...),
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    """Send email notification using template"""
    # Get tenant info
    tenant = await db.tenants.find_one({"_id": ObjectId(user["tenant_id"])})
    data["tenant_name"] = tenant.get("nombre_comercial", tenant.get("name", "Hotel")) if tenant else "Hotel"
    
    subject, html = generate_email_template(template.value, data)
    result = await send_email_async(recipient_email, subject, html)
    
    # Log notification
    notification_log = {
        "tenant_id": user["tenant_id"],
        "template": template.value,
        "recipient": recipient_email,
        "status": result.get("status"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notification_logs.insert_one(notification_log)
    
    return result

@api_router.get("/notifications/logs")
async def get_notification_logs(
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(require_roles(Role.ADMIN))
):
    """Get notification history"""
    tenant_filter = get_tenant_filter(user)
    logs = await db.notification_logs.find(tenant_filter).sort("created_at", -1).limit(limit).to_list(limit)
    return [serialize_doc(l) for l in logs]

# ============== CALENDAR DATA ENDPOINT ==============
@api_router.get("/calendar/reservations")
async def get_calendar_reservations(
    start_date: date = Query(...),
    end_date: date = Query(...),
    user: dict = Depends(get_current_user)
):
    """Get reservations for calendar view with drag-drop support"""
    tenant_filter = get_tenant_filter(user)
    
    # Get all reservations overlapping with date range
    reservations = await db.reservations.find({
        **tenant_filter,
        "status": {"$in": [ReservationStatus.CONFIRMED.value, ReservationStatus.CHECKED_IN.value]},
        "$or": [
            {"checkin_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}},
            {"checkout_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}},
            {"$and": [
                {"checkin_date": {"$lte": start_date.isoformat()}},
                {"checkout_date": {"$gte": end_date.isoformat()}}
            ]}
        ]
    }).to_list(500)
    
    # Get rooms and guests
    result = []
    for res in reservations:
        room = await db.rooms.find_one({"_id": ObjectId(res["room_id"])}) if res.get("room_id") else None
        guest = await db.guests.find_one({"_id": ObjectId(res["guest_id"])}) if res.get("guest_id") else None
        room_type = await db.room_types.find_one({"_id": ObjectId(res["room_type_id"])}) if res.get("room_type_id") else None
        
        result.append({
            "id": str(res["_id"]),
            "code": res.get("code"),
            "title": guest.get("full_name", "Sin huésped") if guest else "Sin huésped",
            "room_id": res.get("room_id"),
            "room_number": room.get("number") if room else None,
            "room_type": room_type.get("name") if room_type else None,
            "start": res.get("checkin_date"),
            "end": res.get("checkout_date"),
            "status": res.get("status"),
            "color": "#3B82F6" if res.get("status") == ReservationStatus.CONFIRMED.value else "#10B981"
        })
    
    return result

@api_router.put("/calendar/reservations/{reservation_id}/move")
async def move_reservation(
    reservation_id: str,
    new_room_id: str = Body(...),
    new_checkin: date = Body(None),
    new_checkout: date = Body(None),
    user: dict = Depends(get_current_user)
):
    """Move reservation to different room or dates (drag-drop)"""
    tenant_filter = get_tenant_filter(user)
    
    reservation = await db.reservations.find_one({"_id": ObjectId(reservation_id), **tenant_filter})
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    
    # Validate new room
    new_room = await db.rooms.find_one({"_id": ObjectId(new_room_id), **tenant_filter})
    if not new_room:
        raise HTTPException(status_code=404, detail="Habitación no encontrada")
    
    update_data = {"room_id": new_room_id}
    
    if new_checkin:
        update_data["checkin_date"] = new_checkin.isoformat()
    if new_checkout:
        update_data["checkout_date"] = new_checkout.isoformat()
    
    # Check for conflicts
    check_in = new_checkin.isoformat() if new_checkin else reservation.get("checkin_date")
    check_out = new_checkout.isoformat() if new_checkout else reservation.get("checkout_date")
    
    conflict = await db.reservations.find_one({
        "_id": {"$ne": ObjectId(reservation_id)},
        "room_id": new_room_id,
        "status": {"$in": [ReservationStatus.CONFIRMED.value, ReservationStatus.CHECKED_IN.value]},
        "$or": [
            {"checkin_date": {"$lt": check_out}, "checkout_date": {"$gt": check_in}}
        ]
    })
    
    if conflict:
        raise HTTPException(status_code=400, detail="Conflicto con otra reserva en esa habitación")
    
    await db.reservations.update_one(
        {"_id": ObjectId(reservation_id)},
        {"$set": update_data}
    )
    
    await create_audit_log(user["tenant_id"], user["user_id"], "reservation", "MOVE", 
                          {"room_id": reservation.get("room_id")}, 
                          {"room_id": new_room_id, "dates": f"{check_in} - {check_out}"})
    
    return {"message": "Reserva movida exitosamente"}

# ============== SEARCH ENDPOINT ==============
@api_router.get("/search")
async def global_search(q: str = Query(..., min_length=2), user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(user)
    results = {"guests": [], "reservations": [], "rooms": []}
    
    # Search guests
    guests = await db.guests.find({
        **tenant_filter,
        "$or": [
            {"full_name": {"$regex": q, "$options": "i"}},
            {"doc_number": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}}
        ]
    }).limit(10).to_list(10)
    results["guests"] = [serialize_doc(g) for g in guests]
    
    # Search reservations
    reservations = await db.reservations.find({
        **tenant_filter,
        "code": {"$regex": q, "$options": "i"}
    }).limit(10).to_list(10)
    results["reservations"] = [serialize_doc(r) for r in reservations]
    
    # Search rooms
    rooms = await db.rooms.find({
        **tenant_filter,
        "number": {"$regex": q, "$options": "i"}
    }).limit(10).to_list(10)
    results["rooms"] = [serialize_doc(r) for r in rooms]
    
    return results

# ============== AUDIT LOG ENDPOINT ==============
@api_router.get("/audit-logs")
async def list_audit_logs(
    entity: Optional[str] = None,
    action: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    user: dict = Depends(require_roles(Role.ADMIN, Role.SUPER_ADMIN))
):
    tenant_filter = get_tenant_filter(user)
    query = tenant_filter.copy()
    
    if entity:
        query["entity"] = entity
    if action:
        query["action"] = action
    if from_date:
        query["created_at"] = {"$gte": from_date.isoformat()}
    if to_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = to_date.isoformat() + "T23:59:59"
        else:
            query["created_at"] = {"$lte": to_date.isoformat() + "T23:59:59"}
    
    logs = await db.audit_logs.find(query).sort("created_at", -1).to_list(500)
    return [serialize_doc(log) for log in logs]

# ============== SEED DATA ENDPOINT ==============
@api_router.post("/seed")
async def seed_demo_data(user: dict = Depends(require_roles(Role.SUPER_ADMIN))):
    """Create demo tenant with sample data"""
    
    # Check if demo tenant exists
    existing = await db.tenants.find_one({"ruc": "20123456789"})
    if existing:
        return {"message": "Datos demo ya existen", "tenant_id": str(existing["_id"])}
    
    # Create tenant
    tenant = {
        "name": "Hotel Demo",
        "ruc": "20123456789",
        "razon_social": "Hotel Demo S.A.C.",
        "nombre_comercial": "Hotel Demo",
        "direccion": "Av. Principal 123, Lima, Perú",
        "ubigeo": "150101",
        "telefono": "+51 1 234 5678",
        "email": "demo@hoteldemo.com",
        "is_active": True,
        "invoicing_config": {
            "nubefact_ruta": None,
            "nubefact_token": None,
            "invoicing_mode": "MOCK",
            "boleta_series": "B001",
            "boleta_correlative": 1,
            "factura_series": "F001",
            "factura_correlative": 1,
            "igv_rate": 18.0
        },
        "settings": {
            "checkin_time": "14:00",
            "checkout_time": "12:00",
            "timezone": "America/Lima",
            "currency": "PEN"
        },
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    tenant_result = await db.tenants.insert_one(tenant)
    tenant_id = str(tenant_result.inserted_id)
    
    # Create users
    users = [
        {"email": "admin@demo.com", "password_hash": hash_password("admin123"), "full_name": "Admin Demo", "role": "ADMIN", "tenant_id": tenant_id},
        {"email": "recepcion@demo.com", "password_hash": hash_password("recepcion123"), "full_name": "María García", "role": "RECEPTIONIST", "tenant_id": tenant_id},
        {"email": "limpieza@demo.com", "password_hash": hash_password("limpieza123"), "full_name": "Carlos López", "role": "HOUSEKEEPING", "tenant_id": tenant_id}
    ]
    for u in users:
        u["is_active"] = True
        u["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.insert_many(users)
    
    # Create room types
    room_types = [
        {"name": "Estándar", "capacity": 2, "amenities": ["WiFi", "TV", "Aire Acondicionado"], "base_price": 150.00, "tenant_id": tenant_id, "is_active": True},
        {"name": "Superior", "capacity": 2, "amenities": ["WiFi", "TV", "Aire Acondicionado", "Minibar", "Caja Fuerte"], "base_price": 220.00, "tenant_id": tenant_id, "is_active": True},
        {"name": "Suite", "capacity": 4, "amenities": ["WiFi", "TV", "Aire Acondicionado", "Minibar", "Caja Fuerte", "Jacuzzi", "Sala"], "base_price": 350.00, "tenant_id": tenant_id, "is_active": True}
    ]
    rt_results = await db.room_types.insert_many(room_types)
    rt_ids = [str(r) for r in rt_results.inserted_ids]
    
    # Create rooms
    rooms = []
    for floor in range(1, 4):
        for num in range(1, 11):
            room_number = f"{floor}{num:02d}"
            rt_idx = 0 if num <= 6 else (1 if num <= 9 else 2)
            rooms.append({
                "number": room_number,
                "floor": floor,
                "room_type_id": rt_ids[rt_idx],
                "tenant_id": tenant_id,
                "occupancy_status": "VACANT",
                "housekeeping_status": "CLEAN",
                "notes": None,
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    await db.rooms.insert_many(rooms)
    
    # Create products
    products = [
        {"name": "Minibar - Agua", "category": "MINIBAR", "unit_price": 5.00, "tax_type": "IGV"},
        {"name": "Minibar - Gaseosa", "category": "MINIBAR", "unit_price": 8.00, "tax_type": "IGV"},
        {"name": "Minibar - Cerveza", "category": "MINIBAR", "unit_price": 12.00, "tax_type": "IGV"},
        {"name": "Lavandería - Camisa", "category": "LAVANDERIA", "unit_price": 15.00, "tax_type": "IGV"},
        {"name": "Lavandería - Pantalón", "category": "LAVANDERIA", "unit_price": 18.00, "tax_type": "IGV"},
        {"name": "Late Checkout", "category": "SERVICIOS", "unit_price": 50.00, "tax_type": "IGV"},
        {"name": "Early Checkin", "category": "SERVICIOS", "unit_price": 50.00, "tax_type": "IGV"},
        {"name": "Daño - Toalla", "category": "DANOS", "unit_price": 25.00, "tax_type": "IGV"}
    ]
    for p in products:
        p["tenant_id"] = tenant_id
        p["is_active"] = True
        p["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.products.insert_many(products)
    
    return {"message": "Datos demo creados exitosamente", "tenant_id": tenant_id, "credentials": {"admin": "admin@demo.com / admin123", "recepcion": "recepcion@demo.com / recepcion123", "limpieza": "limpieza@demo.com / limpieza123"}}

# Initial setup endpoint (only works when no users exist)
@api_router.post("/setup")
async def initial_setup():
    """Create super admin - only works if no users exist"""
    user_count = await db.users.count_documents({})
    if user_count > 0:
        raise HTTPException(status_code=400, detail="Sistema ya inicializado. Use /seed con credenciales de Super Admin")
    
    # Create super admin
    super_admin = {
        "email": "superadmin@sistema.com",
        "password_hash": hash_password("superadmin123"),
        "full_name": "Super Administrador",
        "role": Role.SUPER_ADMIN.value,
        "tenant_id": None,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(super_admin)
    
    return {
        "message": "Super Admin creado exitosamente",
        "credentials": {
            "email": "superadmin@sistema.com",
            "password": "superadmin123"
        }
    }

# Root endpoint
@api_router.get("/")
async def root():
    return {"message": "Hotel PMS API v1.0", "status": "running"}

# Health check
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include router
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
