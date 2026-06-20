from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, CategoryRule
from app.schemas import (
    CategoryCreate,
    CategoryRead,
    CategoryRuleCreate,
    CategoryRuleRead,
)

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
def list_categories(db: Session = Depends(get_db)):
    return db.query(Category).order_by(Category.name).all()


@router.post("", response_model=CategoryRead, status_code=201)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    existing = db.query(Category).filter(Category.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Category already exists")
    category = Category(
        name=payload.name,
        exclude_from_charts=payload.exclude_from_charts,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/rules", response_model=list[CategoryRuleRead])
def list_rules(db: Session = Depends(get_db)):
    return db.query(CategoryRule).order_by(CategoryRule.id).all()


@router.post("/rules", response_model=CategoryRuleRead, status_code=201)
def create_rule(payload: CategoryRuleCreate, db: Session = Depends(get_db)):
    category = db.get(Category, payload.category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    rule = CategoryRule(
        pattern=payload.pattern,
        category_id=payload.category_id,
        is_regex=payload.is_regex,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule
