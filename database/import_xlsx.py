#!/usr/bin/env python3
"""
Convert SUGARCANE_FARMER_DATABASE.xlsx into the JSON seed files used by
backend/scripts/seed.js.

* Passwords are bcrypt-hashed HERE so no plaintext password ever lands in the repo.
* Formula columns in the workbook (Fields.Soil_pH / Soil_EC, Yield_Tonnes...) are
  recomputed from Crop_Records instead of trusting cached values.
* Field latitude / longitude / irrigation method are derived from that field's crop records.

Usage:
    pip install pandas openpyxl bcrypt
    python database/import_xlsx.py path/to/SUGARCANE_FARMER_DATABASE.xlsx
"""
import json
import math
import sys
from pathlib import Path

import bcrypt
import pandas as pd

OUT = Path(__file__).resolve().parent.parent / "backend" / "seed-data"


def clean(v):
    """Convert pandas/numpy values to JSON-safe python values (NaN → None)."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, pd.Timestamp):
        return None if pd.isna(v) else v.isoformat()
    if hasattr(v, "item"):
        v = v.item()
        if isinstance(v, float) and math.isnan(v):
            return None
    return v


def rnd(v, n=2):
    v = clean(v)
    return None if v is None else round(float(v), n)


def main(xlsx):
    sheets = pd.read_excel(xlsx, sheet_name=None)
    farmers, fields, crops = sheets["Farmers"], sheets["Fields"], sheets["Crop_Records"]
    OUT.mkdir(parents=True, exist_ok=True)

    # ---------------- farmers ----------------
    out_farmers = []
    for _, r in farmers.iterrows():
        pw = str(r["Farmer_Password"]).encode()
        out_farmers.append({
            "farmer_id": r["Farmer_ID"],
            "name": r["Farmer_Name"],
            "email": r["Farmer_Email"].lower(),
            "phone": str(int(r["Phone_Number"])),
            "password_hash": bcrypt.hashpw(pw, bcrypt.gensalt(10)).decode(),
            "age": clean(r["Age"]),
            "gender": r["Gender"],
            "village": r["Village"],
            "district": r["District"],
            "state": r["State"],
            "created_at": clean(r["Account_Created_Date"]),
        })

    # ---------------- per-field aggregates from crop records ----------------
    agg = crops.groupby("Field_ID").agg(
        soil_ph=("Source_Soil_pH", "mean"),
        soil_ec=("Source_EC", "mean"),
        lat=("Latitude", "mean"),
        lon=("Longitude", "mean"),
        moisture=("Soil_Moisture_%", "mean"),
        temp=("Temperature_Avg", "mean"),
        humidity=("Humidity", "mean"),
    )
    irr_mode = crops.dropna(subset=["Irrigation_Method"]).groupby("Field_ID")["Irrigation_Method"] \
        .agg(lambda s: s.mode().iat[0])

    out_fields = []
    for _, r in fields.iterrows():
        fid = r["Field_ID"]
        a = agg.loc[fid] if fid in agg.index else None
        out_fields.append({
            "field_id": fid,
            "farmer_id": r["Farmer_ID"],
            "field_name": f"Khasra {int(r['Khasra_No'])}",
            "khasra_no": int(r["Khasra_No"]),
            "area_acres": rnd(r["Field_Area_Acres"]),
            "soil_type": r["Soil_Type"],
            "soil_ph": rnd(a["soil_ph"]) if a is not None else None,
            "soil_ec": rnd(a["soil_ec"]) if a is not None else None,
            "ownership_type": r["Ownership_Type"],
            "irrigation_method": irr_mode.get(fid, "Flood"),
            "village": r["Village"],
            "latitude": rnd(a["lat"], 6) if a is not None else None,
            "longitude": rnd(a["lon"], 6) if a is not None else None,
            # baselines used only by the sensor-data synthesiser
            "_baseline": {
                "moisture": rnd(a["moisture"]) if a is not None else 25,
                "temp": rnd(a["temp"]) if a is not None else 28,
                "humidity": rnd(a["humidity"]) if a is not None else 70,
            },
        })

    # ---------------- crop records ----------------
    def d(v):
        v = clean(v)
        return v[:10] if isinstance(v, str) else None

    out_crops = []
    for _, r in crops.iterrows():
        plant, harvest = d(r["Planting_Date"]), d(r["Harvesting_Date"])
        if plant and harvest and harvest < plant:  # source data has a few inverted dates
            plant, harvest = harvest, plant
        yr = clean(r["Year"])
        out_crops.append({
            "record_id": r["Record_ID"],
            "field_id": r["Field_ID"],
            "season_year": int(yr) if yr is not None else None,
            "season": clean(r["Season"]),
            "variety": clean(r["Variety"]),
            "planting_date": plant,
            "harvesting_date": harvest,
            "growth_stage": clean(r["Growth_Stage"]),
            "yield_q_per_acre": rnd(r["Yield_Quintal_per_Acre"]),
            "temperature_avg": rnd(r["Temperature_Avg"]),
            "humidity": rnd(r["Humidity"]),
            "rainfall_total_mm": rnd(r["Rainfall_Total"], 1),
            "soil_moisture_pct": rnd(r["Soil_Moisture_%"]),
            "soil_ph": rnd(r["Source_Soil_pH"]),
            "soil_ec": rnd(r["Source_EC"]),
            "nitrogen_kg_acre": rnd(r["Nitrogen_kg_per_acre"]),
            "phosphorus_kg_acre": rnd(r["Phosphorus_kg_per_acre"]),
            "potassium_kg_acre": rnd(r["Potassium_kg_per_acre"]),
            "fertilizer_type": clean(r["Fertilizer_Type"]),
            "fertilizer_qty": rnd(r["Fertilizer_Quantity"]),
            "irrigation_method": clean(r["Irrigation_Method"]),
            "water_l_per_acre": rnd(r["Water_Quantity_liters_per_acre"], 1),
            "disease_type": clean(r["Disease_Type"]),
            "disease_severity": clean(r["Disease_Severity"]),
            "pest_level": clean(r["Pest_Level"]),
            "brix_value": rnd(r["Brix_Value"]),
        })

    for name, data in [("farmers", out_farmers), ("fields", out_fields), ("crop_records", out_crops)]:
        (OUT / f"{name}.json").write_text(json.dumps(data, indent=0, ensure_ascii=False))
        print(f"wrote {len(data):>5} {name}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
